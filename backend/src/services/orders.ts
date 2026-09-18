import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma.js';
import { conflict, notFound, unprocessable } from '../lib/errors.js';
import { initials, maskPhone, toTitle } from '../lib/utils.js';
import { realtime } from '../realtime/socket.js';
import { notifyUser } from './notifications.js';
import { addEarning } from './ledger.js';
import { getSettings } from './settings.js';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PICKUP: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'PENDING_PICKUP', 'CANCELLED'],
  PICKED_UP: ['IN_LAUNDRY', 'CANCELLED'],
  IN_LAUNDRY: ['WASHING', 'IRONING', 'QUALITY_CHECK', 'READY', 'CANCELLED'],
  WASHING: ['IRONING', 'QUALITY_CHECK', 'READY'],
  IRONING: ['QUALITY_CHECK', 'READY'],
  QUALITY_CHECK: ['READY'],
  READY: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Labels used by the admin panel. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PICKUP: 'Pending Pickup',
  ASSIGNED: 'Assigned',
  PICKED_UP: 'Picked Up',
  IN_LAUNDRY: 'In Laundry',
  WASHING: 'Washing',
  IRONING: 'Ironing',
  QUALITY_CHECK: 'Quality Check',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/** Steps shown on the customer "Track Order" screen. */
const TRACK_STEPS: { key: string; title: string; subtitle: string; statuses: OrderStatus[] }[] = [
  { key: 'placed', title: 'Order Placed', subtitle: 'We have received your order', statuses: [] },
  { key: 'scheduled', title: 'Pickup Scheduled', subtitle: 'Pending pickup verification', statuses: ['PENDING_PICKUP'] },
  { key: 'rider_on_way', title: 'Rider On Way', subtitle: 'Rider is coming to pick up', statuses: ['ASSIGNED'] },
  { key: 'picked_up', title: 'Clothes Picked Up', subtitle: 'On the way to our facility', statuses: ['PICKED_UP'] },
  { key: 'washing', title: 'Washing In Progress', subtitle: 'Processing at premium facility', statuses: ['IN_LAUNDRY', 'WASHING', 'IRONING'] },
  { key: 'quality', title: 'Quality Check', subtitle: 'Inspecting fabric & ironing standard', statuses: ['QUALITY_CHECK', 'READY'] },
  { key: 'out_for_delivery', title: 'Out For Delivery', subtitle: 'Fresh clothes on their way back', statuses: ['OUT_FOR_DELIVERY'] },
  { key: 'delivered', title: 'Delivered', subtitle: 'Doorstep delivery completed', statuses: ['DELIVERED'] },
];

export function trackingSteps(status: OrderStatus) {
  if (status === 'CANCELLED') {
    return TRACK_STEPS.map((s, i) => ({ key: s.key, title: s.title, subtitle: s.subtitle, state: i === 0 ? 'done' : 'skipped' }));
  }
  let current = TRACK_STEPS.findIndex((s) => s.statuses.includes(status));
  if (current < 0) current = 0;
  return TRACK_STEPS.map((s, i) => ({
    key: s.key,
    title: s.title,
    subtitle: s.subtitle,
    state: i < current ? 'done' : i === current ? (status === 'DELIVERED' ? 'done' : 'current') : 'pending',
  }));
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Loading & serialisation
// ---------------------------------------------------------------------------

export const orderInclude = {
  customer: { include: { user: { select: { id: true, name: true, phone: true, email: true } } } },
  vendor: { select: { id: true, shopName: true, ownerName: true, shopAddress: true, latitude: true, longitude: true, rating: true, userId: true, user: { select: { phone: true } } } },
  pickupRider: { select: { id: true, userId: true, rating: true, vehicleType: true, vehicleNumber: true, currentLat: true, currentLng: true, user: { select: { name: true, phone: true } } } },
  deliveryRider: { select: { id: true, userId: true, rating: true, vehicleType: true, vehicleNumber: true, currentLat: true, currentLng: true, user: { select: { name: true, phone: true } } } },
  items: true,
  events: { orderBy: { createdAt: 'asc' as const } },
  zone: true,
} satisfies Prisma.OrderInclude;

export type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export async function loadOrder(idOrNumber: string, client: Tx | typeof prisma = prisma): Promise<FullOrder> {
  const order = await client.order.findFirst({
    where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber.replace(/^#/, '') }] },
    include: orderInclude,
  });
  if (!order) throw notFound('Order');
  return order;
}

type Viewer = 'customer' | 'rider' | 'vendor' | 'admin';

function riderView(r: FullOrder['pickupRider']) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.userId,
    name: r.user.name,
    phone: r.user.phone,
    rating: r.rating,
    vehicleType: r.vehicleType,
    vehicleNumber: r.vehicleNumber,
    currentLat: r.currentLat,
    currentLng: r.currentLng,
  };
}

/**
 * Shape an order for a given audience. OTPs are only revealed to the party
 * that must *show* them; the party that *enters* them never sees them.
 *   customerPickupOtp   -> customer shows, pickup rider enters
 *   vendorDropOtp       -> vendor shows, pickup rider enters
 *   vendorHandoverOtp   -> vendor shows, delivery rider enters
 *   customerDeliveryOtp -> customer shows, delivery rider enters
 */
