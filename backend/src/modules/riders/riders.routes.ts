import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import type { OrderStatus, RiderVehicle } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, paginated, parseBody, parsePagination, parseQuery } from '../../lib/http.js';
import { badRequest, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { compact, maskAccount } from '../../lib/utils.js';
import { requireRider } from '../../middleware/auth.js';
import { materializeDocuments } from '../../services/storage.js';
import { notifyAdmins } from '../../services/notifications.js';
import { addEvent, broadcastOrder, loadOrder, orderInclude, serializeOrder, transitionOrder } from '../../services/orders.js';
import { acceptRequest, declineRequest, serializeRequest } from '../../services/dispatch.js';
import { earningsSummary, partyBalance } from '../../services/ledger.js';
import { realtime } from '../../realtime/socket.js';
import { requestPayout } from '../payouts/payouts.service.js';

export const ridersRouter = Router();
ridersRouter.use(requireRider);

const VEHICLE_MAP: Record<string, RiderVehicle> = {
  motorcycle: 'MOTORCYCLE',
  bike: 'MOTORCYCLE',
  scooter: 'SCOOTER',
  bicycle: 'BICYCLE',
  cycle: 'BICYCLE',
  'electric bike': 'ELECTRIC_BIKE',
  electric_bike: 'ELECTRIC_BIKE',
  ebike: 'ELECTRIC_BIKE',
  van: 'VAN',
};
const vehicleSchema = z.string().transform((v, ctx) => {
  const m = VEHICLE_MAP[v.toLowerCase().trim()] ?? (Object.values(VEHICLE_MAP).includes(v as RiderVehicle) ? (v as RiderVehicle) : undefined);
  if (!m) ctx.addIssue({ code: 'custom', message: 'vehicleType must be Motorcycle, Scooter, Bicycle, Electric Bike or Van' });
  return m as RiderVehicle;
});

const docValue = z.string().min(1).optional();

async function me(riderId: string) {
  const rider = await prisma.rider.findUnique({
    where: { id: riderId },
    include: { user: { select: { id: true, name: true, phone: true, email: true, avatarUrl: true, status: true } }, zone: true },
  });
  if (!rider) throw notFound('Rider');
  return { ...rider, bankAccountNumber: maskAccount(rider.bankAccountNumber), aadhaarNumber: rider.aadhaarNumber ? `XXXX XXXX ${rider.aadhaarNumber.slice(-4)}` : null };
}

function assertApproved(status: string) {
  if (status !== 'APPROVED') throw forbidden('Your application is still under review');
}

// ---- Profile & onboarding ----------------------------------------------------

ridersRouter.get('/me', asyncHandler(async (req, res) => res.json(await me(req.user!.riderId!))));

ridersRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({ name: z.string().min(2).optional(), email: z.string().email().optional(), dateOfBirth: z.coerce.date().optional(), zoneId: z.number().int().nullable().optional(), upiId: z.string().optional(), profilePhoto: docValue }),
      req.body,
    );
    if (body.name || body.email) await prisma.user.update({ where: { id: req.user!.id }, data: compact({ name: body.name, email: body.email }) });
    const rider = await prisma.rider.findUnique({ where: { id: req.user!.riderId } });
    const docs = body.profilePhoto ? await materializeDocuments({ profilePhoto: body.profilePhoto }, `riders/${req.user!.riderId}`) : {};
    if (docs.profilePhoto) await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl: docs.profilePhoto } });
    await prisma.rider.update({
      where: { id: req.user!.riderId },
      data: compact({ dateOfBirth: body.dateOfBirth, zoneId: body.zoneId, upiId: body.upiId, documents: { ...(rider?.documents as object), ...docs } }),
    });
    res.json(await me(req.user!.riderId!));
  }),
);

