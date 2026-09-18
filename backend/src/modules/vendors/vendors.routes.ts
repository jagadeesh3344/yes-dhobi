import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, paginated, parseBody, parsePagination, parseQuery } from '../../lib/http.js';
import { forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { compact, maskAccount } from '../../lib/utils.js';
import { requireVendor } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { addEvent, broadcastOrder, loadOrder, orderInclude, serializeOrder, transitionOrder } from '../../services/orders.js';
import { offerLeg } from '../../services/dispatch.js';
import { earningsSummary, partyBalance } from '../../services/ledger.js';
import { notifyAdmins } from '../../services/notifications.js';
import { requestPayout } from '../payouts/payouts.service.js';
import { registerVendor, vendorRegistrationSchema } from './registration.js';

export const vendorsRouter = Router();

// ---------------------------------------------------------------------------
// Public: web registration (POST /api/v1/vendors)
// ---------------------------------------------------------------------------

vendorsRouter.post(
  '/',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(vendorRegistrationSchema, req.body);
    res.status(201).json(await registerVendor(body));
  }),
);

// Everything below requires a logged-in vendor.
vendorsRouter.use(requireVendor);

async function me(vendorId: string) {
  const v = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      user: { select: { id: true, name: true, phone: true, email: true, avatarUrl: true, status: true, createdAt: true } },
      zones: { include: { zone: true } },
      services: { include: { serviceCategory: true }, orderBy: { createdAt: 'asc' } },
      equipments: { include: { equipment: true } },
      _count: { select: { orders: { where: { status: 'DELIVERED' } } } },
    },
  });
  if (!v) throw notFound('Vendor');
  return {
    ...v,
    bankAccountNumber: maskAccount(v.bankAccountNumber),
    aadhaarNumber: v.aadhaarNumber ? `XXXX XXXX ${v.aadhaarNumber.slice(-4)}` : null,
    ordersProcessed: v._count.orders,
    isVerified: v.status === 'ACTIVE',
  };
}

function assertActive(status: string) {
  if (status === 'PENDING_VERIFICATION') throw forbidden('Your shop is pending verification');
  if (status !== 'ACTIVE') throw forbidden('Your shop is not active. Contact support.');
}

// ---- Profile ----------------------------------------------------------------

vendorsRouter.get('/me', asyncHandler(async (req, res) => res.json(await me(req.user!.vendorId!))));

vendorsRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        shopName: z.string().min(2).optional(),
        ownerName: z.string().min(2).optional(),
        whatsappNumber: z.string().optional(),
        shopAddress: z.string().min(3).optional(),
        landmark: z.string().optional(),
        city: z.string().optional(),
        pincode: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        workingHoursFrom: z.string().optional(),
        workingHoursTo: z.string().optional(),
        workingDays: z.array(z.number().int().min(1).max(7)).optional(),
        dailyCapacityKg: z.number().positive().optional(),
        offersExpressDelivery: z.boolean().optional(),
        expressChargePercent: z.number().min(0).max(200).optional(),
        standardDeliveryTime: z.string().optional(),
      }),
      req.body,
    );
    if (body.ownerName) await prisma.user.update({ where: { id: req.user!.id }, data: { name: body.ownerName } });
    await prisma.vendor.update({ where: { id: req.user!.vendorId }, data: compact(body) });
    res.json(await me(req.user!.vendorId!));
  }),
);

// ---- Services & rates -------------------------------------------------------

