import { Router } from 'express';
import { z } from 'zod';
import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, paginated, parseBody, parsePagination, parseQuery } from '../../lib/http.js';
import { badRequest, notFound } from '../../lib/errors.js';
import dayjs from 'dayjs';
import { compact, normalizePhone, randomDigits, referralCode, round2 } from '../../lib/utils.js';
import { nextId } from '../../lib/ids.js';
import { getSettings } from '../../services/settings.js';
import { riderLegPayout } from '../../services/pricing.js';
import { addEvent, broadcastOrder, loadOrder, orderInclude, serializeOrder, STATUS_LABEL, transitionOrder } from '../../services/orders.js';
import { assignRider, offerLeg } from '../../services/dispatch.js';
import { notifyUser } from '../../services/notifications.js';
import { createOrder } from '../orders/orders.service.js';

export const adminOrdersRouter = Router();


adminOrdersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseQuery(
      z.object({
        status: z.string().optional(),
        search: z.string().optional(),
        vendorId: z.string().optional(),
        riderId: z.string().optional(),
        customerId: z.string().optional(),
        paymentStatus: z.enum(['PENDING', 'PAID', 'REFUNDED', 'FAILED']).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        active: z.enum(['true', 'false']).optional(),
      }),
      req.query,
    );
    const p = parsePagination(req.query);
    const statuses = q.status
      ? (q.status.split(',').map((s) => s.trim().toUpperCase().replace(/ /g, '_')).filter((s) => s in STATUS_LABEL) as OrderStatus[])
      : undefined;
    const where: Prisma.OrderWhereInput = {
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(q.active === 'true' ? { status: { notIn: ['DELIVERED', 'CANCELLED'] } } : {}),
      ...(q.vendorId ? { vendorId: q.vendorId } : {}),
      ...(q.riderId ? { OR: [{ pickupRiderId: q.riderId }, { deliveryRiderId: q.riderId }] } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
      ...(q.from || q.to ? { createdAt: { gte: q.from, lte: q.to } } : {}),
      ...(q.search
        ? {
            OR: [
              { orderNumber: { contains: q.search.replace(/^#/, ''), mode: 'insensitive' } },
              { customer: { user: { name: { contains: q.search, mode: 'insensitive' } } } },
              { customer: { user: { phone: { contains: q.search.replace(/\s/g, '') } } } },
              { vendor: { shopName: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.order.count({ where }),
    ]);
    res.json(paginated(orders.map((o) => serializeOrder(o, 'admin')), total, p));
  }),
);

const PAY_METHOD: Record<string, 'UPI' | 'CARD' | 'COD' | 'WALLET'> = { upi: 'UPI', card: 'CARD', cod: 'COD', cash: 'COD', wallet: 'WALLET' };
const PAY_STATUS: Record<string, 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED'> = { pending: 'PENDING', paid: 'PAID', refunded: 'REFUNDED', failed: 'FAILED' };
const payMethodIn = z.string().transform((v, ctx) => {
  const m = PAY_METHOD[v.toLowerCase()];
  if (!m) ctx.addIssue({ code: 'custom', message: 'paymentMethod must be UPI, Card, COD or Wallet' });
  return m!;
});
const payStatusIn = z.string().transform((v, ctx) => {
  const m = PAY_STATUS[v.toLowerCase()];
  if (!m) ctx.addIssue({ code: 'custom', message: 'paymentStatus must be Pending, Paid, Refunded or Failed' });
  return m!;
});
/** Accepts enum keys or the panel labels ("Pending Pickup", "Out for Delivery"). */
const statusIn = z.string().transform((v, ctx) => {
  const key = v.toUpperCase().replace(/ /g, '_') as OrderStatus;
  if (!(key in STATUS_LABEL)) ctx.addIssue({ code: 'custom', message: `Unknown status ${v}` });
  return key;
});
/** "Today, 10:00 AM" style strings from the panel fall back to now; ISO dates parse normally. */
const looseDate = z.union([z.coerce.date(), z.string()]).transform((v) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : new Date()));

async function findCustomerOrCreate(name: string, phoneInput: string, email?: string) {
  const phone = normalizePhone(phoneInput);
  const user =
    (await prisma.user.findUnique({ where: { phone_role: { phone, role: 'CUSTOMER' } }, include: { customer: true } })) ??
    (await prisma.user.create({
      data: { role: 'CUSTOMER', phone, name, email, customer: { create: { referralCode: referralCode(name) } } },
      include: { customer: true },
    }));
  return user.customer!;
}

async function findVendorByName(name?: string, id?: string) {
  if (id) return prisma.vendor.findUnique({ where: { id } });
  if (!name) return null;
  return prisma.vendor.findFirst({ where: { shopName: { equals: name, mode: 'insensitive' } } });
}
async function findRiderByName(name?: string, id?: string) {
  if (id) return prisma.rider.findUnique({ where: { id } });
  if (!name || /^unassigned$/i.test(name)) return null;
  return prisma.rider.findFirst({ where: { user: { name: { equals: name, mode: 'insensitive' } } } });
}

/**
 * Admin creates an order. Two modes:
 *  - catalog mode: `items:[{code,quantity}]` -> priced server-side exactly like the app.
 *  - manual mode (admin panel OrderModal): `serviceName, itemsCount, itemDetails, amount` free-form.
 */
adminOrdersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        customerId: z.string().optional(),
        customer: z.object({ name: z.string().min(2), phone: z.string().min(10), email: z.string().email().optional() }).optional(),
        customerName: z.string().optional(),
        customerPhone: z.string().optional(),
        customerAddress: z.string().optional(),
        items: z.array(z.object({ code: z.string(), quantity: z.number().positive() })).optional(),
        serviceName: z.string().optional(),
        itemsCount: z.number().int().positive().optional(),
        itemDetails: z.string().optional(),
        amount: z.number().nonnegative().optional(),
        address: z.object({ line1: z.string().min(3), line2: z.string().optional(), landmark: z.string().optional(), city: z.string().min(2), state: z.string().optional(), pincode: z.string().regex(/^\d{6}$/), lat: z.number().optional(), lng: z.number().optional() }).optional(),
        addressId: z.string().optional(),
        pickupDate: looseDate.default(() => new Date()),
        pickupSlot: z.string().default('10-12 PM'),
        deliveryDate: looseDate.optional(),
        isExpress: z.boolean().optional(),
        promoCode: z.string().optional(),
        paymentMethod: payMethodIn.default('COD'),
        paymentStatus: payStatusIn.optional(),
        status: statusIn.optional(),
        notes: z.string().optional(),
        vendorId: z.string().optional(),
        partnerName: z.string().optional(),
        riderId: z.string().optional(),
        riderName: z.string().optional(),
      }),
      req.body,
    );

    // resolve customer
    let customerId = body.customerId;
    if (!customerId) {
      const name = body.customer?.name ?? body.customerName;
      const phone = body.customer?.phone ?? body.customerPhone;
      if (!name || !phone) throw badRequest('customerId, or customer name + phone, is required');
      customerId = (await findCustomerOrCreate(name, phone, body.customer?.email)).id;
    }
    const vendor = await findVendorByName(body.partnerName, body.vendorId);

    // ---- catalog mode
    if (body.items?.length) {
      const order = await createOrder({
        customerId,
        items: body.items,
        addressId: body.addressId,
        address: body.address ?? (body.customerAddress ? { line1: body.customerAddress, city: 'N/A', pincode: '000000' } : undefined),
        pickupDate: body.pickupDate,
        pickupSlot: body.pickupSlot,
        isExpress: body.isExpress,
        promoCode: body.promoCode,
        paymentMethod: body.paymentMethod,
        notes: body.notes,
        vendorId: vendor?.id,
        actorUserId: req.user!.id,
      });
      res.status(201).json(serializeOrder(order, 'admin'));
      return;
    }

    // ---- manual mode
    if (body.amount == null || !body.serviceName) throw badRequest('Provide items[] (catalog mode) or serviceName + amount (manual mode)');
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, include: { addresses: { where: { isDefault: true }, take: 1 } } });
    if (!customer) throw notFound('Customer');
    const addr = customer.addresses[0];
    const addressLine = body.customerAddress ?? body.address?.line1 ?? (addr ? [addr.line1, addr.line2, addr.city, addr.pincode].filter(Boolean).join(', ') : '');
    if (!addressLine) throw badRequest('customerAddress is required');
    const settings = await getSettings();
    const commission = vendor?.commissionRate ?? settings.vendorCommissionRate;
    const vendorEarning = round2(body.amount * (1 - commission / 100));
    const rider = await findRiderByName(body.riderName, body.riderId);
    const status = body.status ?? (rider ? 'ASSIGNED' : 'PENDING_PICKUP');
    const pickupPayout = rider ? await riderLegPayout(null) : 0;

    const created = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          orderNumber: await nextId('YD', tx),
          customerId,
          addressId: addr?.id,
          vendorId: vendor?.id,
          vendorAcceptedAt: vendor ? new Date() : null,
          pickupRiderId: rider?.id,
          addressLine,
          addressLat: addr?.lat,
          addressLng: addr?.lng,
          pincode: addr?.pincode,
          city: addr?.city,
          pickupDate: body.pickupDate,
          pickupSlot: body.pickupSlot,
          deliveryEta: body.deliveryDate ?? dayjs(body.pickupDate).add(24, 'hour').toDate(),
          isExpress: Boolean(body.isExpress),
          notes: body.notes,
          serviceSummary: body.serviceName!,
          itemsCount: body.itemsCount ?? 1,
          itemsDescription: body.itemDetails ?? `${body.itemsCount ?? 1} items • ${body.serviceName}`,
          subtotal: body.amount!,
          total: body.amount!,
          paymentMethod: body.paymentMethod,
          paymentStatus: body.paymentStatus ?? (body.paymentMethod === 'COD' ? 'PENDING' : 'PAID'),
          vendorEarning,
          platformCommission: round2(body.amount! - vendorEarning),
          riderPickupPayout: pickupPayout,
          status,
          customerPickupOtp: randomDigits(4),
          vendorDropOtp: randomDigits(4),
          vendorHandoverOtp: randomDigits(4),
          customerDeliveryOtp: randomDigits(4),
        },
      });
      await addEvent(tx, o.id, { type: 'STATUS_CHANGE', status, title: 'Order created by admin', description: `${body.serviceName} • ₹${body.amount}`, actorUserId: req.user!.id });
      return o;
    });
    if (rider) await notifyUser(rider.userId, { title: 'New assignment', message: `Order ${created.orderNumber} assigned to you`, type: 'ORDER', data: { orderId: created.id } });
    res.status(201).json(serializeOrder(await broadcastOrder(created.id), 'admin'));
  }),
);

adminOrdersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await loadOrder(req.params.id!);
    const requests = await prisma.pickupRequest.findMany({ where: { orderId: order.id }, include: { rider: { include: { user: { select: { name: true } } } } }, orderBy: { offeredAt: 'desc' } });
    res.json({ ...serializeOrder(order, 'admin'), pickupRequests: requests.map((r) => ({ id: r.id, leg: r.leg, status: r.status, riderName: r.rider.user.name, payout: r.payout, offeredAt: r.offeredAt, expiresAt: r.expiresAt, respondedAt: r.respondedAt })) });
  }),
);

adminOrdersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        notes: z.string().optional(),
        pickupDate: looseDate.optional(),
        pickupSlot: z.string().optional(),
        deliveryEta: looseDate.optional(),
        deliveryDate: looseDate.optional(),
        paymentStatus: payStatusIn.optional(),
        paymentMethod: payMethodIn.optional(),
        addressLine: z.string().optional(),
        customerAddress: z.string().optional(),
        serviceName: z.string().optional(),
        itemsCount: z.number().int().positive().optional(),
        itemDetails: z.string().optional(),
        amount: z.number().nonnegative().optional(),
        partnerName: z.string().optional(),
        vendorId: z.string().optional(),
        riderName: z.string().optional(),
        riderId: z.string().optional(),
        status: statusIn.optional(),
      }),
      req.body,
    );
    const order = await loadOrder(req.params.id!);
    const vendor = body.partnerName || body.vendorId ? await findVendorByName(body.partnerName, body.vendorId) : undefined;
    const rider = body.riderName || body.riderId ? await findRiderByName(body.riderName, body.riderId) : undefined;

    let money: Record<string, number> = {};
    if (body.amount != null) {
      const settings = await getSettings();
      const commission = vendor?.commissionRate ?? (order.vendorId ? (await prisma.vendor.findUnique({ where: { id: order.vendorId } }))?.commissionRate : undefined) ?? settings.vendorCommissionRate;
      const vendorEarning = round2(body.amount * (1 - commission / 100));
      money = { subtotal: body.amount, total: body.amount, vendorEarning, platformCommission: round2(body.amount - vendorEarning) };
    }
    await prisma.order.update({
      where: { id: order.id },
      data: compact({
        notes: body.notes,
        pickupDate: body.pickupDate,
        pickupSlot: body.pickupSlot,
        deliveryEta: body.deliveryEta ?? body.deliveryDate,
        paymentStatus: body.paymentStatus,
        paymentMethod: body.paymentMethod,
        addressLine: body.addressLine ?? body.customerAddress,
        serviceSummary: body.serviceName,
        itemsCount: body.itemsCount,
        itemsDescription: body.itemDetails,
        vendorId: vendor === undefined ? undefined : vendor?.id ?? null,
        pickupRiderId: rider === undefined ? undefined : rider?.id ?? null,
        ...money,
      }),
    });
    await addEvent(prisma, order.id, { type: 'ADMIN_EDIT', title: 'Order updated by admin', actorUserId: req.user!.id, meta: body as never });
    if (body.status && body.status !== order.status) await transitionOrder(order.id, body.status, { actorUserId: req.user!.id, force: true });
    res.json(serializeOrder(await broadcastOrder(order.id), 'admin'));
  }),
);