/** Registration step 2 */
ridersRouter.put(
  '/me/vehicle',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({ vehicleType: vehicleSchema, vehicleNumber: z.string().min(4).max(20), drivingLicenseNumber: z.string().min(5).max(30), drivingLicensePhoto: docValue }),
      req.body,
    );
    const rider = await prisma.rider.findUnique({ where: { id: req.user!.riderId } });
    if (!rider) throw notFound('Rider');
    const docs = await materializeDocuments({ drivingLicense: body.drivingLicensePhoto }, `riders/${rider.id}`);
    await prisma.rider.update({
      where: { id: rider.id },
      data: {
        vehicleType: body.vehicleType,
        vehicleNumber: body.vehicleNumber.toUpperCase(),
        drivingLicenseNumber: body.drivingLicenseNumber.toUpperCase(),
        documents: { ...(rider.documents as object), ...docs },
        onboardingStatus: rider.onboardingStatus === 'PERSONAL_DETAILS' ? 'VEHICLE_DETAILS' : rider.onboardingStatus,
      },
    });
    res.json(await me(rider.id));
  }),
);

/** Registration step 3: documents + bank, submits KYC for admin review. */
ridersRouter.put(
  '/me/documents',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        aadhaarNumber: z.string().regex(/^\d{12}$/).optional(),
        aadhaarFront: docValue,
        aadhaarBack: docValue,
        selfie: docValue,
        profilePhoto: docValue,
        panNumber: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/i, 'Invalid PAN'),
        bankAccountNumber: z.string().min(6).max(24),
        ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i, 'Invalid IFSC'),
        bankName: z.string().optional(),
      }),
      req.body,
    );
    const rider = await prisma.rider.findUnique({ where: { id: req.user!.riderId }, include: { user: true } });
    if (!rider) throw notFound('Rider');
    if (rider.onboardingStatus === 'APPROVED') throw unprocessable('Your account is already approved');

    const docs = await materializeDocuments(
      { aadhaarFront: body.aadhaarFront, aadhaarBack: body.aadhaarBack, selfie: body.selfie, profilePhoto: body.profilePhoto },
      `riders/${rider.id}`,
    );
    const documents = { ...(rider.documents as Record<string, string>), ...docs };

    await prisma.$transaction(async (tx) => {
      await tx.rider.update({
        where: { id: rider.id },
        data: {
          aadhaarNumber: body.aadhaarNumber,
          panNumber: body.panNumber.toUpperCase(),
          bankAccountNumber: body.bankAccountNumber,
          ifscCode: body.ifscCode.toUpperCase(),
          bankName: body.bankName,
          documents,
          onboardingStatus: 'UNDER_REVIEW',
        },
      });
      if (docs.profilePhoto) await tx.user.update({ where: { id: rider.userId }, data: { avatarUrl: docs.profilePhoto } });
      // one open verification per rider
      await tx.verification.updateMany({ where: { riderId: rider.id, status: 'PENDING_REVIEW' }, data: { status: 'REJECTED', rejectionReason: 'Superseded by a newer submission' } });
      await tx.verification.create({
        data: { type: 'RIDER', userId: rider.userId, riderId: rider.id, idNumber: body.aadhaarNumber ?? body.panNumber.toUpperCase(), documents },
      });
    });
    await notifyAdmins({ title: 'New KYC Submitted', message: `Rider ${rider.user.name} submitted documents for review`, type: 'SYSTEM', data: { riderId: rider.id } });
    res.json(await me(rider.id));
  }),
);

/** Post-login identity selfie (rider app "Identity Verification" step). */
ridersRouter.post(
  '/me/selfie',
  asyncHandler(async (req, res) => {
    const { image } = parseBody(z.object({ image: z.string().min(20) }), req.body);
    const rider = await prisma.rider.findUnique({ where: { id: req.user!.riderId } });
    if (!rider) throw notFound('Rider');
    const docs = await materializeDocuments({ selfie: image }, `riders/${rider.id}/selfies`);
    if (!docs.selfie) throw badRequest('Could not read the selfie image');
    const documents = { ...(rider.documents as Record<string, string>), selfie: docs.selfie, selfieAt: new Date().toISOString() };
    await prisma.rider.update({ where: { id: rider.id }, data: { documents } });
    res.json({ verified: true, selfieUrl: docs.selfie, verifiedAt: documents.selfieAt });
  }),
);

ridersRouter.get(
  '/me/onboarding',
  asyncHandler(async (req, res) => {
    const rider = await prisma.rider.findUnique({ where: { id: req.user!.riderId }, include: { verifications: { orderBy: { submittedAt: 'desc' }, take: 1 } } });
    if (!rider) throw notFound('Rider');
    res.json({ status: rider.onboardingStatus, latestVerification: rider.verifications[0] ?? null });
  }),
);