vendorsRouter.get(
  '/me/services',
  asyncHandler(async (req, res) => {
    const [mine, all] = await Promise.all([
      prisma.vendorService.findMany({ where: { vendorId: req.user!.vendorId }, include: { serviceCategory: true }, orderBy: { createdAt: 'asc' } }),
      prisma.serviceCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const data = [
      ...mine.map((s) => ({
        id: s.id,
        serviceCategoryId: s.serviceCategoryId,
        code: s.serviceCategory?.code ?? null,
        name: s.serviceCategory?.name ?? s.customName ?? 'Custom',
        price: s.price,
        unit: s.unit,
        isEnabled: s.isEnabled,
        isCustom: !s.serviceCategoryId,
      })),
      // catalog services the vendor has not configured yet, shown disabled
      ...all
        .filter((c) => !mine.some((m) => m.serviceCategoryId === c.id))
        .map((c) => ({ id: null, serviceCategoryId: c.id, code: c.code, name: c.name, price: c.basePrice, unit: c.rateUnit === 'KG' ? 'kg' : c.rateUnit === 'PAIR' ? 'pair' : 'piece', isEnabled: false, isCustom: false })),
    ];
    res.json({ data });
  }),
);

const serviceBody = z.object({
  serviceCategoryId: z.number().int().optional(),
  name: z.string().min(2).optional(),
  price: z.number().nonnegative(),
  unit: z.enum(['kg', 'piece', 'pair', 'item']).default('kg'),
  isEnabled: z.boolean().default(true),
});

vendorsRouter.post(
  '/me/services',
  asyncHandler(async (req, res) => {
    const body = parseBody(serviceBody, req.body);
    if (!body.serviceCategoryId && !body.name) throw unprocessable('Provide serviceCategoryId (catalog service) or name (custom service)');
    const vendorId = req.user!.vendorId!;
    const row = body.serviceCategoryId
      ? await prisma.vendorService.upsert({
          where: { vendorId_serviceCategoryId: { vendorId, serviceCategoryId: body.serviceCategoryId } },
          update: { price: body.price, unit: body.unit, isEnabled: body.isEnabled },
          create: { vendorId, serviceCategoryId: body.serviceCategoryId, price: body.price, unit: body.unit, isEnabled: body.isEnabled },
          include: { serviceCategory: true },
        })
      : await prisma.vendorService.create({
          data: { vendorId, customName: body.name, price: body.price, unit: body.unit, isEnabled: body.isEnabled },
          include: { serviceCategory: true },
        });
    res.status(201).json(row);
  }),
);

vendorsRouter.patch(
  '/me/services/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(serviceBody.partial(), req.body);
    const existing = await prisma.vendorService.findFirst({ where: { id: req.params.id, vendorId: req.user!.vendorId } });
    if (!existing) throw notFound('Service');
    const row = await prisma.vendorService.update({
      where: { id: existing.id },
      data: compact({ price: body.price, unit: body.unit, isEnabled: body.isEnabled, customName: existing.serviceCategoryId ? undefined : body.name }),
      include: { serviceCategory: true },
    });
    res.json(row);
  }),
);

vendorsRouter.delete(
  '/me/services/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.vendorService.findFirst({ where: { id: req.params.id, vendorId: req.user!.vendorId } });
    if (!existing) throw notFound('Service');
    await prisma.vendorService.delete({ where: { id: existing.id } });
    res.json({ message: 'Service removed' });
  }),
);

// ---- Orders -----------------------------------------------------------------

const IN_PROGRESS: OrderStatus[] = ['IN_LAUNDRY', 'WASHING', 'IRONING', 'QUALITY_CHECK'];

function tabWhere(tab: string): Prisma.OrderWhereInput {
  switch (tab) {
    case 'new':
      return { vendorAcceptedAt: null, status: { notIn: ['CANCELLED', 'DELIVERED'] } };
    case 'incoming':
      return { vendorAcceptedAt: { not: null }, status: { in: ['PENDING_PICKUP', 'ASSIGNED', 'PICKED_UP'] } };
    case 'in_progress':
      return { vendorAcceptedAt: { not: null }, status: { in: IN_PROGRESS } };
    case 'ready':
      return { status: 'READY' };
    case 'out_for_delivery':
      return { status: 'OUT_FOR_DELIVERY' };
    case 'active':
      return { vendorAcceptedAt: { not: null }, status: { notIn: ['CANCELLED', 'DELIVERED'] } };
    case 'completed':
      return { status: 'DELIVERED' };
    case 'cancelled':
      return { status: 'CANCELLED' };
    default:
      return {};
  }
}

