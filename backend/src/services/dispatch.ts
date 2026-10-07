import dayjs from 'dayjs';
import type { Dispatch, DispatchKind, PickupRequest, RequestLeg, VendorRequest } from '@prisma/client';
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
 * Dispatch = a waterfall cascade.
 *
 * Candidates (riders for a leg, or laundry partners for an order) are ranked
 * nearest-first and offered **one at a time**. If the holder declines, or the
 * offer window expires, the offer passes immediately to the next candidate.
 * When the list is exhausted the search radius widens once; after that admins
 * are alerted to assign manually.
 *
 * Order of events for a normal order:
 *   1. customer places the order  -> rider pickup cascade starts
 *   2. a rider accepts            -> laundry partner cascade starts (the rider is
 *                                    already on the way to the customer)
 *   3. a partner accepts          -> the rider is told where to drop off
 *   4. partner marks READY        -> rider delivery cascade starts
 */

const RIDER_KIND: Record<RequestLeg, DispatchKind> = { PICKUP: 'RIDER_PICKUP', DELIVERY: 'RIDER_DELIVERY' };
const LEG_OF: Record<string, RequestLeg> = { RIDER_PICKUP: 'PICKUP', RIDER_DELIVERY: 'DELIVERY' };

// ---------------------------------------------------------------------------
// Serialisers
// ---------------------------------------------------------------------------

export function serializeRequest(r: PickupRequest & { order: Awaited<ReturnType<typeof loadOrder>> }) {
  const o = r.order;
  const isPickup = r.leg === 'PICKUP';
  const from = isPickup
    ? { name: o.customer.user.name, address: o.addressLine, lat: o.addressLat, lng: o.addressLng }
    : { name: o.vendor?.shopName ?? 'Laundry partner', address: o.vendor?.shopAddress ?? '', lat: o.vendor?.latitude, lng: o.vendor?.longitude };
  const to = isPickup
    ? {
        name: o.vendor?.shopName ?? 'Laundry partner (being assigned)',
        address: o.vendor?.shopAddress ?? '',
        lat: o.vendor?.latitude,
        lng: o.vendor?.longitude,
        pending: !o.vendorId,
      }
    : { name: o.customer.user.name, address: o.addressLine, lat: o.addressLat, lng: o.addressLng, pending: false };
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

export function serializeVendorRequest(r: VendorRequest & { order: Awaited<ReturnType<typeof loadOrder>> }) {
  const o = r.order;
  return {
    requestId: r.id,
    orderId: o.id,
    orderNumber: o.orderNumber,
    displayId: `#${o.orderNumber}`,
    status: r.status,
    customerName: o.customer.user.name,
    customerInitials: initials(o.customer.user.name),
    customerArea: o.addressLine,
    serviceSummary: o.serviceSummary,
    itemsCount: o.itemsCount,
    itemsDescription: o.itemsDescription,
    estimatedWeightKg: o.estimatedWeightKg,
    isExpress: o.isExpress,
    pickupDate: o.pickupDate,
    pickupSlot: o.pickupSlot,
    distanceKm: r.distanceKm,
    /** what the shop earns if it accepts (order value minus platform commission) */
    payout: r.payout,
    orderValue: o.total,
    rider: o.pickupRider ? { name: o.pickupRider.user.name, phone: o.pickupRider.user.phone } : null,
    offeredAt: r.offeredAt,
    expiresAt: r.expiresAt,
    remainingSeconds: Math.max(0, dayjs(r.expiresAt).diff(dayjs(), 'second')),
  };
}

// ---------------------------------------------------------------------------
// Candidate ranking
// ---------------------------------------------------------------------------

async function rankRiders(
  order: Awaited<ReturnType<typeof loadOrder>>,
  leg: RequestLeg,
  radiusKm: number,
  exclude: string[] = [],
): Promise<{ id: string; distance: number | null }[]> {
  const origin =
    leg === 'PICKUP'
      ? { lat: order.addressLat, lng: order.addressLng }
      : { lat: order.vendor?.latitude ?? order.addressLat, lng: order.vendor?.longitude ?? order.addressLng };

  const riders = await prisma.rider.findMany({
    where: {
      onboardingStatus: 'APPROVED',
      availability: 'ONLINE',
      user: { status: 'ACTIVE' },
      ...(exclude.length ? { id: { notIn: exclude } } : {}),
      ...(order.zoneId ? { OR: [{ zoneId: order.zoneId }, { zoneId: null }] } : {}),
    },
    select: { id: true, currentLat: true, currentLng: true, rating: true },
  });

  return riders
    .map((r) => ({
      id: r.id,
      rating: r.rating,
      distance:
        origin.lat != null && origin.lng != null && r.currentLat != null && r.currentLng != null
          ? round2(distanceKm(origin.lat, origin.lng, r.currentLat, r.currentLng))
          : null,
    }))
    .filter((r) => r.distance == null || r.distance <= radiusKm)
    // nearest first; riders whose location is unknown go last
    .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999) || b.rating - a.rating)
    .slice(0, env.DISPATCH_MAX_CANDIDATES)
    .map(({ id, distance }) => ({ id, distance }));
}

