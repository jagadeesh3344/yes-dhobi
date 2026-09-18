import dayjs from 'dayjs';
import type { PickupRequest, RequestLeg } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { conflict, notFound, unprocessable } from '../lib/errors.js';
import { distanceKm, initials, round2 } from '../lib/utils.js';
import { logger } from '../lib/logger.js';
import { realtime } from '../realtime/socket.js';
import { notifyAdmins, notifyUser } from './notifications.js';
import { addEvent, broadcastOrder, loadOrder, orderInclude, transitionOrder } from './orders.js';
import { riderLegPayout } from './pricing.js';

/**
 * Rider dispatch: an order leg (PICKUP: customer -> vendor, DELIVERY: vendor ->
 * customer) is *offered* to eligible online riders for a short window. The
 * first rider to accept wins; the other offers are closed.
 */

export function serializeRequest(r: PickupRequest & { order: Awaited<ReturnType<typeof loadOrder>> }) {
  const o = r.order;
  const isPickup = r.leg === 'PICKUP';
  const from = isPickup
    ? { name: o.customer.user.name, address: o.addressLine, lat: o.addressLat, lng: o.addressLng }
    : { name: o.vendor?.shopName ?? 'Vendor', address: o.vendor?.shopAddress ?? '', lat: o.vendor?.latitude, lng: o.vendor?.longitude };
  const to = isPickup
    ? { name: o.vendor?.shopName ?? 'Yes Dhobi Hub', address: o.vendor?.shopAddress ?? '', lat: o.vendor?.latitude, lng: o.vendor?.longitude }
    : { name: o.customer.user.name, address: o.addressLine, lat: o.addressLat, lng: o.addressLng };
  return {
    requestId: r.id,
    orderId: o.id,
    orderNumber: o.orderNumber,
    leg: r.leg,
    status: r.status,
    customerName: o.customer.user.name,
    customerInitials: initials(o.customer.user.name),
    customerTier: o.customer.tier,
    pickup: from,
    dropoff: to,
    distanceKm: r.distanceKm,
    estimatedItemsText: `${o.itemsCount} items`,
    estimatedWeightKg: o.estimatedWeightKg,
    serviceSummary: o.serviceSummary,
    payout: r.payout,
    offeredAt: r.offeredAt,
    expiresAt: r.expiresAt,
    remainingSeconds: Math.max(0, dayjs(r.expiresAt).diff(dayjs(), 'second')),
  };
}