export function serializeOrder(o: FullOrder, viewer: Viewer) {
  const activeRider = o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY' || o.status === 'DELIVERED' ? o.deliveryRider : o.pickupRider;
  const base = {
    id: o.id,
    orderNumber: o.orderNumber,
    displayId: `#${o.orderNumber}`,
    status: o.status,
    statusLabel: STATUS_LABEL[o.status],
    customer: {
      id: o.customer.id,
      userId: o.customer.userId,
      name: o.customer.user.name,
      initials: initials(o.customer.user.name),
      phone: viewer === 'customer' || viewer === 'admin' ? o.customer.user.phone : maskPhone(o.customer.user.phone ?? ''),
      tier: o.customer.tier,
    },
    address: { line: o.addressLine, lat: o.addressLat, lng: o.addressLng, pincode: o.pincode, city: o.city },
    vendor: o.vendor
      ? {
          id: o.vendor.id,
          userId: o.vendor.userId,
          name: o.vendor.shopName,
          ownerName: o.vendor.ownerName,
          address: o.vendor.shopAddress,
          phone: o.vendor.user.phone,
          lat: o.vendor.latitude,
          lng: o.vendor.longitude,
          rating: o.vendor.rating,
        }
      : null,
    pickupRider: riderView(o.pickupRider),
    deliveryRider: riderView(o.deliveryRider),
    rider: riderView(activeRider),
    zone: o.zone ? { id: o.zone.id, name: o.zone.name, city: o.zone.city } : null,
    pickupDate: o.pickupDate,
    pickupSlot: o.pickupSlot,
    isExpress: o.isExpress,
    deliveryEta: o.deliveryEta,
    pickedUpAt: o.pickedUpAt,
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
    notes: o.notes,
    serviceSummary: o.serviceSummary,
    itemsCount: o.itemsCount,
    itemsDescription: o.itemsDescription,
    estimatedWeightKg: o.estimatedWeightKg,
    distanceKm: o.distanceKm,
    items: o.items,
    pricing: {
      subtotal: o.subtotal,
      discount: o.discount,
      surcharge: o.surcharge,
      deliveryFee: o.deliveryFee,
      tax: o.tax,
      total: o.total,
      promoCode: o.promoCode,
    },
    amount: o.total,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    rating: o.rating,
    ratingComment: o.ratingComment,
    events: o.events,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };

  switch (viewer) {
    case 'customer':
      return {
        ...base,
        otps: { pickup: o.customerPickupOtp, delivery: o.customerDeliveryOtp },
        tracking: trackingSteps(o.status),
      };
    case 'vendor':
      return {
        ...base,
        otps: { riderDrop: o.vendorDropOtp, riderHandover: o.vendorHandoverOtp },
        payout: o.vendorEarning,
      };
    case 'rider':
      return {
        ...base,
        payout: {
          pickup: o.riderPickupPayout,
          delivery: o.riderDeliveryPayout,
        },
      };
    case 'admin':
      return {
        ...base,
        otps: {
          customerPickup: o.customerPickupOtp,
          vendorDrop: o.vendorDropOtp,
          vendorHandover: o.vendorHandoverOtp,
          customerDelivery: o.customerDeliveryOtp,
        },
        payouts: {
          riderPickup: o.riderPickupPayout,
          riderDelivery: o.riderDeliveryPayout,
          vendor: o.vendorEarning,
          platformCommission: o.platformCommission,
        },
        // flat fields matching the admin panel `Order` type
        customerName: o.customer.user.name,
        customerPhone: o.customer.user.phone,
        customerAddress: o.addressLine,
        partnerName: o.vendor?.shopName ?? '',
        riderName: activeRider?.user.name ?? '',
      };
  }
}

// ---------------------------------------------------------------------------
// Events & broadcast
// ---------------------------------------------------------------------------

export async function addEvent(
  tx: Tx | typeof prisma,
  orderId: string,
  input: { type: string; title: string; description?: string; status?: OrderStatus; actorUserId?: string; meta?: Prisma.InputJsonValue },
) {
  return tx.orderEvent.create({ data: { orderId, ...input } });
}

/** Push the latest order snapshot to everyone interested. */
export async function broadcastOrder(orderId: string) {
  const o = await loadOrder(orderId);
  realtime.toOrder(o.id, 'order:updated', serializeOrder(o, 'customer'));
  realtime.toUser(o.customer.userId, 'order:updated', serializeOrder(o, 'customer'));
  if (o.vendor) realtime.toUser(o.vendor.userId, 'order:updated', serializeOrder(o, 'vendor'));
  if (o.pickupRider) realtime.toUser(o.pickupRider.userId, 'order:updated', serializeOrder(o, 'rider'));
  if (o.deliveryRider && o.deliveryRider.userId !== o.pickupRider?.userId)
    realtime.toUser(o.deliveryRider.userId, 'order:updated', serializeOrder(o, 'rider'));
  realtime.toAdmins('order:updated', serializeOrder(o, 'admin'));
  return o;
}