vendorsRouter.get(
  '/me/orders',
  asyncHandler(async (req, res) => {
    const q = parseQuery(z.object({ tab: z.enum(['new', 'incoming', 'in_progress', 'ready', 'out_for_delivery', 'active', 'completed', 'cancelled', 'all']).default('all') }), req.query);
    const p = parsePagination(req.query);
    const where = { vendorId: req.user!.vendorId, ...tabWhere(q.tab) };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({ where, include: orderInclude, orderBy: { updatedAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.order.count({ where }),
    ]);
    res.json(paginated(orders.map((o) => ({ ...serializeOrder(o, 'vendor'), isAccepted: o.vendorAcceptedAt != null, isRiderBooked: o.deliveryRiderId != null })), total, p));
  }),
);

async function vendorOrder(orderId: string, vendorId: string) {
  const order = await loadOrder(orderId);
  if (order.vendorId !== vendorId) throw notFound('Order');
  return order;
}

vendorsRouter.get(
  '/me/orders/:id',
  asyncHandler(async (req, res) => {
    const o = await vendorOrder(req.params.id!, req.user!.vendorId!);
    res.json({ ...serializeOrder(o, 'vendor'), isAccepted: o.vendorAcceptedAt != null, isRiderBooked: o.deliveryRiderId != null });
  }),
);

vendorsRouter.post(
  '/me/orders/:id/accept',
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findUnique({ where: { id: req.user!.vendorId } });
    assertActive(vendor?.status ?? '');
    const o = await vendorOrder(req.params.id!, req.user!.vendorId!);
    if (o.vendorAcceptedAt) throw unprocessable('Order already accepted');
    if (o.status === 'CANCELLED') throw unprocessable('Order was cancelled');
    await prisma.order.update({ where: { id: o.id }, data: { vendorAcceptedAt: new Date() } });
    await addEvent(prisma, o.id, { type: 'VENDOR_ACCEPTED', title: 'Accepted by laundry partner', description: vendor!.shopName, actorUserId: req.user!.id });
    const updated = await broadcastOrder(o.id);
    res.json({ ...serializeOrder(updated, 'vendor'), isAccepted: true });
  }),
);

vendorsRouter.post(
  '/me/orders/:id/reject',
  asyncHandler(async (req, res) => {
    const { reason } = parseBody(z.object({ reason: z.string().max(300).optional() }), req.body ?? {});
    const o = await vendorOrder(req.params.id!, req.user!.vendorId!);
    if (o.vendorAcceptedAt || !['PENDING_PICKUP', 'ASSIGNED'].includes(o.status)) throw unprocessable('This order can no longer be rejected. Contact support.');
    await prisma.order.update({ where: { id: o.id }, data: { vendorId: null } });
    await addEvent(prisma, o.id, { type: 'VENDOR_REJECTED', title: 'Declined by laundry partner', description: reason ?? o.vendor?.shopName, actorUserId: req.user!.id });
    await notifyAdmins({ title: 'Vendor declined order', message: `${o.vendor?.shopName} declined ${o.orderNumber}${reason ? `: ${reason}` : ''}. Reassign a partner.`, type: 'VENDOR', data: { orderId: o.id } });
    await broadcastOrder(o.id);
    res.json({ message: 'Order declined' });
  }),
);

vendorsRouter.post(
  '/me/orders/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = parseBody(z.object({ status: z.enum(['WASHING', 'IRONING', 'QUALITY_CHECK', 'READY']) }), req.body);
    const o = await vendorOrder(req.params.id!, req.user!.vendorId!);
    if (!o.vendorAcceptedAt) throw unprocessable('Accept the order first');
    const updated = await transitionOrder(o.id, status, { actorUserId: req.user!.id });
    res.json(serializeOrder(updated, 'vendor'));
  }),
);