// ---- Availability & location ------------------------------------------------

ridersRouter.post(
  '/me/availability',
  asyncHandler(async (req, res) => {
    const { availability } = parseBody(z.object({ availability: z.enum(['ONLINE', 'OFFLINE']) }), req.body);
    const rider = await prisma.rider.findUnique({ where: { id: req.user!.riderId } });
    if (!rider) throw notFound('Rider');
    assertApproved(rider.onboardingStatus);
    if (rider.availability === 'ON_DELIVERY' && availability === 'OFFLINE') throw unprocessable('Finish your active delivery before going offline');
    const updated = await prisma.rider.update({ where: { id: rider.id }, data: { availability } });
    realtime.toAdmins('rider:availability', { riderId: rider.id, availability, name: req.user!.name });
    res.json({ availability: updated.availability });
  }),
);

ridersRouter.post(
  '/me/location',
  asyncHandler(async (req, res) => {
    const { lat, lng, orderId } = parseBody(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), orderId: z.string().optional() }), req.body);
    await prisma.rider.update({ where: { id: req.user!.riderId }, data: { currentLat: lat, currentLng: lng, lastLocationAt: new Date() } });
    const payload = { riderId: req.user!.riderId, lat, lng, at: new Date().toISOString() };
    realtime.toAdmins('rider:location', payload);
    const activeOrders = orderId
      ? [{ id: orderId }]
      : await prisma.order.findMany({
          where: { OR: [{ pickupRiderId: req.user!.riderId }, { deliveryRiderId: req.user!.riderId }], status: { in: ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] } },
          select: { id: true },
        });
    for (const o of activeOrders) realtime.toOrder(o.id, 'rider:location', { ...payload, orderId: o.id });
    res.json({ ok: true });
  }),
);

// ---- Pickup / delivery requests ---------------------------------------------

ridersRouter.get(
  '/me/requests',
  asyncHandler(async (req, res) => {
    const requests = await prisma.pickupRequest.findMany({
      where: { riderId: req.user!.riderId, status: 'OFFERED', expiresAt: { gt: new Date() } },
      include: { order: { include: orderInclude } },
      orderBy: { offeredAt: 'desc' },
    });
    res.json({ data: requests.map(serializeRequest) });
  }),
);

ridersRouter.post(
  '/me/requests/:id/accept',
  asyncHandler(async (req, res) => {
    const rider = await prisma.rider.findUnique({ where: { id: req.user!.riderId } });
    assertApproved(rider?.onboardingStatus ?? '');
    const order = await acceptRequest(req.params.id!, req.user!.riderId!);
    res.json(serializeOrder(order, 'rider'));
  }),
);

ridersRouter.post(
  '/me/requests/:id/decline',
  asyncHandler(async (req, res) => {
    await declineRequest(req.params.id!, req.user!.riderId!);
    res.json({ message: 'Request declined' });
  }),
);

// ---- Orders -----------------------------------------------------------------

const ACTIVE: OrderStatus[] = ['ASSIGNED', 'PICKED_UP', 'READY', 'OUT_FOR_DELIVERY'];

ridersRouter.get(
  '/me/orders',
  asyncHandler(async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(['active', 'history', 'all']).default('active') }), req.query);
    const p = parsePagination(req.query);
    const riderId = req.user!.riderId!;
    const where = {
      OR: [{ pickupRiderId: riderId }, { deliveryRiderId: riderId }],
      ...(q.status === 'active' ? { status: { in: ACTIVE } } : q.status === 'history' ? { status: { in: ['IN_LAUNDRY', 'WASHING', 'IRONING', 'QUALITY_CHECK', 'DELIVERED', 'CANCELLED'] as OrderStatus[] } } : {}),
    };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({ where, include: orderInclude, orderBy: { updatedAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.order.count({ where }),
    ]);
    res.json(
      paginated(
        orders.map((o) => ({
          ...serializeOrder(o, 'rider'),
          myLeg: o.deliveryRiderId === riderId && ['READY', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status) ? 'DELIVERY' : o.pickupRiderId === riderId ? 'PICKUP' : 'DELIVERY',
        })),
        total,
        p,
      ),
    );
  }),
);

