import dayjs from 'dayjs';
import type { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound, unprocessable } from '../../lib/errors.js';
import { nextId } from '../../lib/ids.js';
import { distanceKm, randomDigits, round2 } from '../../lib/utils.js';
import { logger } from '../../lib/logger.js';
import { buildQuote, type QuoteItemInput } from '../../services/pricing.js';
import { getSettings } from '../../services/settings.js';
import { notifyAdmins, notifyUser } from '../../services/notifications.js';
import { addEvent, broadcastOrder, loadOrder, transitionOrder } from '../../services/orders.js';
import { offerLeg } from '../../services/dispatch.js';

export interface CreateOrderInput {
  customerId: string;
  items: QuoteItemInput[];
  addressId?: string;
  address?: { line1: string; line2?: string; landmark?: string; city: string; state?: string; pincode: string; lat?: number; lng?: number };
  pickupDate: Date;
  pickupSlot: string;
  isExpress?: boolean;
  promoCode?: string | null;
  paymentMethod: PaymentMethod;
  notes?: string;
  /** admin-created orders may pin a vendor */
  vendorId?: string;
  actorUserId?: string;
}

/** Pick the best laundry partner for an order: active, offers the service, nearest. */
export async function chooseVendor(opts: { lat?: number | null; lng?: number | null; city?: string | null; serviceCategoryIds: number[] }) {
  const vendors = await prisma.vendor.findMany({
    where: {
      status: 'ACTIVE',
      user: { status: 'ACTIVE' },
      ...(opts.serviceCategoryIds.length
        ? { services: { some: { isEnabled: true, serviceCategoryId: { in: opts.serviceCategoryIds } } } }
        : {}),
    },
    include: { zones: true, _count: { select: { orders: { where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } } } } } },
  });
  if (vendors.length === 0) return null;

  const scored = vendors.map((v) => {
    const d =
      opts.lat != null && opts.lng != null && v.latitude != null && v.longitude != null
        ? distanceKm(opts.lat, opts.lng, v.latitude, v.longitude)
        : opts.city && v.city.toLowerCase() === opts.city.toLowerCase()
          ? 5
          : 50;
    const load = v._count.orders / Math.max(1, v.dailyCapacityKg / 5);
    return { vendor: v, score: d + load * 2 };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0]!.vendor;
}

async function resolveZone(lat?: number | null, lng?: number | null, city?: string | null) {
  const zones = await prisma.zone.findMany({ where: { isActive: true } });
  if (lat != null && lng != null) {
    let best: { id: number; d: number } | null = null;
    for (const z of zones) {
      if (z.centerLat == null || z.centerLng == null) continue;
      const d = distanceKm(lat, lng, z.centerLat, z.centerLng);
      if (d <= (z.radiusKm ?? 8) && (!best || d < best.d)) best = { id: z.id, d };
    }
    if (best) return best.id;
  }
  if (city) {
    const z = zones.find((z) => z.city.toLowerCase() === city.toLowerCase());
    if (z) return z.id;
  }
  return null;
}