/** Order packaged & ready: broadcast a delivery request to riders. */
vendorsRouter.post(
  '/me/orders/:id/book-rider',
  asyncHandler(async (req, res) => {
    const o = await vendorOrder(req.params.id!, req.user!.vendorId!);
    let order = o;
    if (IN_PROGRESS.includes(o.status)) order = await transitionOrder(o.id, 'READY', { actorUserId: req.user!.id, description: 'Packaged and ready for delivery' });
    if (order.status !== 'READY') throw unprocessable(`Order is ${order.status}; it must be READY to book a rider`);
    if (order.deliveryRiderId) throw unprocessable('A delivery rider is already booked');
    const notified = await offerLeg(order.id, 'DELIVERY');
    res.json({ ...serializeOrder(await loadOrder(order.id), 'vendor'), ridersNotified: notified, isRiderBooked: false });
  }),
);

// ---- Earnings ---------------------------------------------------------------

vendorsRouter.get(
  '/me/earnings',
  asyncHandler(async (req, res) => {
    const vendorId = req.user!.vendorId!;
    const party = { type: 'VENDOR' as const, id: vendorId };
    const [summary, balance, recent, payouts] = await Promise.all([
      earningsSummary(party),
      partyBalance(party),
      prisma.ledgerEntry.findMany({ where: { vendorId, kind: 'ORDER_EARNING' }, orderBy: { createdAt: 'desc' }, take: 30, include: { order: { select: { orderNumber: true, total: true, itemsCount: true, serviceSummary: true } } } }),
      prisma.payout.findMany({ where: { vendorId }, orderBy: { requestedAt: 'desc' }, take: 20 }),
    ]);
    const avg = (n: number, c: number) => (c ? Math.round((n / c) * 100) / 100 : 0);
    res.json({
      today: { ...summary.today, averageValue: avg(summary.today.amount, summary.today.orders) },
      week: { ...summary.week, averageValue: avg(summary.week.amount, summary.week.orders) },
      month: { ...summary.month, averageValue: avg(summary.month.amount, summary.month.orders) },
      ...balance,
      nextPayoutDate: dayjs().add(7 - ((dayjs().day() + 6) % 7), 'day').startOf('day').toDate(),
      transactions: recent.map((e) => ({ id: e.id, amount: e.amount, description: e.description, orderNumber: e.order?.orderNumber, orderTotal: e.order?.total, createdAt: e.createdAt })),
      payoutHistory: payouts,
    });
  }),
);

vendorsRouter.get(
  '/me/payouts',
  asyncHandler(async (req, res) => {
    res.json({ data: await prisma.payout.findMany({ where: { vendorId: req.user!.vendorId }, orderBy: { requestedAt: 'desc' }, take: 50 }) });
  }),
);

vendorsRouter.post(
  '/me/payouts',
  asyncHandler(async (req, res) => {
    const { amount } = parseBody(z.object({ amount: z.number().positive().optional() }), req.body ?? {});
    res.status(201).json(await requestPayout({ type: 'VENDOR', id: req.user!.vendorId! }, amount));
  }),
);

vendorsRouter.get(
  '/me/dashboard',
  asyncHandler(async (req, res) => {
    const vendorId = req.user!.vendorId!;
    const count = (tab: string) => prisma.order.count({ where: { vendorId, ...tabWhere(tab) } });
    const [vendor, newRequests, incoming, inProgress, ready, outForDelivery, completedToday, summary] = await Promise.all([
      prisma.vendor.findUnique({ where: { id: vendorId }, select: { shopName: true, status: true, rating: true, ratingCount: true } }),
      count('new'),
      count('incoming'),
      count('in_progress'),
      count('ready'),
      count('out_for_delivery'),
      prisma.order.count({ where: { vendorId, status: 'DELIVERED', deliveredAt: { gte: dayjs().startOf('day').toDate() } } }),
      earningsSummary({ type: 'VENDOR', id: vendorId }),
    ]);
    res.json({ ...vendor, counts: { newRequests, incoming, inProgress, ready, outForDelivery, completedToday }, todayEarnings: summary.today.amount, weekEarnings: summary.week.amount });
  }),
);