/**
 * Rank laundry partners for an order: must be active and offer the services the
 * order needs; ordered by distance from the customer, with a small penalty for
 * shops that are already busy so work spreads out.
 */
async function rankVendors(
  order: Awaited<ReturnType<typeof loadOrder>>,
  radiusKm: number,
  exclude: string[] = [],
): Promise<{ id: string; distance: number | null }[]> {
  const categoryIds = order.serviceCategoryIds ?? [];
  const vendors = await prisma.vendor.findMany({
    where: {
      status: 'ACTIVE',
      user: { status: 'ACTIVE' },
      ...(exclude.length ? { id: { notIn: exclude } } : {}),
      ...(categoryIds.length ? { services: { some: { isEnabled: true, serviceCategoryId: { in: categoryIds } } } } : {}),
    },
    include: { _count: { select: { orders: { where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } } } } } },
  });

  return vendors
    .map((v) => {
      const distance =
        order.addressLat != null && order.addressLng != null && v.latitude != null && v.longitude != null
          ? round2(distanceKm(order.addressLat, order.addressLng, v.latitude, v.longitude))
          : null;
      const sameCity = Boolean(order.city && v.city.toLowerCase() === order.city.toLowerCase());
      const load = v._count.orders / Math.max(1, v.dailyCapacityKg / 5);
      return { id: v.id, distance, sameCity, score: (distance ?? (sameCity ? 5 : 500)) + load * 2 };
    })
    .filter((v) => (v.distance == null ? v.sameCity : v.distance <= radiusKm))
    .sort((a, b) => a.score - b.score)
    .slice(0, env.DISPATCH_MAX_CANDIDATES)
    .map(({ id, distance }) => ({ id, distance }));
}

// ---------------------------------------------------------------------------
// Starting a cascade
// ---------------------------------------------------------------------------

async function cancelActiveDispatches(orderId: string, kind?: DispatchKind) {
  const active = await prisma.dispatch.findMany({ where: { orderId, status: 'ACTIVE', ...(kind ? { kind } : {}) } });
  for (const d of active) {
    if (d.currentOfferId) clearOfferTimer(d.currentOfferId);
    await prisma.dispatch.update({ where: { id: d.id }, data: { status: 'CANCELLED', currentOfferId: null, expiresAt: null } });
    if (d.kind === 'VENDOR') {
      await prisma.vendorRequest.updateMany({ where: { orderId, status: 'OFFERED' }, data: { status: 'CANCELLED', respondedAt: new Date() } });
    } else {
      await prisma.pickupRequest.updateMany({
        where: { orderId, leg: LEG_OF[d.kind]!, status: 'OFFERED' },
        data: { status: 'CANCELLED', respondedAt: new Date() },
      });
    }
  }
}

/**
 * Riders who have already refused this leg (declined, or let the offer run out).
 * A restarted cascade must skip them, otherwise the order ping-pongs between the
 * same riders forever.
 */
async function ridersWhoRefused(orderId: string, leg: RequestLeg): Promise<string[]> {
  const rows = await prisma.pickupRequest.findMany({
    where: { orderId, leg, status: { in: ['DECLINED', 'EXPIRED'] } },
    select: { riderId: true },
    distinct: ['riderId'],
  });
  return rows.map((r) => r.riderId);
}

/** Same, for laundry partners. */
async function vendorsWhoRefused(orderId: string): Promise<string[]> {
  const rows = await prisma.vendorRequest.findMany({
    where: { orderId, status: { in: ['DECLINED', 'EXPIRED'] } },
    select: { vendorId: true },
    distinct: ['vendorId'],
  });
  return rows.map((r) => r.vendorId);
}

