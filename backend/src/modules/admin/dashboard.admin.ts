import { Router } from 'express';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, parseBody, parseQuery } from '../../lib/http.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { compact, round2 } from '../../lib/utils.js';
import { getSettings, invalidateSettings } from '../../services/settings.js';
import { broadcast } from '../../services/notifications.js';
import { orderInclude, serializeOrder } from '../../services/orders.js';
import { riderInclude, serializeRider } from './serializers.js';

/** Admin: dashboard KPIs, revenue analytics, platform settings, broadcasts, admin users. */
export const adminDashboardRouter = Router();

adminDashboardRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const today = dayjs().startOf('day').toDate();
    const yesterday = dayjs().subtract(1, 'day').startOf('day').toDate();
    const [ordersToday, ordersYesterday, revenueToday, revenueYesterday, activeDeliveries, pendingPickup, ridersOnline, vendorsActive, pendingKyc, openTickets, recent, customersTotal, customersNewToday] =
      await Promise.all([
        prisma.order.count({ where: { createdAt: { gte: today } } }),
        prisma.order.count({ where: { createdAt: { gte: yesterday, lt: today } } }),
        prisma.order.aggregate({ where: { createdAt: { gte: today }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
        prisma.order.aggregate({ where: { createdAt: { gte: yesterday, lt: today }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
        prisma.order.count({ where: { status: { in: ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] } } }),
        prisma.order.count({ where: { status: 'PENDING_PICKUP' } }),
        prisma.rider.count({ where: { availability: { in: ['ONLINE', 'ON_DELIVERY'] } } }),
        prisma.vendor.count({ where: { status: 'ACTIVE' } }),
        prisma.verification.count({ where: { status: 'PENDING_REVIEW' } }),
        prisma.supportTicket.count({ where: { status: { not: 'RESOLVED' } } }),
        prisma.order.findMany({ where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } }, include: orderInclude, orderBy: { updatedAt: 'desc' }, take: 10 }),
        prisma.customer.count(),
        prisma.customer.count({ where: { createdAt: { gte: today } } }),
      ]);
    const statusCounts = await prisma.order.groupBy({ by: ['status'], _count: { _all: true }, where: { createdAt: { gte: dayjs().subtract(30, 'day').toDate() } } });
    const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : round2(((a - b) / b) * 100));
    const revT = Number(revenueToday._sum.total ?? 0);
    const revY = Number(revenueYesterday._sum.total ?? 0);
    res.json({
      kpis: {
        ordersToday: { value: ordersToday, changePct: pct(ordersToday, ordersYesterday) },
        revenueToday: { value: revT, changePct: pct(revT, revY) },
        activeDeliveries: { value: activeDeliveries },
        pendingPickup: { value: pendingPickup },
        ridersOnline: { value: ridersOnline },
        vendorsActive: { value: vendorsActive },
        pendingVerifications: { value: pendingKyc },
        openTickets: { value: openTickets },
        customers: { value: customersTotal, newToday: customersNewToday },
      },
      statusBreakdown: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
      recentOrders: recent.map((o) => serializeOrder(o, 'admin')),
    });
  }),
);