export async function createOrder(input: CreateOrderInput) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId }, include: { user: true } });
  if (!customer) throw notFound('Customer');

  // -- address snapshot
  let address: CreateOrderInput['address'] | undefined = input.address;
  let addressId: string | undefined;
  if (input.addressId) {
    const a = await prisma.address.findFirst({ where: { id: input.addressId, customerId: customer.id } });
    if (!a) throw notFound('Address');
    address = { line1: a.line1, line2: a.line2 ?? undefined, landmark: a.landmark ?? undefined, city: a.city, state: a.state ?? undefined, pincode: a.pincode, lat: a.lat ?? undefined, lng: a.lng ?? undefined };
    addressId = a.id;
  }
  if (!address) throw badRequest('A pickup address is required');
  const addressLine = [address.line1, address.line2, address.landmark, address.city, address.pincode].filter(Boolean).join(', ');

  if (dayjs(input.pickupDate).isBefore(dayjs().startOf('day'))) throw badRequest('Pickup date cannot be in the past');

  // -- pricing
  const quote = await buildQuote({
    items: input.items,
    isExpress: input.isExpress,
    pickupDate: input.pickupDate,
    promoCode: input.promoCode,
    customerId: customer.id,
  });
  if (input.promoCode && quote.promoError) throw unprocessable(quote.promoError, { field: 'promoCode' });

  // -- vendor & zone
  const categoryIds = [
    ...new Set(
      (await prisma.catalogItem.findMany({ where: { id: { in: quote.items.map((i) => i.catalogItemId) } }, select: { serviceCategoryId: true } })).map(
        (c) => c.serviceCategoryId,
      ),
    ),
  ];
  const vendor = input.vendorId
    ? await prisma.vendor.findUnique({ where: { id: input.vendorId } })
    : await chooseVendor({ lat: address.lat, lng: address.lng, city: address.city, serviceCategoryIds: categoryIds });
  const zoneId = await resolveZone(address.lat, address.lng, address.city);
  const dist =
    vendor && address.lat != null && address.lng != null && vendor.latitude != null && vendor.longitude != null
      ? round2(distanceKm(address.lat, address.lng, vendor.latitude, vendor.longitude))
      : null;

  const settings = await getSettings();
  const commissionRate = vendor?.commissionRate ?? settings.vendorCommissionRate;
  const vendorEarning = round2(quote.subtotal * (1 - commissionRate / 100));
  const platformCommission = round2(quote.subtotal - vendorEarning);

  // -- payment
  if (input.paymentMethod === 'WALLET' && Number(customer.walletBalance) < quote.total) {
    throw unprocessable(`Insufficient wallet balance. Available ₹${Number(customer.walletBalance)}, required ₹${quote.total}`);
  }

  const leadHours = Math.max(
    24,
    ...(await prisma.serviceCategory.findMany({ where: { id: { in: categoryIds } }, select: { leadTimeHours: true } })).map((s) => s.leadTimeHours),
  );
  const deliveryEta = dayjs(input.pickupDate)
    .add(input.isExpress ? 24 : leadHours, 'hour')
    .toDate();

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await nextId('YD', tx);
    const created = await tx.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        addressId,
        vendorId: vendor?.id,
        zoneId,
        addressLine,
        addressLat: address!.lat,
        addressLng: address!.lng,
        pincode: address!.pincode,
        city: address!.city,
        pickupDate: input.pickupDate,
        pickupSlot: input.pickupSlot,
        isExpress: Boolean(input.isExpress),
        deliveryEta,
        notes: input.notes,
        serviceSummary: quote.serviceSummary,
        itemsCount: quote.itemsCount,
        itemsDescription: quote.itemsDescription,
        estimatedWeightKg: quote.estimatedWeightKg,
        distanceKm: dist,
        subtotal: quote.subtotal,
        discount: quote.discount,
        surcharge: quote.surcharge,
        deliveryFee: quote.deliveryFee,
        tax: quote.tax,
        total: quote.total,
        promoCode: quote.promo?.code,
        promotionId: quote.promo?.id,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentMethod === 'WALLET' ? 'PAID' : 'PENDING',
        vendorEarning,
        platformCommission,
        customerPickupOtp: randomDigits(4),
        vendorDropOtp: randomDigits(4),
        vendorHandoverOtp: randomDigits(4),
        customerDeliveryOtp: randomDigits(4),
        items: {
          create: quote.items.map((i) => ({
            catalogItemId: i.catalogItemId,
            name: i.name,
            serviceName: i.serviceName,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
          })),
        },
      },
    });

    await addEvent(tx, created.id, {
      type: 'STATUS_CHANGE',
      status: 'PENDING_PICKUP',
      title: 'Order Placed',
      description: `Pickup scheduled for ${dayjs(input.pickupDate).format('DD MMM')} ${input.pickupSlot}`,
      actorUserId: input.actorUserId ?? customer.userId,
    });

    if (quote.promo) {
      await tx.promotion.update({ where: { id: quote.promo.id }, data: { usedCount: { increment: 1 } } });
      await tx.promotionRedemption.create({ data: { promotionId: quote.promo.id, customerId: customer.id, orderId: created.id, amount: quote.discount } });
    }

    if (input.paymentMethod === 'WALLET') {
      const c = await tx.customer.update({ where: { id: customer.id }, data: { walletBalance: { decrement: quote.total } } });
      await tx.walletTransaction.create({
        data: { customerId: customer.id, orderId: created.id, type: 'ORDER_PAYMENT', amount: -quote.total, balanceAfter: c.walletBalance, description: `Payment for order ${created.orderNumber}` },
      });
      await tx.payment.create({ data: { orderId: created.id, customerId: customer.id, method: 'WALLET', status: 'PAID', amount: quote.total, provider: 'wallet' } });
    } else if (input.paymentMethod === 'COD') {
      await tx.payment.create({ data: { orderId: created.id, customerId: customer.id, method: 'COD', status: 'PENDING', amount: quote.total, provider: 'cod' } });
    }
    return created;
  });

  // -- notifications & dispatch (outside the transaction)
  const full = await broadcastOrder(order.id);
  await notifyAdmins({
    title: Number(order.total) >= 500 ? 'New High Value Order' : 'New Order',
    message: `Order ${order.orderNumber} placed for ₹${Number(order.total)} (${order.serviceSummary}) by ${customer.user.name}`,
    type: 'ORDER',
    data: { orderId: order.id },
  });
  if (vendor) {
    await notifyUser(vendor.userId, {
      title: 'New order request',
      message: `${customer.user.name} • ${order.itemsCount} items • ${order.serviceSummary}`,
      type: 'ORDER',
      data: { orderId: order.id },
    });
  }
  offerLeg(order.id, 'PICKUP').catch((err) => logger.warn({ err, orderId: order.id }, 'initial dispatch failed'));

  return full;
}