/** Start (or restart) the rider waterfall for a leg. Returns candidates found. */
export async function startRiderDispatch(
  orderId: string,
  leg: RequestLeg,
  opts: { riderIds?: string[]; includeRefused?: boolean } = {},
): Promise<number> {
  const order = await loadOrder(orderId);
  if (order.status === 'CANCELLED' || order.status === 'DELIVERED') throw unprocessable('Order is closed');
  if (leg === 'PICKUP' && order.pickupRiderId) throw conflict('A pickup rider is already assigned');
  if (leg === 'DELIVERY' && order.deliveryRiderId) throw conflict('A delivery rider is already assigned');

  const kind = RIDER_KIND[leg];
  await cancelActiveDispatches(orderId, kind);

  // Riders who already said no are skipped, so a restarted cascade cannot
  // ping-pong between the same riders. Two cases override that: an admin
  // pinning specific riders, and an admin pressing "search again" - a
  // deliberate human decision to give everyone another go.
  const refused = opts.riderIds?.length || opts.includeRefused ? [] : await ridersWhoRefused(orderId, leg);
  const candidates = opts.riderIds?.length
    ? opts.riderIds.map((id) => ({ id, distance: null as number | null }))
    : await rankRiders(order, leg, env.DISPATCH_RADIUS_KM, refused);

  if (candidates.length === 0) {
    await noCandidates(
      order,
      kind,
      refused.length ? `All ${refused.length} rider(s) in range already declined this order` : 'No riders are online nearby',
    );
    return 0;
  }

  const dispatch = await prisma.dispatch.create({
    data: { orderId, kind, candidates: candidates.map((c) => c.id), radiusKm: env.DISPATCH_RADIUS_KM },
  });
  await addEvent(prisma, orderId, {
    type: 'DISPATCH',
    title: `${leg === 'PICKUP' ? 'Pickup' : 'Delivery'} search started`,
    description: `${candidates.length} rider(s) in range, offered one at a time`,
  });
  await offerNext(dispatch.id);
  return candidates.length;
}

/** Start the laundry-partner waterfall (called once a pickup rider accepts). */
export async function startVendorDispatch(
  orderId: string,
  opts: { vendorIds?: string[]; includeRefused?: boolean } = {},
): Promise<number> {
  const order = await loadOrder(orderId);
  if (order.status === 'CANCELLED' || order.status === 'DELIVERED') throw unprocessable('Order is closed');
  if (order.vendorId) throw conflict('A laundry partner is already assigned');

  await cancelActiveDispatches(orderId, 'VENDOR');

  const refused = opts.vendorIds?.length || opts.includeRefused ? [] : await vendorsWhoRefused(orderId);
  const candidates = opts.vendorIds?.length
    ? opts.vendorIds.map((id) => ({ id, distance: null as number | null }))
    : await rankVendors(order, env.DISPATCH_RADIUS_KM, refused);

  if (candidates.length === 0) {
    await noCandidates(
      order,
      'VENDOR',
      refused.length
        ? `All ${refused.length} partner(s) in range already declined this order`
        : 'No laundry partner in range offers these services',
    );
    return 0;
  }

  const dispatch = await prisma.dispatch.create({
    data: { orderId, kind: 'VENDOR', candidates: candidates.map((c) => c.id), radiusKm: env.DISPATCH_RADIUS_KM },
  });
  await addEvent(prisma, orderId, {
    type: 'DISPATCH',
    title: 'Laundry partner search started',
    description: `${candidates.length} partner(s) in range, offered one at a time`,
  });
  await offerNext(dispatch.id);
  return candidates.length;
}

async function noCandidates(order: Awaited<ReturnType<typeof loadOrder>>, kind: DispatchKind, reason: string) {
  logger.warn({ orderId: order.id, kind }, reason);
  await addEvent(prisma, order.id, { type: 'DISPATCH', title: 'Manual assignment needed', description: reason });
  await notifyAdmins({
    title: kind === 'VENDOR' ? 'Laundry partner needed' : 'Rider needed',
    message: `${reason} for order ${order.orderNumber}. Please assign manually.`,
    type: kind === 'VENDOR' ? 'VENDOR' : 'RIDER',
    data: { orderId: order.id, kind },
  });
}