adminDashboardRouter.get(
  '/analytics/revenue',
  asyncHandler(async (req, res) => {
    const q = parseQuery(z.object({ range: z.enum(['7d', '30d', '90d', '12m']).default('30d') }), req.query);
    const days = q.range === '7d' ? 7 : q.range === '30d' ? 30 : q.range === '90d' ? 90 : 365;
    const since = dayjs().subtract(days, 'day').startOf('day').toDate();
    const byMonth = q.range === '12m';

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      select: { createdAt: true, total: true, subtotal: true, deliveryFee: true, platformCommission: true, vendorEarning: true, riderPickupPayout: true, riderDeliveryPayout: true, serviceSummary: true, paymentMethod: true, status: true, discount: true },
    });

    const bucket = (d: Date) => (byMonth ? dayjs(d).format('YYYY-MM') : dayjs(d).format('YYYY-MM-DD'));
    const series = new Map<string, { date: string; revenue: number; orders: number; commission: number; vendorPayouts: number; riderPayouts: number }>();
    const start = dayjs(since);
    for (let i = 0; i <= (byMonth ? 12 : days); i++) {
      const d = byMonth ? start.add(i, 'month') : start.add(i, 'day');
      if (d.isAfter(dayjs())) break;
      const key = bucket(d.toDate());
      series.set(key, { date: key, revenue: 0, orders: 0, commission: 0, vendorPayouts: 0, riderPayouts: 0 });
    }
    const byService = new Map<string, { service: string; revenue: number; orders: number }>();
    const byPayment = new Map<string, { method: string; revenue: number; orders: number }>();
    let gross = 0, commission = 0, vendorPayouts = 0, riderPayouts = 0, discounts = 0, delivered = 0;
    for (const o of orders) {
      const key = bucket(o.createdAt);
      const s = series.get(key) ?? { date: key, revenue: 0, orders: 0, commission: 0, vendorPayouts: 0, riderPayouts: 0 };
      s.revenue += Number(o.total);
      s.orders += 1;
      s.commission += Number(o.platformCommission) + Number(o.deliveryFee);
      s.vendorPayouts += Number(o.vendorEarning);
      s.riderPayouts += Number(o.riderPickupPayout) + Number(o.riderDeliveryPayout);
      series.set(key, s);
      const sv = byService.get(o.serviceSummary) ?? { service: o.serviceSummary, revenue: 0, orders: 0 };
      sv.revenue += Number(o.total);
      sv.orders += 1;
      byService.set(o.serviceSummary, sv);
      const pm = byPayment.get(o.paymentMethod) ?? { method: o.paymentMethod, revenue: 0, orders: 0 };
      pm.revenue += Number(o.total);
      pm.orders += 1;
      byPayment.set(o.paymentMethod, pm);
      gross += Number(o.total);
      commission += Number(o.platformCommission) + Number(o.deliveryFee);
      vendorPayouts += Number(o.vendorEarning);
      riderPayouts += Number(o.riderPickupPayout) + Number(o.riderDeliveryPayout);
      discounts += Number(o.discount);
      if (o.status === 'DELIVERED') delivered += 1;
    }
    const r = (n: number) => round2(n);
    res.json({
      range: q.range,
      totals: { grossRevenue: r(gross), platformCommission: r(commission), vendorPayouts: r(vendorPayouts), riderPayouts: r(riderPayouts), netMargin: r(commission - riderPayouts), discounts: r(discounts), orders: orders.length, delivered, avgOrderValue: orders.length ? r(gross / orders.length) : 0 },
      series: [...series.values()].map((s) => ({ ...s, revenue: r(s.revenue), commission: r(s.commission), vendorPayouts: r(s.vendorPayouts), riderPayouts: r(s.riderPayouts) })),
      byService: [...byService.values()].map((s) => ({ ...s, revenue: r(s.revenue) })).sort((a, b) => b.revenue - a.revenue),
      byPaymentMethod: [...byPayment.values()].map((s) => ({ ...s, revenue: r(s.revenue) })),
    });
  }),
);

/** Live map: riders with a known location. */
adminDashboardRouter.get(
  '/live/riders',
  asyncHandler(async (_req, res) => {
    const riders = await prisma.rider.findMany({ where: { availability: { in: ['ONLINE', 'ON_DELIVERY'] }, currentLat: { not: null } }, include: riderInclude });
    res.json({ data: riders.map((r) => serializeRider(r)) });
  }),
);

// ---- Settings ---------------------------------------------------------------

adminDashboardRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const s = await getSettings(true);
    const zones = await prisma.zone.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } });
    res.json({ ...s, activeServiceZones: zones.map((z) => `${z.name}, ${z.city}`), zones });
  }),
);