const CUSTOMER_MESSAGES: Partial<Record<OrderStatus, string>> = {
  ASSIGNED: 'A rider has been assigned and is on the way to pick up your clothes.',
  PICKED_UP: 'Your clothes have been picked up and are heading to our facility.',
  IN_LAUNDRY: 'Your order has reached our laundry partner.',
  WASHING: 'Washing in progress.',
  IRONING: 'Ironing in progress.',
  QUALITY_CHECK: 'Your clothes are going through quality check.',
  READY: 'Your clothes are ready and will be out for delivery soon.',
  OUT_FOR_DELIVERY: 'Fresh clothes are on their way back to you!',
  DELIVERED: 'Your order has been delivered. Thank you for choosing Yes Dhobi!',
  CANCELLED: 'Your order has been cancelled.',
};

// ---------------------------------------------------------------------------
// Transition
// ---------------------------------------------------------------------------

export interface TransitionOptions {
  actorUserId?: string;
  /** admins may bypass the state machine */
  force?: boolean;
  description?: string;
  reason?: string;
  meta?: Prisma.InputJsonValue;
}

export async function transitionOrder(orderId: string, next: OrderStatus, opts: TransitionOptions = {}) {
  const settings = await getSettings();

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { vendor: true } });
    if (!order) throw notFound('Order');
    if (order.status === next) throw conflict(`Order is already ${STATUS_LABEL[next]}`);
    if (!opts.force && !canTransition(order.status, next)) {
      throw unprocessable(`Cannot move order from ${STATUS_LABEL[order.status]} to ${STATUS_LABEL[next]}`);
    }

    const data: Prisma.OrderUpdateInput = { status: next };
    const now = new Date();
    if (next === 'PICKED_UP') data.pickedUpAt = now;
    if (next === 'DELIVERED') {
      data.deliveredAt = now;
      if (order.paymentMethod === 'COD') data.paymentStatus = 'PAID';
    }
    if (next === 'CANCELLED') {
      data.cancelledAt = now;
      data.cancelReason = opts.reason ?? opts.description ?? null;
    }
    if (next === 'PENDING_PICKUP') {
      data.pickupRider = { disconnect: true };
    }

    await tx.order.update({ where: { id: orderId }, data });
    await addEvent(tx, orderId, {
      type: 'STATUS_CHANGE',
      status: next,
      title: STATUS_LABEL[next],
      description: opts.description ?? CUSTOMER_MESSAGES[next],
      actorUserId: opts.actorUserId,
      meta: opts.meta,
    });

    // --- side effects -----------------------------------------------------
    if (next === 'DELIVERED') {
      if (order.vendorId) {
        await addEarning(tx, { type: 'VENDOR', id: order.vendorId }, orderId, Number(order.vendorEarning), `Order ${order.orderNumber}`);
      }
      if (order.deliveryRiderId) {
        await addEarning(tx, { type: 'RIDER', id: order.deliveryRiderId }, orderId, Number(order.riderDeliveryPayout), `Delivery: ${order.orderNumber}`);
        await tx.rider.update({
          where: { id: order.deliveryRiderId },
          data: { totalDeliveries: { increment: 1 }, availability: 'ONLINE' },
        });
      }
    }
    if (next === 'IN_LAUNDRY' && order.pickupRiderId) {
      await addEarning(tx, { type: 'RIDER', id: order.pickupRiderId }, orderId, Number(order.riderPickupPayout), `Pickup: ${order.orderNumber}`);
      await tx.rider.update({ where: { id: order.pickupRiderId }, data: { totalDeliveries: { increment: 1 }, availability: 'ONLINE' } });
    }
    if (next === 'CANCELLED') {
      await tx.pickupRequest.updateMany({
        where: { orderId, status: 'OFFERED' },
        data: { status: 'CANCELLED', respondedAt: now },
      });
      for (const riderId of [order.pickupRiderId, order.deliveryRiderId]) {
        if (riderId) await tx.rider.update({ where: { id: riderId }, data: { availability: 'ONLINE' } });
      }
      // refund wallet payments automatically
      if (order.paymentStatus === 'PAID' && order.paymentMethod === 'WALLET') {
        const customer = await tx.customer.update({
          where: { id: order.customerId },
          data: { walletBalance: { increment: order.total } },
        });
        await tx.walletTransaction.create({
          data: {
            customerId: order.customerId,
            orderId,
            type: 'REFUND',
            amount: order.total,
            balanceAfter: customer.walletBalance,
            description: `Refund for cancelled order ${order.orderNumber}`,
          },
        });
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'REFUNDED' } });
      }
    }
    if (next === 'PENDING_PICKUP' && order.pickupRiderId) {
      await tx.rider.update({ where: { id: order.pickupRiderId }, data: { availability: 'ONLINE' } });
    }
    void settings;
  });

  const o = await broadcastOrder(orderId);
  const msg = CUSTOMER_MESSAGES[next];
  if (msg) {
    await notifyUser(o.customer.userId, {
      title: `Order ${o.orderNumber}: ${STATUS_LABEL[next]}`,
      message: msg,
      type: 'ORDER',
      data: { orderId: o.id, status: next },
    });
  }
  return o;
}