// ---------------------------------------------------------------------------
// The waterfall itself
// ---------------------------------------------------------------------------

/**
 * Offer the order to `candidates[cursor]`. Returns false when the list is
 * exhausted (after one widening round) and admins have been alerted.
 */
async function offerNext(dispatchId: string): Promise<boolean> {
  const dispatch = await prisma.dispatch.findUnique({ where: { id: dispatchId } });
  if (!dispatch || dispatch.status !== 'ACTIVE') return false;

  const order = await loadOrder(dispatch.orderId);
  if (order.status === 'CANCELLED') {
    await prisma.dispatch.update({ where: { id: dispatch.id }, data: { status: 'CANCELLED', currentOfferId: null, expiresAt: null } });
    return false;
  }

  // somebody took it while we were moving along the list
  const alreadyTaken =
    dispatch.kind === 'VENDOR'
      ? Boolean(order.vendorId)
      : dispatch.kind === 'RIDER_PICKUP'
        ? Boolean(order.pickupRiderId)
        : Boolean(order.deliveryRiderId);
  if (alreadyTaken) {
    await prisma.dispatch.update({ where: { id: dispatch.id }, data: { status: 'FULFILLED', currentOfferId: null, expiresAt: null } });
    return false;
  }

  if (dispatch.cursor >= dispatch.candidates.length) return widenOrGiveUp(dispatch, order);

  const candidateId = dispatch.candidates[dispatch.cursor]!;
  const ttl = dispatch.kind === 'VENDOR' ? env.VENDOR_REQUEST_TTL_SECONDS : env.PICKUP_REQUEST_TTL_SECONDS;
  const expiresAt = dayjs().add(ttl, 'second').toDate();
  const position = `${dispatch.cursor + 1} of ${dispatch.candidates.length}`;

  if (dispatch.kind === 'VENDOR') {
    const vendor = await prisma.vendor.findUnique({ where: { id: candidateId } });
    if (!vendor || vendor.status !== 'ACTIVE') return advance(dispatch.id, 'candidate unavailable');
    const payout = round2(Number(order.subtotal) * (1 - vendor.commissionRate / 100));
    const distance =
      order.addressLat != null && order.addressLng != null && vendor.latitude != null && vendor.longitude != null
        ? round2(distanceKm(order.addressLat, order.addressLng, vendor.latitude, vendor.longitude))
        : null;

    const req = await prisma.vendorRequest.create({
      data: { orderId: order.id, vendorId: vendor.id, payout, distanceKm: distance, expiresAt },
      include: { order: { include: orderInclude } },
    });
    await prisma.dispatch.update({ where: { id: dispatch.id }, data: { currentOfferId: req.id, expiresAt } });
    scheduleOfferExpiry(dispatch.id, req.id, 'VENDOR', ttl);

    realtime.toUser(vendor.userId, 'vendor_request:new', serializeVendorRequest(req));
    await notifyUser(vendor.userId, {
      title: 'New order request',
      message: `${order.customer.user.name} • ${order.itemsCount} items • ${order.serviceSummary} • ₹${payout}`,
      type: 'ORDER',
      data: { requestId: req.id, orderId: order.id },
    });
    await addEvent(prisma, order.id, { type: 'DISPATCH', title: `Offered to ${vendor.shopName}`, description: `Partner ${position}` });
    return true;
  }

  const leg = LEG_OF[dispatch.kind]!;
  const rider = await prisma.rider.findUnique({ where: { id: candidateId }, include: { user: true } });
  if (!rider || rider.availability !== 'ONLINE' || rider.onboardingStatus !== 'APPROVED') return advance(dispatch.id, 'candidate unavailable');

  const payout = await riderLegPayout(order.distanceKm);
  const origin = leg === 'PICKUP' ? { lat: order.addressLat, lng: order.addressLng } : { lat: order.vendor?.latitude, lng: order.vendor?.longitude };
  const distance =
    origin.lat != null && origin.lng != null && rider.currentLat != null && rider.currentLng != null
      ? round2(distanceKm(origin.lat, origin.lng, rider.currentLat, rider.currentLng))
      : null;

  const req = await prisma.pickupRequest.create({
    data: { orderId: order.id, riderId: rider.id, leg, payout, distanceKm: distance, expiresAt },
    include: { order: { include: orderInclude } },
  });
  await prisma.dispatch.update({ where: { id: dispatch.id }, data: { currentOfferId: req.id, expiresAt } });
  scheduleOfferExpiry(dispatch.id, req.id, dispatch.kind, ttl);

  realtime.toUser(rider.userId, 'pickup_request:new', serializeRequest(req));
  await notifyUser(rider.userId, {
    title: leg === 'PICKUP' ? 'New pickup request' : 'New delivery request',
    message: `${order.customer.user.name} • ${order.itemsCount} items • ₹${payout}`,
    type: 'ORDER',
    data: { requestId: req.id, orderId: order.id, leg },
  });
  await addEvent(prisma, order.id, { type: 'DISPATCH', title: `Offered to ${rider.user.name}`, description: `Rider ${position}` });
  return true;
}