async function riderOrder(orderId: string, riderId: string) {
  const order = await loadOrder(orderId);
  if (order.pickupRiderId !== riderId && order.deliveryRiderId !== riderId) throw notFound('Order');
  return order;
}

ridersRouter.get(
  '/me/orders/:id',
  asyncHandler(async (req, res) => {
    res.json(serializeOrder(await riderOrder(req.params.id!, req.user!.riderId!), 'rider'));
  }),
);

const otpBody = z.object({ otp: z.string().regex(/^\d{4}$/, 'OTP must be 4 digits') });

/** Rider weighs / counts the load at the doorstep before taking the OTP. */
ridersRouter.post(
  '/me/orders/:id/weigh',
  asyncHandler(async (req, res) => {
    const b = parseBody(z.object({ weightKg: z.number().positive().max(200), itemsCount: z.number().int().positive().optional(), note: z.string().max(300).optional(), photo: z.string().optional() }), req.body);
    const order = await riderOrder(req.params.id!, req.user!.riderId!);
    if (order.pickupRiderId !== req.user!.riderId) throw forbidden('You are not the pickup rider for this order');
    if (!['ASSIGNED', 'PICKED_UP'].includes(order.status)) throw unprocessable(`Order is ${order.status}`);
    const docs = b.photo ? await materializeDocuments({ photo: b.photo }, `orders/${order.id}`) : {};
    await prisma.order.update({ where: { id: order.id }, data: { actualWeightKg: b.weightKg, ...(b.itemsCount ? { itemsCount: b.itemsCount } : {}) } });
    await addEvent(prisma, order.id, {
      type: 'WEIGHED',
      title: `Load weighed: ${b.weightKg} kg${b.itemsCount ? ` • ${b.itemsCount} items` : ''}`,
      description: b.note,
      actorUserId: req.user!.id,
      meta: { weightKg: b.weightKg, itemsCount: b.itemsCount, photo: docs.photo },
    });
    res.json(serializeOrder(await broadcastOrder(order.id), 'rider'));
  }),
);

/** Rider collected clothes from the customer (customer shows OTP). */
ridersRouter.post(
  '/me/orders/:id/confirm-pickup',
  asyncHandler(async (req, res) => {
    const { otp } = parseBody(otpBody, req.body);
    const order = await riderOrder(req.params.id!, req.user!.riderId!);
    if (order.pickupRiderId !== req.user!.riderId) throw forbidden('You are not the pickup rider for this order');
    if (order.status !== 'ASSIGNED') throw unprocessable(`Order is ${order.status}, expected ASSIGNED`);
    if (otp !== order.customerPickupOtp) throw badRequest('Incorrect pickup OTP');
    const updated = await transitionOrder(order.id, 'PICKED_UP', { actorUserId: req.user!.id, description: 'Rider collected clothes from customer' });
    res.json(serializeOrder(updated, 'rider'));
  }),
);

/** Rider dropped clothes at the vendor (vendor shows OTP). */
ridersRouter.post(
  '/me/orders/:id/confirm-dropoff',
  asyncHandler(async (req, res) => {
    const { otp } = parseBody(otpBody, req.body);
    const order = await riderOrder(req.params.id!, req.user!.riderId!);
    if (order.pickupRiderId !== req.user!.riderId) throw forbidden('You are not the pickup rider for this order');
    if (order.status !== 'PICKED_UP') throw unprocessable(`Order is ${order.status}, expected PICKED_UP`);
    if (otp !== order.vendorDropOtp) throw badRequest('Incorrect vendor OTP');
    const updated = await transitionOrder(order.id, 'IN_LAUNDRY', { actorUserId: req.user!.id, description: `Dropped at ${order.vendor?.shopName ?? 'laundry partner'}` });
    res.json(serializeOrder(updated, 'rider'));
  }),
);

/** Delivery rider collected the finished order from the vendor (vendor shows handover OTP). */
ridersRouter.post(
  '/me/orders/:id/confirm-handover',
  asyncHandler(async (req, res) => {
    const { otp } = parseBody(otpBody, req.body);
    const order = await riderOrder(req.params.id!, req.user!.riderId!);
    if (order.deliveryRiderId !== req.user!.riderId) throw forbidden('You are not the delivery rider for this order');
    if (order.status !== 'READY') throw unprocessable(`Order is ${order.status}, expected READY`);
    if (otp !== order.vendorHandoverOtp) throw badRequest('Incorrect handover OTP');
    const updated = await transitionOrder(order.id, 'OUT_FOR_DELIVERY', { actorUserId: req.user!.id, description: 'Rider collected order from laundry partner' });
    res.json(serializeOrder(updated, 'rider'));
  }),
);

