import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, paginated, parseBody, parsePagination, parseQuery } from '../../lib/http.js';
import { notFound } from '../../lib/errors.js';
import { distanceKm } from '../../lib/utils.js';
import { requireCustomer } from '../../middleware/auth.js';
import { buildQuote, validatePromotion } from '../../services/pricing.js';
import { cancellation, loadOrder, orderInclude, serializeOrder, trackingSteps } from '../../services/orders.js';
import { createOrder, customerCancelOrder, rateOrder, statusWhere } from './orders.service.js';
import { getSettings } from '../../services/settings.js';

/** Customer-facing order endpoints (customer app). */
export const ordersRouter = Router();
ordersRouter.use(requireCustomer);

const itemsSchema = z.array(z.object({ code: z.string().min(1), quantity: z.number().positive() })).min(1);
const inlineAddress = z.object({
  line1: z.string().min(3),
  line2: z.string().optional(),
  landmark: z.string().optional(),
  city: z.string().min(2),
  state: z.string().optional(),
  pincode: z.string().regex(/^\d{6}$/),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

ordersRouter.post(
  '/quote',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({ items: itemsSchema, isExpress: z.boolean().optional(), pickupDate: z.coerce.date().optional(), promoCode: z.string().optional() }),
      req.body,
    );
    res.json(await buildQuote({ ...body, pickupDate: body.pickupDate ?? new Date(), customerId: req.user!.customerId }));
  }),
);

ordersRouter.post(
  '/validate-coupon',
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ code: z.string().min(2), items: itemsSchema, isExpress: z.boolean().optional() }), req.body);
    const quote = await buildQuote({ items: body.items, isExpress: body.isExpress, pickupDate: new Date() });
    const result = await validatePromotion(body.code, { subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, customerId: req.user!.customerId });
    if ('error' in result) res.status(422).json({ valid: false, message: result.error, error: { code: 'INVALID_COUPON', message: result.error } });
    else res.json({ valid: true, code: result.promo.code, title: result.promo.title, discount: result.discount, total: Math.max(0, quote.total - result.discount) });
  }),
);

ordersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z
        .object({
          items: itemsSchema,
          addressId: z.string().optional(),
          address: inlineAddress.optional(),
          pickupDate: z.coerce.date(),
          pickupSlot: z.string().min(2).max(30),
          isExpress: z.boolean().optional(),
          promoCode: z.string().optional(),
          paymentMethod: z.enum(['UPI', 'CARD', 'COD', 'WALLET']).default('COD'),
          notes: z.string().max(500).optional(),
        })
        .refine((b) => b.addressId || b.address, { message: 'addressId or address is required', path: ['addressId'] }),
      req.body,
    );
    const order = await createOrder({ ...body, customerId: req.user!.customerId!, actorUserId: req.user!.id });
    res.status(201).json(serializeOrder(order, 'customer'));
  }),
);

ordersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(['active', 'completed', 'cancelled', 'all']).default('all') }), req.query);
    const p = parsePagination(req.query);
    const where = { customerId: req.user!.customerId, ...statusWhere(q.status) };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.order.count({ where }),
    ]);
    res.json(paginated(orders.map((o) => serializeOrder(o, 'customer')), total, p));
  }),
);

ordersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await loadOrder(req.params.id!);
    if (order.customerId !== req.user!.customerId) throw notFound('Order');
    res.json(serializeOrder(order, 'customer'));
  }),
);

/**
 * Live tracking for the order-tracking screen's map.
 *
 * `map` carries everything needed to draw it in one call: the customer's pin,
 * the rider's last reported position, the shop, and which leg is moving. The
 * app should draw this once, then follow the `rider:location` socket event on
 * the `order:<id>` room for movement (the rider app posts every few seconds)
 * and `order:updated` for status changes.
 */