/** Move the cursor on and offer the next candidate straight away. */
async function advance(dispatchId: string, reason: string, expectOfferId: string | null = null): Promise<boolean> {
  // Conditional on the offer we believe is live, so that two callers racing to
  // retire the same offer - the per-offer timer and the sweeper, or a decline
  // arriving just as the timer fires - cannot each bump the cursor and skip a
  // candidate. Whoever loses the race sees 0 rows updated and stops.
  const { count } = await prisma.dispatch.updateMany({
    where: { id: dispatchId, status: 'ACTIVE', currentOfferId: expectOfferId },
    data: { cursor: { increment: 1 }, currentOfferId: null, expiresAt: null },
  });
  if (count === 0) {
    logger.debug({ dispatchId, reason }, 'dispatch: already moved on, nothing to do');
    return false;
  }
  logger.debug({ dispatchId, reason }, 'dispatch: passing to next candidate');
  return offerNext(dispatchId);
}

// ---------------------------------------------------------------------------
// Pass-on timing
// ---------------------------------------------------------------------------

/**
 * One timer per live offer, so an unanswered offer is retired the instant it
 * runs out instead of waiting for the next sweep. The sweeper stays as the
 * safety net for offers whose timer was lost - another instance created them,
 * or this process restarted - but in normal running the timer gets there first
 * and the hand-off is immediate.
 */
const offerTimers = new Map<string, NodeJS.Timeout>();

function clearOfferTimer(offerId: string) {
  const t = offerTimers.get(offerId);
  if (t) {
    clearTimeout(t);
    offerTimers.delete(offerId);
  }
}

function scheduleOfferExpiry(dispatchId: string, offerId: string, kind: DispatchKind, ttlSeconds: number) {
  clearOfferTimer(offerId);
  const timer = setTimeout(
    () => {
      offerTimers.delete(offerId);
      expireOfferAndAdvance(dispatchId, offerId, kind).catch((err) =>
        logger.error({ err, dispatchId, offerId }, 'offer expiry timer failed'),
      );
    },
    // a hair past the deadline so a rider tapping Accept on the last tick wins
    ttlSeconds * 1000 + 150,
  );
  timer.unref();
  offerTimers.set(offerId, timer);
}

/**
 * Mark a lapsed offer EXPIRED, tell the holder so their screen closes, and move
 * the cascade on. Safe to call twice: the status update is conditional and
 * `advance` is guarded on the offer id.
 */
async function expireOfferAndAdvance(dispatchId: string, offerId: string, kind: DispatchKind): Promise<void> {
  const now = new Date();
  if (kind === 'VENDOR') {
    const { count } = await prisma.vendorRequest.updateMany({
      where: { id: offerId, status: 'OFFERED' },
      data: { status: 'EXPIRED', respondedAt: now },
    });
    if (count > 0) {
      const req = await prisma.vendorRequest.findUnique({ where: { id: offerId }, include: { vendor: { select: { userId: true } } } });
      if (req) realtime.toUser(req.vendor.userId, 'vendor_request:expired', { requestId: req.id, orderId: req.orderId });
    }
  } else {
    const { count } = await prisma.pickupRequest.updateMany({
      where: { id: offerId, status: 'OFFERED' },
      data: { status: 'EXPIRED', respondedAt: now },
    });
    if (count > 0) {
      const req = await prisma.pickupRequest.findUnique({ where: { id: offerId }, include: { rider: { select: { userId: true } } } });
      if (req) realtime.toUser(req.rider.userId, 'pickup_request:expired', { requestId: req.id, orderId: req.orderId });
    }
  }
  await advance(dispatchId, 'offer expired', offerId);
}