adminDashboardRouter.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const b = parseBody(
      z.object({
        brandName: z.string().min(2).optional(),
        supportEmail: z.string().email().optional(),
        supportPhone: z.string().optional(),
        operatingHours: z.string().optional(),
        vendorCommissionRate: z.number().min(0).max(100).optional(),
        riderBaseFee: z.number().min(0).optional(),
        riderPerKmRate: z.number().min(0).optional(),
        deliveryFee: z.number().min(0).optional(),
        minOrderForFreePickup: z.number().min(0).optional(),
        taxPercent: z.number().min(0).max(100).optional(),
        referralBonus: z.number().min(0).optional(),
        maintenanceMode: z.boolean().optional(),
        riderOutOfServiceAlert: z.boolean().optional(),
        smsNotificationsOnDelivery: z.boolean().optional(),
      }),
      req.body,
    );
    const s = await prisma.platformSettings.update({ where: { id: 1 }, data: compact(b) });
    invalidateSettings();
    res.json(s);
  }),
);

// ---- Broadcast --------------------------------------------------------------

adminDashboardRouter.post(
  '/broadcast',
  asyncHandler(async (req, res) => {
    const AUDIENCE: Record<string, Array<'CUSTOMER' | 'VENDOR' | 'RIDER'>> = { all: ['CUSTOMER', 'VENDOR', 'RIDER'], customers: ['CUSTOMER'], customer: ['CUSTOMER'], riders: ['RIDER'], rider: ['RIDER'], vendors: ['VENDOR'], vendor: ['VENDOR'] };
    const b = parseBody(
      z.object({
        /** ["CUSTOMER","RIDER"] or the panel's "All" | "Customers" | "Riders" | "Vendors" */
        audience: z.union([z.array(z.enum(['CUSTOMER', 'VENDOR', 'RIDER'])).min(1), z.string()]).optional(),
        targetAudience: z.string().optional(),
        title: z.string().min(2).max(100),
        message: z.string().min(2).max(500),
        priority: z.enum(['Normal', 'High Alert']).optional(),
        type: z.enum(['PROMO', 'SYSTEM', 'ORDER']).optional(),
      }),
      req.body,
    );
    const raw = b.audience ?? b.targetAudience ?? 'All';
    const roles = Array.isArray(raw) ? raw : AUDIENCE[raw.toLowerCase()];
    if (!roles) throw badRequest('audience must be All, Customers, Riders or Vendors');
    const recipients = await broadcast(roles, { title: b.title, message: b.message, type: b.type ?? (b.priority === 'High Alert' ? 'SYSTEM' : 'PROMO'), data: { priority: b.priority ?? 'Normal' } });
    res.json({ recipients });
  }),
);

// ---- Admin users ------------------------------------------------------------

adminDashboardRouter.get(
  '/admins',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true }, orderBy: { createdAt: 'asc' } }) });
  }),
);

adminDashboardRouter.post(
  '/admins',
  asyncHandler(async (req, res) => {
    const b = parseBody(z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8) }), req.body);
    const email = b.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email_role: { email, role: 'ADMIN' } } })) throw conflict('Admin with this email already exists');
    const u = await prisma.user.create({ data: { role: 'ADMIN', name: b.name, email, passwordHash: await bcrypt.hash(b.password, 10) }, select: { id: true, name: true, email: true, status: true } });
    res.status(201).json(u);
  }),
);

adminDashboardRouter.patch(
  '/admins/:id',
  asyncHandler(async (req, res) => {
    const b = parseBody(z.object({ name: z.string().min(2).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional(), password: z.string().min(8).optional() }), req.body);
    const u = await prisma.user.findFirst({ where: { id: req.params.id, role: 'ADMIN' } });
    if (!u) throw notFound('Admin');
    const updated = await prisma.user.update({
      where: { id: u.id },
      data: compact({ name: b.name, status: b.status, passwordHash: b.password ? await bcrypt.hash(b.password, 10) : undefined }),
      select: { id: true, name: true, email: true, status: true },
    });
    res.json(updated);
  }),
);