adminOrdersRouter.post(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status, reason, force } = parseBody(z.object({ status: statusIn, reason: z.string().optional(), force: z.boolean().default(true) }), req.body);
    const order = await loadOrder(req.params.id!);
    const updated = await transitionOrder(order.id, status, { actorUserId: req.user!.id, force, reason });
    res.json(serializeOrder(updated, 'admin'));
  }),
);

adminOrdersRouter.post(
  '/:id/assign-rider',
  asyncHandler(async (req, res) => {
    const { riderId, leg } = parseBody(z.object({ riderId: z.string(), leg: z.enum(['PICKUP', 'DELIVERY']).optional() }), req.body);
    const order = await loadOrder(req.params.id!);
    const resolvedLeg = leg ?? (['READY', 'OUT_FOR_DELIVERY'].includes(order.status) ? 'DELIVERY' : 'PICKUP');
    const updated = await assignRider(order.id, riderId, resolvedLeg, req.user!.id);
    res.json(serializeOrder(updated, 'admin'));
  }),
);

adminOrdersRouter.post(
  '/:id/assign-vendor',
  asyncHandler(async (req, res) => {
    const { vendorId } = parseBody(z.object({ vendorId: z.string() }), req.body);
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw notFound('Vendor');
    const order = await loadOrder(req.params.id!);
    await prisma.order.update({ where: { id: order.id }, data: { vendorId, vendorAcceptedAt: null } });
    await addEvent(prisma, order.id, { type: 'VENDOR_ASSIGNED', title: 'Laundry partner assigned', description: vendor.shopName, actorUserId: req.user!.id });
    await notifyUser(vendor.userId, { title: 'New order assigned', message: `Order ${order.orderNumber} has been assigned to your shop`, type: 'ORDER', data: { orderId: order.id } });
    res.json(serializeOrder(await broadcastOrder(order.id), 'admin'));
  }),
);

/** Re-broadcast a leg to riders (e.g. after all offers expired). */
adminOrdersRouter.post(
  '/:id/dispatch',
  asyncHandler(async (req, res) => {
    const { leg, riderIds } = parseBody(z.object({ leg: z.enum(['PICKUP', 'DELIVERY']).default('PICKUP'), riderIds: z.array(z.string()).optional() }), req.body ?? {});
    const order = await loadOrder(req.params.id!);
    const notified = await offerLeg(order.id, leg, { riderIds });
    res.json({ ridersNotified: notified });
  }),
);

adminOrdersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await loadOrder(req.params.id!);
    if (order.status !== 'CANCELLED') await transitionOrder(order.id, 'CANCELLED', { actorUserId: req.user!.id, force: true, reason: 'Cancelled by admin' });
    res.json({ message: 'Order cancelled' });
  }),
);