/** Nobody in the list took it: widen the radius once, then hand over to admins. */
async function widenOrGiveUp(dispatch: Dispatch, order: Awaited<ReturnType<typeof loadOrder>>): Promise<boolean> {
  if (dispatch.round === 1) {
    const radiusKm = (dispatch.radiusKm ?? env.DISPATCH_RADIUS_KM) * 2;
    const tried = dispatch.candidates;
    const skip =
      dispatch.kind === 'VENDOR'
        ? [...new Set([...tried, ...(await vendorsWhoRefused(order.id))])]
        : [...new Set([...tried, ...(await ridersWhoRefused(order.id, LEG_OF[dispatch.kind]!))])];
    const more =
      dispatch.kind === 'VENDOR'
        ? await rankVendors(order, radiusKm, skip)
        : await rankRiders(order, LEG_OF[dispatch.kind]!, radiusKm, skip);

    if (more.length > 0) {
      await prisma.dispatch.update({
        where: { id: dispatch.id },
        data: { candidates: [...tried, ...more.map((c) => c.id)], round: 2, radiusKm, currentOfferId: null, expiresAt: null },
      });
      await addEvent(prisma, order.id, {
        type: 'DISPATCH',
        title: 'Search radius widened',
        description: `Nobody accepted within ${dispatch.radiusKm ?? env.DISPATCH_RADIUS_KM} km; trying ${more.length} more within ${radiusKm} km`,
      });
      return offerNext(dispatch.id);
    }
  }

  await prisma.dispatch.update({
    where: { id: dispatch.id },
    data: { status: 'EXHAUSTED', exhaustedAt: new Date(), currentOfferId: null, expiresAt: null },
  });
  await noCandidates(
    order,
    dispatch.kind,
    dispatch.kind === 'VENDOR' ? 'Every nearby laundry partner declined or did not respond' : 'Every nearby rider declined or did not respond',
  );
  return false;
}

// ---------------------------------------------------------------------------
// Rider responses
// ---------------------------------------------------------------------------