ordersRouter.get(
  '/:id/track',
  asyncHandler(async (req, res) => {
    const order = await loadOrder(req.params.id!);
    if (order.customerId !== req.user!.customerId) throw notFound('Order');
    const s = serializeOrder(order, 'customer');
    const cancel = cancellation(order);

    const leg = ['READY', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status) ? 'DELIVERY' : 'PICKUP';
    const rider = leg === 'DELIVERY' ? (order.deliveryRider ?? order.pickupRider) : order.pickupRider;
    const riderPoint = rider?.currentLat != null && rider.currentLng != null ? { lat: rider.currentLat, lng: rider.currentLng, updatedAt: rider.lastLocationAt } : null;
    const customerPoint = order.addressLat != null && order.addressLng != null ? { lat: order.addressLat, lng: order.addressLng } : null;
    // on the pickup leg the rider is heading to the customer; after that, to the shop and back
    const destination = leg === 'PICKUP' ? customerPoint : customerPoint;
    const etaMinutes =
      riderPoint && destination
        ? Math.max(1, Math.round((distanceKm(riderPoint.lat, riderPoint.lng, destination.lat, destination.lng) / 18) * 60))
        : null;

    res.json({
      id: s.id,
      orderNumber: s.orderNumber,
      status: s.status,
      statusLabel: s.statusLabel,
      tracking: trackingSteps(order.status),
      rider: s.rider,
      deliveryEta: s.deliveryEta,
      otps: { pickup: order.customerPickupOtp, delivery: order.customerDeliveryOtp },
      canCancel: cancel.canCancel,
      cancelBlockedReason: cancel.reason,
      map: {
        /** true once a rider is moving and we have a fix on them */
        live: Boolean(riderPoint) && !['DELIVERED', 'CANCELLED'].includes(order.status),
        leg,
        customer: customerPoint,
        riderPosition: riderPoint,
        riderArrived: Boolean(leg === 'PICKUP' ? order.pickupArrivedAt : order.deliveryArrivedAt),
        vendor: order.vendor?.latitude != null && order.vendor.longitude != null ? { lat: order.vendor.latitude, lng: order.vendor.longitude, name: order.vendor.shopName } : null,
        etaMinutes,
        /** follow these on the socket instead of polling this endpoint */
        socket: { room: `order:${order.id}`, events: ['rider:location', 'order:updated'] },
      },
      events: s.events,
    });
  }),
);

/** Invoice as JSON (render/share in-app; see README for PDF). */
ordersRouter.get(
  '/:id/invoice',
  asyncHandler(async (req, res) => {
    const o = await loadOrder(req.params.id!);
    if (o.customerId !== req.user!.customerId) throw notFound('Order');
    const settings = await getSettings();
    res.json({
      invoiceNumber: `INV-${o.orderNumber}`,
      orderNumber: o.orderNumber,
      issuedAt: o.deliveredAt ?? o.createdAt,
      seller: { name: settings.brandName, supportEmail: settings.supportEmail, supportPhone: settings.supportPhone },
      billedTo: { name: o.customer.user.name, phone: o.customer.user.phone, address: o.addressLine },
      partner: o.vendor ? { name: o.vendor.shopName, address: o.vendor.shopAddress } : null,
      lines: o.items.map((i) => ({ description: `${i.name} (${i.serviceName})`, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, amount: i.lineTotal })),
      summary: { subtotal: o.subtotal, surcharge: o.surcharge, deliveryFee: o.deliveryFee, discount: o.discount, promoCode: o.promoCode, tax: o.tax, total: o.total },
      payment: { method: o.paymentMethod, status: o.paymentStatus },
      weights: { estimatedKg: o.estimatedWeightKg, actualKg: o.actualWeightKg },
      status: o.status,
    });
  }),
);

/** Prefill the cart from a past order ("Reorder"). */
ordersRouter.post(
  '/:id/reorder',
  asyncHandler(async (req, res) => {
    const o = await loadOrder(req.params.id!);
    if (o.customerId !== req.user!.customerId) throw notFound('Order');
    const codes = await prisma.catalogItem.findMany({ where: { id: { in: o.items.map((i) => i.catalogItemId).filter((x): x is string => !!x) }, isActive: true } });
    const items = o.items
      .map((i) => {
        const c = codes.find((c) => c.id === i.catalogItemId);
        return c ? { code: c.code, name: c.name, quantity: i.quantity, currentPrice: c.price } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const quote = items.length ? await buildQuote({ items: items.map((i) => ({ code: i.code, quantity: i.quantity })), pickupDate: new Date(), customerId: req.user!.customerId }) : null;
    res.json({ items, addressId: o.addressId, isExpress: o.isExpress, unavailable: o.items.length - items.length, quote });
  }),
);

ordersRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const { reason } = parseBody(z.object({ reason: z.string().max(300).optional() }), req.body ?? {});
    const order = await customerCancelOrder(req.params.id!, req.user!.customerId!, reason);
    res.json(serializeOrder(order, 'customer'));
  }),
);

ordersRouter.post(
  '/:id/rate',
  asyncHandler(async (req, res) => {
    const { rating, comment } = parseBody(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() }), req.body);
    const order = await rateOrder(req.params.id!, req.user!.customerId!, rating, comment);
    res.json(serializeOrder(order, 'customer'));
  }),
);