/** Offer a leg to riders. Returns number of riders notified. */
export async function offerLeg(orderId: string, leg: RequestLeg, opts: { riderIds?: string[] } = {}): Promise<number> {
  const order = await loadOrder(orderId);
  if (order.status === 'CANCELLED' || order.status === 'DELIVERED') throw unprocessable('Order is closed');
  if (leg === 'PICKUP' && order.pickupRiderId) throw conflict('A pickup rider is already assigned');
  if (leg === 'DELIVERY' && order.deliveryRiderId) throw conflict('A delivery rider is already assigned');

  // origin used for distance filtering
  const origin =
    leg === 'PICKUP'
      ? { lat: order.addressLat, lng: order.addressLng }
      : { lat: order.vendor?.latitude ?? null, lng: order.vendor?.longitude ?? null };

  const riders = await prisma.rider.findMany({
    where: opts.riderIds?.length
      ? { id: { in: opts.riderIds } }
      : {
          onboardingStatus: 'APPROVED',
          availability: 'ONLINE',
          user: { status: 'ACTIVE' },
          ...(order.zoneId ? { OR: [{ zoneId: order.zoneId }, { zoneId: null }] } : {}),
        },
    select: { id: true, userId: true, currentLat: true, currentLng: true },
  });

  const eligible = riders
    .map((r) => {
      const d =
        origin.lat != null && origin.lng != null && r.currentLat != null && r.currentLng != null
          ? round2(distanceKm(origin.lat, origin.lng, r.currentLat, r.currentLng))
          : null;
      return { ...r, distance: d };
    })
    .filter((r) => opts.riderIds?.length || r.distance == null || r.distance <= env.DISPATCH_RADIUS_KM)
    .sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99))
    .slice(0, 10);

  if (eligible.length === 0) {
    await notifyAdmins({
      title: 'No riders available',
      message: `No online riders found for ${leg.toLowerCase()} of order ${order.orderNumber}. Assign manually.`,
      type: 'RIDER',
      data: { orderId: order.id, leg },
    });
    return 0;
  }

  const payout = await riderLegPayout(order.distanceKm);
  const expiresAt = dayjs().add(env.PICKUP_REQUEST_TTL_SECONDS, 'second').toDate();

  // close any stale offers for this leg first
  await prisma.pickupRequest.updateMany({
    where: { orderId, leg, status: 'OFFERED' },
    data: { status: 'EXPIRED', respondedAt: new Date() },
  });

  const created = await prisma.$transaction(
    eligible.map((r) =>
      prisma.pickupRequest.create({
        data: { orderId, riderId: r.id, leg, payout, distanceKm: r.distance, expiresAt },
        include: { order: { include: orderInclude } },
      }),
    ),
  );

  for (const req of created) {
    const rider = eligible.find((r) => r.id === req.riderId)!;
    realtime.toUser(rider.userId, 'pickup_request:new', serializeRequest(req));
    await notifyUser(rider.userId, {
      title: leg === 'PICKUP' ? 'New pickup request' : 'New delivery request',
      message: `${order.customer.user.name} • ${order.itemsCount} items • ₹${payout}`,
      type: 'ORDER',
      data: { requestId: req.id, orderId: order.id, leg },
    });
  }
  await addEvent(prisma, orderId, {
    type: 'DISPATCH',
    title: `${leg === 'PICKUP' ? 'Pickup' : 'Delivery'} offered to ${created.length} rider(s)`,
  });
  return created.length;
}