export async function acceptRequest(requestId: string, riderId: string) {
  clearOfferTimer(requestId);
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
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
    await tx.dispatch.updateMany({
      where: { orderId: order.id, kind: RIDER_KIND[req.leg], status: 'ACTIVE' },
      data: { status: 'FULFILLED', currentOfferId: null, expiresAt: null },
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

  // The rider is now on the way to the customer - look for a laundry partner in
  // parallel (unless one is already assigned).
  if (result.req.leg === 'PICKUP' && !result.order.vendorId) {
    await startVendorDispatch(result.order.id).catch((err) => logger.error({ err, orderId: result.order.id }, 'vendor dispatch failed to start'));
  }

  return loadOrder(result.order.id);
}

export async function declineRequest(requestId: string, riderId: string) {
  const req = await prisma.pickupRequest.findUnique({ where: { id: requestId }, include: { rider: { select: { userId: true } } } });
  if (!req || req.riderId !== riderId) throw notFound('Request');
  if (req.status !== 'OFFERED') return req;

  clearOfferTimer(req.id);
  const updated = await prisma.pickupRequest.update({ where: { id: req.id }, data: { status: 'DECLINED', respondedAt: new Date() } });
  realtime.toUser(req.rider.userId, 'pickup_request:closed', { requestId: req.id, orderId: req.orderId });

  // pass it straight to the next nearest rider
  const dispatch = await prisma.dispatch.findFirst({
    where: { orderId: req.orderId, kind: RIDER_KIND[req.leg], status: 'ACTIVE', currentOfferId: req.id },
  });
  if (dispatch) await advance(dispatch.id, 'rider declined', req.id);
  return updated;
}

// ---------------------------------------------------------------------------
// Laundry partner responses
// ---------------------------------------------------------------------------

/** The offer a partner is currently holding for an order (or null). */
export async function activeVendorRequest(orderId: string, vendorId: string) {
  return prisma.vendorRequest.findFirst({ where: { orderId, vendorId, status: 'OFFERED' }, orderBy: { offeredAt: 'desc' } });
}

export async function acceptVendorRequest(orderId: string, vendorId: string) {
  const accepted = await prisma.$transaction(async (tx) => {
    const req = await tx.vendorRequest.findFirst({ where: { orderId, vendorId, status: 'OFFERED' }, orderBy: { offeredAt: 'desc' } });
    if (!req) throw notFound('Order request');
    clearOfferTimer(req.id);
    if (req.expiresAt < new Date()) {
      await tx.vendorRequest.update({ where: { id: req.id }, data: { status: 'EXPIRED', respondedAt: new Date() } });
      throw conflict('This request expired and has moved to another partner');
    }
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('Order');
    if (order.status === 'CANCELLED') throw conflict('Order was cancelled');
    if (order.vendorId) throw conflict('Another laundry partner already accepted this order');

    const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw notFound('Vendor');

    // money and distance depend on which partner took it
    const vendorEarning = round2(Number(order.subtotal) * (1 - vendor.commissionRate / 100));
    const platformCommission = round2(Number(order.subtotal) - vendorEarning);
    const dist =
      order.addressLat != null && order.addressLng != null && vendor.latitude != null && vendor.longitude != null
        ? round2(distanceKm(order.addressLat, order.addressLng, vendor.latitude, vendor.longitude))
        : order.distanceKm;

    await tx.vendorRequest.update({ where: { id: req.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
    await tx.vendorRequest.updateMany({
      where: { orderId, status: 'OFFERED', id: { not: req.id } },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
    await tx.dispatch.updateMany({
      where: { orderId, kind: 'VENDOR', status: 'ACTIVE' },
      data: { status: 'FULFILLED', currentOfferId: null, expiresAt: null },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { vendorId, vendorAcceptedAt: new Date(), vendorEarning, platformCommission, distanceKm: dist },
    });
    await addEvent(tx, orderId, {
      type: 'VENDOR_ACCEPTED',
      title: 'Laundry partner assigned',
      description: vendor.shopName,
      actorUserId: vendor.userId,
      meta: { vendorId, distanceKm: dist },
    });
    return { vendor };
  });

  const o = await broadcastOrder(orderId);

  // tell the rider where to drop the clothes
  if (o.pickupRider) {
    realtime.toUser(o.pickupRider.userId, 'order:dropoff_assigned', {
      orderId: o.id,
      orderNumber: o.orderNumber,
      vendor: { name: accepted.vendor.shopName, address: accepted.vendor.shopAddress, lat: accepted.vendor.latitude, lng: accepted.vendor.longitude },
    });
    await notifyUser(o.pickupRider.userId, {
      title: 'Drop-off location confirmed',
      message: `Take order ${o.orderNumber} to ${accepted.vendor.shopName}, ${accepted.vendor.shopAddress}`,
      type: 'ORDER',
      data: { orderId: o.id, vendorId },
    });
  }
  await notifyUser(o.customer.userId, {
    title: 'Laundry partner confirmed',
    message: `${accepted.vendor.shopName} will take care of order ${o.orderNumber}.`,
    type: 'ORDER',
    data: { orderId: o.id },
  });
  return o;
}

export async function declineVendorRequest(orderId: string, vendorId: string, reason?: string) {
  const req = await prisma.vendorRequest.findFirst({ where: { orderId, vendorId, status: 'OFFERED' }, orderBy: { offeredAt: 'desc' } });
  if (!req) throw notFound('Order request');

  clearOfferTimer(req.id);
  await prisma.vendorRequest.update({ where: { id: req.id }, data: { status: 'DECLINED', respondedAt: new Date(), declineReason: reason } });
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { shopName: true, userId: true } });
  await addEvent(prisma, orderId, {
    type: 'VENDOR_DECLINED',
    title: 'Declined by laundry partner',
    description: `${vendor?.shopName ?? ''}${reason ? `: ${reason}` : ''}`,
  });
  if (vendor) realtime.toUser(vendor.userId, 'vendor_request:closed', { requestId: req.id, orderId });

  // pass it straight to the next nearest partner
  const dispatch = await prisma.dispatch.findFirst({ where: { orderId, kind: 'VENDOR', status: 'ACTIVE', currentOfferId: req.id } });
  if (dispatch) await advance(dispatch.id, 'vendor declined', req.id);
  return req;
}

// ---------------------------------------------------------------------------
// Manual assignment (admin)
// ---------------------------------------------------------------------------

export async function assignRider(orderId: string, riderId: string, leg: RequestLeg, actorUserId?: string) {
  const rider = await prisma.rider.findUnique({ where: { id: riderId }, include: { user: true } });
  if (!rider) throw notFound('Rider');
  const order = await loadOrder(orderId);
  const payout = await riderLegPayout(order.distanceKm);

  await cancelActiveDispatches(orderId, RIDER_KIND[leg]);
  await prisma.$transaction(async (tx) => {
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

  const updated =
    leg === 'PICKUP' && order.status === 'PENDING_PICKUP' ? await transitionOrder(orderId, 'ASSIGNED', { actorUserId }) : await broadcastOrder(orderId);

  if (leg === 'PICKUP' && !order.vendorId) {
    await startVendorDispatch(orderId).catch((err) => logger.error({ err, orderId }, 'vendor dispatch failed to start'));
  }
  return updated;
}

export async function assignVendor(orderId: string, vendorId: string, actorUserId?: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw notFound('Vendor');
  const order = await loadOrder(orderId);
  if (order.status === 'CANCELLED') throw unprocessable('Order was cancelled');

  await cancelActiveDispatches(orderId, 'VENDOR');
  const vendorEarning = round2(Number(order.subtotal) * (1 - vendor.commissionRate / 100));
  const dist =
    order.addressLat != null && order.addressLng != null && vendor.latitude != null && vendor.longitude != null
      ? round2(distanceKm(order.addressLat, order.addressLng, vendor.latitude, vendor.longitude))
      : order.distanceKm;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        vendorId,
        vendorAcceptedAt: new Date(),
        vendorEarning,
        platformCommission: round2(Number(order.subtotal) - vendorEarning),
        distanceKm: dist,
      },
    });
    await addEvent(tx, orderId, {
      type: 'VENDOR_ASSIGNED',
      title: 'Laundry partner assigned by admin',
      description: vendor.shopName,
      actorUserId,
      meta: { vendorId },
    });
  });

  await notifyUser(vendor.userId, {
    title: 'New order assigned',
    message: `Order ${order.orderNumber} has been assigned to your shop`,
    type: 'ORDER',
    data: { orderId },
  });
  const o = await broadcastOrder(orderId);
  if (o.pickupRider) {
    await notifyUser(o.pickupRider.userId, {
      title: 'Drop-off location confirmed',
      message: `Take order ${o.orderNumber} to ${vendor.shopName}, ${vendor.shopAddress}`,
      type: 'ORDER',
      data: { orderId, vendorId },
    });
  }
  return o;
}

/** Backwards-compatible alias used by the admin "re-dispatch" endpoint. */
export const offerLeg = startRiderDispatch;

// ---------------------------------------------------------------------------
// Sweeper: expire the live offer and move to the next candidate
// ---------------------------------------------------------------------------

export async function sweepDispatches() {
  const now = new Date();
  const due = await prisma.dispatch.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    select: { id: true, kind: true, currentOfferId: true, orderId: true },
  });

  for (const d of due) {
    // normally the offer's own timer got here first and this finds nothing to do
    if (d.currentOfferId) {
      await expireOfferAndAdvance(d.id, d.currentOfferId, d.kind).catch((err) =>
        logger.error({ err, dispatchId: d.id }, 'sweep: expiry failed'),
      );
    } else {
      await advance(d.id, 'offer expired').catch((err) => logger.error({ err, dispatchId: d.id }, 'advance failed'));
    }
  }

  // safety net: stray offers left OFFERED past their expiry
  await prisma.pickupRequest.updateMany({ where: { status: 'OFFERED', expiresAt: { lt: now } }, data: { status: 'EXPIRED', respondedAt: now } });
  await prisma.vendorRequest.updateMany({ where: { status: 'OFFERED', expiresAt: { lt: now } }, data: { status: 'EXPIRED', respondedAt: now } });
}

/** Cancel every open cascade for an order (used when an order is cancelled). */
export async function cancelDispatches(orderId: string) {
  await cancelActiveDispatches(orderId);
}

let sweeper: NodeJS.Timeout | null = null;
export function startDispatchSweeper(intervalMs = 1_000) {
  if (sweeper) return;
  sweeper = setInterval(() => {
    sweepDispatches().catch((err) => logger.error({ err }, 'dispatch sweeper failed'));
  }, intervalMs);
  sweeper.unref();
}
export function stopDispatchSweeper() {
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
}