export async function customerCancelOrder(orderId: string, customerId: string, reason?: string) {
  const order = await loadOrder(orderId);
  if (order.customerId !== customerId) throw notFound('Order');
  if (!['PENDING_PICKUP', 'ASSIGNED'].includes(order.status)) {
    throw unprocessable('Orders can only be cancelled before pickup. Please contact support.');
  }
  return transitionOrder(order.id, 'CANCELLED', { actorUserId: order.customer.userId, reason: reason ?? 'Cancelled by customer' });
}

export async function rateOrder(orderId: string, customerId: string, rating: number, comment?: string) {
  const order = await loadOrder(orderId);
  if (order.customerId !== customerId) throw notFound('Order');
  if (order.status !== 'DELIVERED') throw unprocessable('You can rate an order once it is delivered');
  if (order.rating != null) throw unprocessable('This order has already been rated');

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { rating, ratingComment: comment } });
    const bump = async (model: 'vendor' | 'rider', id: string | null) => {
      if (!id) return;
      const rec = model === 'vendor' ? await tx.vendor.findUnique({ where: { id } }) : await tx.rider.findUnique({ where: { id } });
      if (!rec) return;
      const newCount = rec.ratingCount + 1;
      const newRating = round2((rec.rating * rec.ratingCount + rating) / newCount);
      const data = { rating: newRating, ratingCount: newCount };
      if (model === 'vendor') await tx.vendor.update({ where: { id }, data });
      else await tx.rider.update({ where: { id }, data });
    };
    await bump('vendor', order.vendorId);
    await bump('rider', order.deliveryRiderId);
  });
  return loadOrder(order.id);
}

export type OrderListFilter = 'active' | 'completed' | 'cancelled' | 'all';
export function statusWhere(filter: OrderListFilter): Prisma.OrderWhereInput {
  switch (filter) {
    case 'active':
      return { status: { notIn: ['DELIVERED', 'CANCELLED'] } };
    case 'completed':
      return { status: 'DELIVERED' };
    case 'cancelled':
      return { status: 'CANCELLED' };
    default:
      return {};
  }
}