/** Delivered to customer (customer shows delivery OTP). */
ridersRouter.post(
  '/me/orders/:id/confirm-delivery',
  asyncHandler(async (req, res) => {
    const { otp, collectedCash } = parseBody(otpBody.extend({ collectedCash: z.boolean().optional() }), req.body);
    const order = await riderOrder(req.params.id!, req.user!.riderId!);
    if (order.deliveryRiderId !== req.user!.riderId) throw forbidden('You are not the delivery rider for this order');
    if (order.status !== 'OUT_FOR_DELIVERY') throw unprocessable(`Order is ${order.status}, expected OUT_FOR_DELIVERY`);
    if (otp !== order.customerDeliveryOtp) throw badRequest('Incorrect delivery OTP');
    if (order.paymentMethod === 'COD' && collectedCash === false) throw unprocessable('Collect cash before completing a COD delivery');
    const updated = await transitionOrder(order.id, 'DELIVERED', { actorUserId: req.user!.id, description: 'Delivered to customer' });
    res.json(serializeOrder(updated, 'rider'));
  }),
);

// ---- Earnings & payouts -----------------------------------------------------

ridersRouter.get(
  '/me/earnings',
  asyncHandler(async (req, res) => {
    const riderId = req.user!.riderId!;
    const party = { type: 'RIDER' as const, id: riderId };
    const [summary, balance, recent, rider] = await Promise.all([
      earningsSummary(party),
      partyBalance(party),
      prisma.ledgerEntry.findMany({ where: { riderId }, orderBy: { createdAt: 'desc' }, take: 30, include: { order: { select: { orderNumber: true, customer: { select: { user: { select: { name: true } } } } } } } }),
      prisma.rider.findUnique({ where: { id: riderId }, select: { bankName: true, bankAccountNumber: true, upiId: true } }),
    ]);
    res.json({
      ...summary,
      ...balance,
      bank: { bankName: rider?.bankName, account: maskAccount(rider?.bankAccountNumber), upiId: rider?.upiId },
      transactions: recent.map((e) => ({
        id: e.id,
        kind: e.kind,
        amount: e.amount,
        description: e.description,
        orderNumber: e.order?.orderNumber,
        customerName: e.order?.customer.user.name,
        createdAt: e.createdAt,
      })),
    });
  }),
);

ridersRouter.get(
  '/me/payouts',
  asyncHandler(async (req, res) => {
    res.json({ data: await prisma.payout.findMany({ where: { riderId: req.user!.riderId }, orderBy: { requestedAt: 'desc' }, take: 50 }) });
  }),
);

ridersRouter.post(
  '/me/payouts',
  asyncHandler(async (req, res) => {
    const { amount } = parseBody(z.object({ amount: z.number().positive().optional() }), req.body ?? {});
    res.status(201).json(await requestPayout({ type: 'RIDER', id: req.user!.riderId! }, amount));
  }),
);

ridersRouter.get(
  '/me/dashboard',
  asyncHandler(async (req, res) => {
    const riderId = req.user!.riderId!;
    const start = dayjs().startOf('day').toDate();
    const [rider, todayLegs, summary, balance, active] = await Promise.all([
      prisma.rider.findUnique({ where: { id: riderId }, select: { availability: true, rating: true, totalDeliveries: true, onboardingStatus: true } }),
      prisma.ledgerEntry.count({ where: { riderId, kind: 'ORDER_EARNING', createdAt: { gte: start } } }),
      earningsSummary({ type: 'RIDER', id: riderId }),
      partyBalance({ type: 'RIDER', id: riderId }),
      prisma.order.count({ where: { OR: [{ pickupRiderId: riderId }, { deliveryRiderId: riderId }], status: { in: ACTIVE } } }),
    ]);
    res.json({ ...rider, todayTrips: todayLegs, todayEarnings: summary.today.amount, weekEarnings: summary.week.amount, outstanding: balance.outstanding, activeOrders: active });
  }),
);