export async function acceptRequest(requestId: string, riderId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const req = await tx.pickupRequest.findUnique({ where: { id: requestId }, include: { order: true } });
    if (!req || req.riderId !== riderId) throw notFound('Request');
    if (req.status !== 'OFFERED') throw conflict(`Request already ${req.status.toLowerCase()}`);
    if (req.expiresAt < new Date()) {
      await tx.pickupRequest.update({ where: { id: req.id }, data: { status: 'EXPIRED', respondedAt: new Date() } });
      throw conflict('Request has expired');
    }
    const order = req.order;
    if (order.status === 'CANCELLED') throw conflict('Order was cancelled');
    if (req.leg === 'PICKUP' && order.pickupRiderId) throw conflict('Another rider already accepted this pickup');
    if (req.leg === 'DELIVERY' && order.deliveryRiderId) throw conflict('Another rider already accepted this delivery');

    await tx.pickupRequest.update({ where: { id: req.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
    await tx.pickupRequest.updateMany({
      where: { orderId: order.id, leg: req.leg, status: 'OFFERED', id: { not: req.id } },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    });
    await tx.order.update({
      where: { id: order.id },
      data: req.leg === 'PICKUP' ? { pickupRiderId: riderId, riderPickupPayout: req.payout } : { deliveryRiderId: riderId, riderDeliveryPayout: req.payout },
    });
    await tx.rider.update({ where: { id: riderId }, data: { availability: 'ON_DELIVERY' } });
    const rider = await tx.rider.findUnique({ where: { id: riderId }, include: { user: true } });
    await addEvent(tx, order.id, {
      type: 'RIDER_ASSIGNED',
      title: `${req.leg === 'PICKUP' ? 'Pickup' : 'Delivery'} rider assigned`,
      description: rider?.user.name,
      actorUserId: rider?.userId,
      meta: { riderId, leg: req.leg },
    });
    return { req, order };
  });

  if (result.req.leg === 'PICKUP' && result.order.status === 'PENDING_PICKUP') {
    await transitionOrder(result.order.id, 'ASSIGNED', { actorUserId: undefined });
  } else {
    const o = await broadcastOrder(result.order.id);
    if (result.req.leg === 'DELIVERY' && o.vendor) {
      await notifyUser(o.vendor.userId, {
        title: 'Rider booked',
        message: `${o.deliveryRider?.user.name ?? 'A rider'} will collect order ${o.orderNumber}`,
        type: 'RIDER',
        data: { orderId: o.id },
      });
    }
  }
  return loadOrder(result.order.id);
}

export async function declineRequest(requestId: string, riderId: string) {
  const req = await prisma.pickupRequest.findUnique({ where: { id: requestId } });
  if (!req || req.riderId !== riderId) throw notFound('Request');
  if (req.status !== 'OFFERED') return req;
  return prisma.pickupRequest.update({ where: { id: req.id }, data: { status: 'DECLINED', respondedAt: new Date() } });
}

/** Direct assignment by admin (bypasses offers). */
export async function assignRider(orderId: string, riderId: string, leg: RequestLeg, actorUserId?: string) {
  const rider = await prisma.rider.findUnique({ where: { id: riderId }, include: { user: true } });
  if (!rider) throw notFound('Rider');
  const order = await loadOrder(orderId);
  const payout = await riderLegPayout(order.distanceKm);

  await prisma.$transaction(async (tx) => {
    await tx.pickupRequest.updateMany({
      where: { orderId, leg, status: 'OFFERED' },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
    await tx.order.update({
      where: { id: orderId },
      data: leg === 'PICKUP' ? { pickupRiderId: riderId, riderPickupPayout: payout } : { deliveryRiderId: riderId, riderDeliveryPayout: payout },
    });
    await tx.rider.update({ where: { id: riderId }, data: { availability: 'ON_DELIVERY' } });
    await addEvent(tx, orderId, {
      type: 'RIDER_ASSIGNED',
      title: `${leg === 'PICKUP' ? 'Pickup' : 'Delivery'} rider assigned by admin`,
      description: rider.user.name,
      actorUserId,
      meta: { riderId, leg },
    });
  });

  await notifyUser(rider.userId, {
    title: 'New assignment',
    message: `You have been assigned ${leg === 'PICKUP' ? 'pickup' : 'delivery'} for order ${order.orderNumber}`,
    type: 'ORDER',
    data: { orderId, leg },
  });

  if (leg === 'PICKUP' && order.status === 'PENDING_PICKUP') {
    return transitionOrder(orderId, 'ASSIGNED', { actorUserId });
  }
  return broadcastOrder(orderId);
}

/** Periodic sweep: expire stale offers and alert admins for legs nobody took. */
export async function expireStaleRequests() {
  const now = new Date();
  const stale = await prisma.pickupRequest.findMany({
    where: { status: 'OFFERED', expiresAt: { lt: now } },
    select: { id: true, orderId: true, leg: true, riderId: true, rider: { select: { userId: true } } },
  });
  if (stale.length === 0) return;
  await prisma.pickupRequest.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: 'EXPIRED', respondedAt: now },
  });
  for (const s of stale) realtime.toUser(s.rider.userId, 'pickup_request:expired', { requestId: s.id, orderId: s.orderId });

  const legs = new Map<string, RequestLeg>();
  for (const s of stale) legs.set(`${s.orderId}:${s.leg}`, s.leg);
  for (const [key, leg] of legs) {
    const orderId = key.split(':')[0]!;
    const open = await prisma.pickupRequest.count({ where: { orderId, leg, status: 'OFFERED' } });
    if (open > 0) continue;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status === 'CANCELLED') continue;
    const unassigned = leg === 'PICKUP' ? !order.pickupRiderId : !order.deliveryRiderId;
    if (unassigned) {
      logger.info({ orderId, leg }, 'dispatch: no rider accepted, alerting admins');
      await notifyAdmins({
        title: 'Rider needed',
        message: `No rider accepted the ${leg.toLowerCase()} for order ${order.orderNumber}. Please assign manually.`,
        type: 'RIDER',
        data: { orderId, leg },
      });
    }
  }
}

let sweeper: NodeJS.Timeout | null = null;
export function startDispatchSweeper(intervalMs = 15_000) {
  if (sweeper) return;
  sweeper = setInterval(() => {
    expireStaleRequests().catch((err) => logger.error({ err }, 'dispatch sweeper failed'));
  }, intervalMs);
  sweeper.unref();
}
export function stopDispatchSweeper() {
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
}
