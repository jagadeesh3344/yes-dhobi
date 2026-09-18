import { Router } from 'express';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { z } from 'zod';
import type { Prisma, RiderVehicle } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, paginated, parseBody, parsePagination, parseQuery } from '../../lib/http.js';
import { conflict, notFound } from '../../lib/errors.js';
import { compact, normalizePhone, randomDigits, referralCode } from '../../lib/utils.js';
import { revokeAllUserTokens } from '../../services/tokens.js';
import { notifyUser } from '../../services/notifications.js';
import { sms } from '../../services/sms.js';
import { getSettings } from '../../services/settings.js';
import { customerInclude, riderInclude, serializeCustomer, serializeRider, serializeVendor, vendorInclude } from './serializers.js';

/** Admin: customers, riders, vendors. */
export const adminPeopleRouter = Router();

const search = (q?: string): Prisma.UserWhereInput =>
  q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q.replace(/\s/g, '') } }, { email: { contains: q, mode: 'insensitive' } }] } : {};

const userStatus = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING']);

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

adminPeopleRouter.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const q = parseQuery(z.object({ search: z.string().optional(), status: userStatus.optional(), tier: z.enum(['REGULAR', 'VIP']).optional() }), req.query);
    const p = parsePagination(req.query);
    const where: Prisma.CustomerWhereInput = { user: { ...search(q.search), ...(q.status ? { status: q.status } : {}) }, ...(q.tier ? { tier: q.tier } : {}) };
    const [rows, total] = await Promise.all([
      prisma.customer.findMany({ where, include: customerInclude, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.customer.count({ where }),
    ]);
    res.json(paginated(rows.map(serializeCustomer), total, p));
  }),
);

adminPeopleRouter.post(
  '/customers',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().min(2),
        phone: z.string().min(10),
        email: z.string().email().optional(),
        tier: z.enum(['REGULAR', 'VIP']).default('REGULAR'),
        walletBalance: z.number().min(0).default(0),
        address: z.object({ line1: z.string().min(3), city: z.string().min(2), pincode: z.string().regex(/^\d{6}$/), label: z.string().default('Home') }).optional(),
      }),
      req.body,
    );
    const phone = normalizePhone(body.phone);
    if (await prisma.user.findUnique({ where: { phone_role: { phone, role: 'CUSTOMER' } } })) throw conflict('A customer with this phone already exists');
    const user = await prisma.user.create({
      data: {
        role: 'CUSTOMER',
        phone,
        name: body.name,
        email: body.email,
        customer: {
          create: {
            referralCode: referralCode(body.name),
            tier: body.tier,
            walletBalance: body.walletBalance,
            city: body.address?.city,
            addresses: body.address ? { create: { ...body.address, isDefault: true } } : undefined,
          },
        },
      },
      include: { customer: true },
    });
    const c = await prisma.customer.findUnique({ where: { id: user.customer!.id }, include: customerInclude });
    res.status(201).json(serializeCustomer(c!));
  }),
);

adminPeopleRouter.get(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const c = await prisma.customer.findUnique({ where: { id: req.params.id }, include: { ...customerInclude, addresses: true, walletTransactions: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!c) throw notFound('Customer');
    const orders = await prisma.order.findMany({ where: { customerId: c.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, orderNumber: true, status: true, total: true, serviceSummary: true, createdAt: true } });
    res.json({ ...serializeCustomer(c), addresses: c.addresses, walletTransactions: c.walletTransactions, recentOrders: orders });
  }),
);

adminPeopleRouter.patch(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ name: z.string().min(2).optional(), email: z.string().email().nullable().optional(), phone: z.string().optional(), tier: z.enum(['REGULAR', 'VIP']).optional(), status: userStatus.optional(), city: z.string().optional() }), req.body);
    const c = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!c) throw notFound('Customer');
    await prisma.user.update({ where: { id: c.userId }, data: compact({ name: body.name, email: body.email, status: body.status, phone: body.phone ? normalizePhone(body.phone) : undefined }) });
    await prisma.customer.update({ where: { id: c.id }, data: compact({ tier: body.tier, city: body.city }) });
    if (body.status === 'SUSPENDED') await revokeAllUserTokens(c.userId);
    res.json(serializeCustomer((await prisma.customer.findUnique({ where: { id: c.id }, include: customerInclude }))!));
  }),
);

adminPeopleRouter.post(
  '/customers/:id/wallet',
  asyncHandler(async (req, res) => {
    const { amount, description } = parseBody(z.object({ amount: z.number().refine((n) => n !== 0), description: z.string().min(2).max(200) }), req.body);
    const c = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!c) throw notFound('Customer');
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id: c.id }, data: { walletBalance: { increment: amount } } });
      return tx.walletTransaction.create({ data: { customerId: c.id, type: 'ADJUSTMENT', amount, balanceAfter: updated.walletBalance, description } });
    });
    await notifyUser(c.userId, { title: amount > 0 ? 'Wallet credited' : 'Wallet debited', message: `₹${Math.abs(amount)}: ${description}`, type: 'SYSTEM' });
    res.json(result);
  }),
);

adminPeopleRouter.delete(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const c = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!c) throw notFound('Customer');
    const open = await prisma.order.count({ where: { customerId: c.id, status: { notIn: ['DELIVERED', 'CANCELLED'] } } });
    if (open > 0) throw conflict(`Customer has ${open} active order(s). Cancel them first.`);
    // soft delete: keep order history, block login
    await prisma.user.update({ where: { id: c.userId }, data: { status: 'INACTIVE', phone: null, email: null } });
    await revokeAllUserTokens(c.userId);
    res.json({ message: 'Customer deactivated' });
  }),
);

// ---------------------------------------------------------------------------
// Riders
// ---------------------------------------------------------------------------

async function riderExtras(riderIds: string[]) {
  const weekStart = dayjs().startOf('week').add(1, 'day').toDate();
  const [earnings, active] = await Promise.all([
    prisma.ledgerEntry.groupBy({ by: ['riderId'], where: { riderId: { in: riderIds }, kind: 'ORDER_EARNING', createdAt: { gte: weekStart } }, _sum: { amount: true } }),
    prisma.order.findMany({ where: { OR: [{ pickupRiderId: { in: riderIds } }, { deliveryRiderId: { in: riderIds } }], status: { in: ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] } }, select: { id: true, pickupRiderId: true, deliveryRiderId: true, status: true } }),
  ]);
  return (id: string) => ({
    weeklyEarnings: Number(earnings.find((e) => e.riderId === id)?._sum.amount ?? 0),
    activeOrderId: active.find((o) => (o.status === 'OUT_FOR_DELIVERY' ? o.deliveryRiderId === id : o.pickupRiderId === id))?.id ?? null,
  });
}

adminPeopleRouter.get(
  '/riders',
  asyncHandler(async (req, res) => {
    const q = parseQuery(z.object({ search: z.string().optional(), availability: z.enum(['ONLINE', 'OFFLINE', 'ON_DELIVERY']).optional(), zoneId: z.coerce.number().optional(), onboardingStatus: z.string().optional() }), req.query);
    const p = parsePagination(req.query);
    const where: Prisma.RiderWhereInput = {
      user: search(q.search),
      ...(q.availability ? { availability: q.availability } : {}),
      ...(q.zoneId ? { zoneId: q.zoneId } : {}),
      ...(q.onboardingStatus ? { onboardingStatus: q.onboardingStatus as never } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.rider.findMany({ where, include: riderInclude, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.rider.count({ where }),
    ]);
    const extra = await riderExtras(rows.map((r) => r.id));
    res.json(paginated(rows.map((r) => serializeRider(r, extra(r.id))), total, p));
  }),
);

const VEHICLE_IN: Record<string, RiderVehicle> = { motorcycle: 'MOTORCYCLE', scooter: 'SCOOTER', bicycle: 'BICYCLE', 'electric bike': 'ELECTRIC_BIKE', electric_bike: 'ELECTRIC_BIKE', van: 'VAN' };
const vehicleIn = z.string().transform((v) => VEHICLE_IN[v.toLowerCase()] ?? (v.toUpperCase() as RiderVehicle));

adminPeopleRouter.post(
  '/riders',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().min(2),
        phone: z.string().min(10),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        vehicle: vehicleIn.default('Motorcycle'),
        vehiclePlate: z.string().optional(),
        zoneId: z.number().int().optional(),
        zone: z.string().optional(),
        approve: z.boolean().default(true),
      }),
      req.body,
    );
    const phone = normalizePhone(body.phone);
    if (await prisma.user.findUnique({ where: { phone_role: { phone, role: 'RIDER' } } })) throw conflict('A rider with this phone already exists');
    const zoneId = body.zoneId ?? (body.zone ? (await prisma.zone.findFirst({ where: { name: { contains: body.zone, mode: 'insensitive' } } }))?.id : undefined);
    const password = body.password ?? randomDigits(6);
    const user = await prisma.user.create({
      data: {
        role: 'RIDER',
        phone,
        name: body.name,
        email: body.email,
        passwordHash: await bcrypt.hash(password, 10),
        rider: { create: { vehicleType: body.vehicle, vehicleNumber: body.vehiclePlate?.toUpperCase(), zoneId, onboardingStatus: body.approve ? 'APPROVED' : 'PERSONAL_DETAILS' } },
      },
      include: { rider: true },
    });
    await sms.send(phone, `Welcome to Yes Dhobi Riders! Login with mobile ${phone.replace('+91', '')} and password ${password}.`);
    const r = await prisma.rider.findUnique({ where: { id: user.rider!.id }, include: riderInclude });
    res.status(201).json(serializeRider(r!));
  }),
);

adminPeopleRouter.get(
  '/riders/:id',
  asyncHandler(async (req, res) => {
    const r = await prisma.rider.findUnique({ where: { id: req.params.id }, include: { ...riderInclude, verifications: { orderBy: { submittedAt: 'desc' }, take: 3 } } });
    if (!r) throw notFound('Rider');
    const extra = await riderExtras([r.id]);
    const [orders, payouts] = await Promise.all([
      prisma.order.findMany({ where: { OR: [{ pickupRiderId: r.id }, { deliveryRiderId: r.id }] }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, orderNumber: true, status: true, riderPickupPayout: true, riderDeliveryPayout: true, createdAt: true } }),
      prisma.payout.findMany({ where: { riderId: r.id }, orderBy: { requestedAt: 'desc' }, take: 10 }),
    ]);
    res.json({ ...serializeRider(r, extra(r.id)), verifications: r.verifications, recentOrders: orders, payouts, fullDocuments: r.documents });
  }),
);

adminPeopleRouter.patch(
  '/riders/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().min(2).optional(),
        phone: z.string().optional(),
        email: z.string().email().nullable().optional(),
        vehicle: vehicleIn.optional(),
        vehiclePlate: z.string().optional(),
        zoneId: z.number().int().nullable().optional(),
        zone: z.string().optional(),
        availability: z.enum(['ONLINE', 'OFFLINE', 'ON_DELIVERY']).optional(),
        status: z.string().optional(),
        accountStatus: userStatus.optional(),
        onboardingStatus: z.enum(['PERSONAL_DETAILS', 'VEHICLE_DETAILS', 'DOCUMENTS', 'UNDER_REVIEW', 'APPROVED', 'REJECTED']).optional(),
        password: z.string().min(6).optional(),
      }),
      req.body,
    );
    const r = await prisma.rider.findUnique({ where: { id: req.params.id } });
    if (!r) throw notFound('Rider');
    // the admin panel sends status as "Online"/"Offline"/"On Delivery"
    const availability = body.availability ?? (body.status ? ({ online: 'ONLINE', offline: 'OFFLINE', 'on delivery': 'ON_DELIVERY' } as const)[body.status.toLowerCase()] : undefined);
    const zoneId = body.zoneId !== undefined ? body.zoneId : body.zone ? (await prisma.zone.findFirst({ where: { name: { contains: body.zone, mode: 'insensitive' } } }))?.id : undefined;
    await prisma.user.update({
      where: { id: r.userId },
      data: compact({ name: body.name, email: body.email, status: body.accountStatus, phone: body.phone ? normalizePhone(body.phone) : undefined, passwordHash: body.password ? await bcrypt.hash(body.password, 10) : undefined }),
    });
    await prisma.rider.update({ where: { id: r.id }, data: compact({ vehicleType: body.vehicle, vehicleNumber: body.vehiclePlate?.toUpperCase(), zoneId, availability, onboardingStatus: body.onboardingStatus }) });
    if (body.accountStatus === 'SUSPENDED') await revokeAllUserTokens(r.userId);
    const extra = await riderExtras([r.id]);
    res.json(serializeRider((await prisma.rider.findUnique({ where: { id: r.id }, include: riderInclude }))!, extra(r.id)));
  }),
);

adminPeopleRouter.delete(
  '/riders/:id',
  asyncHandler(async (req, res) => {
    const r = await prisma.rider.findUnique({ where: { id: req.params.id } });
    if (!r) throw notFound('Rider');
    const active = await prisma.order.count({ where: { OR: [{ pickupRiderId: r.id }, { deliveryRiderId: r.id }], status: { in: ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] } } });
    if (active > 0) throw conflict(`Rider has ${active} active delivery(ies). Reassign them first.`);
    await prisma.$transaction([
      prisma.rider.update({ where: { id: r.id }, data: { availability: 'OFFLINE' } }),
      prisma.user.update({ where: { id: r.userId }, data: { status: 'INACTIVE', phone: null, email: null } }),
    ]);
    await revokeAllUserTokens(r.userId);
    res.json({ message: 'Rider deactivated' });
  }),
);

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

async function vendorRevenue(vendorIds: string[]) {
  const rows = await prisma.ledgerEntry.groupBy({ by: ['vendorId'], where: { vendorId: { in: vendorIds }, kind: 'ORDER_EARNING' }, _sum: { amount: true } });
  return (id: string) => ({ totalRevenue: Number(rows.find((r) => r.vendorId === id)?._sum.amount ?? 0) });
}

adminPeopleRouter.get(
  '/vendors',
  asyncHandler(async (req, res) => {
    const q = parseQuery(z.object({ search: z.string().optional(), status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'REJECTED']).optional(), city: z.string().optional(), zoneId: z.coerce.number().optional() }), req.query);
    const p = parsePagination(req.query);
    const where: Prisma.VendorWhereInput = {
      ...(q.search ? { OR: [{ shopName: { contains: q.search, mode: 'insensitive' } }, { ownerName: { contains: q.search, mode: 'insensitive' } }, { user: search(q.search) }] } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.city ? { city: { equals: q.city, mode: 'insensitive' } } : {}),
      ...(q.zoneId ? { zones: { some: { zoneId: q.zoneId } } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.vendor.findMany({ where, include: vendorInclude, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.vendor.count({ where }),
    ]);
    const rev = await vendorRevenue(rows.map((v) => v.id));
    res.json(paginated(rows.map((v) => serializeVendor(v, rev(v.id))), total, p));
  }),
);

adminPeopleRouter.post(
  '/vendors',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().min(2),
        owner: z.string().min(2),
        phone: z.string().min(10),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        location: z.string().min(3),
        city: z.string().min(2),
        pincode: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        zoneIds: z.array(z.number().int()).default([]),
        zone: z.string().optional(),
        capacityPerDay: z.number().positive().default(50),
        commissionRate: z.number().min(0).max(100).optional(),
        serviceCategoryIds: z.array(z.number().int()).default([]),
        activate: z.boolean().default(true),
      }),
      req.body,
    );
    const phone = normalizePhone(body.phone);
    if (await prisma.user.findUnique({ where: { phone_role: { phone, role: 'VENDOR' } } })) throw conflict('A vendor with this phone already exists');
    const zoneIds = body.zoneIds.length ? body.zoneIds : body.zone ? (await prisma.zone.findMany({ where: { name: { contains: body.zone, mode: 'insensitive' } }, select: { id: true } })).map((z) => z.id) : [];
    const cats = await prisma.serviceCategory.findMany({ where: body.serviceCategoryIds.length ? { id: { in: body.serviceCategoryIds } } : { isActive: true } });
    const password = body.password ?? randomDigits(6);
    const settings = await getSettings();
    const user = await prisma.user.create({
      data: {
        role: 'VENDOR',
        phone,
        name: body.owner,
        email: body.email,
        passwordHash: await bcrypt.hash(password, 10),
        vendor: {
          create: {
            shopName: body.name,
            ownerName: body.owner,
            shopAddress: body.location,
            city: body.city,
            pincode: body.pincode,
            latitude: body.latitude,
            longitude: body.longitude,
            dailyCapacityKg: body.capacityPerDay,
            commissionRate: body.commissionRate ?? settings.vendorCommissionRate,
            status: body.activate ? 'ACTIVE' : 'PENDING_VERIFICATION',
            zones: { create: zoneIds.map((zoneId) => ({ zoneId })) },
            services: { create: cats.map((c) => ({ serviceCategoryId: c.id, price: c.basePrice, unit: c.rateUnit === 'KG' ? 'kg' : c.rateUnit === 'PAIR' ? 'pair' : 'piece' })) },
          },
        },
      },
      include: { vendor: true },
    });
    await sms.send(phone, `Welcome to Yes Dhobi Partners! Login with mobile ${phone.replace('+91', '')} and password ${password}.`);
    res.status(201).json(serializeVendor((await prisma.vendor.findUnique({ where: { id: user.vendor!.id }, include: vendorInclude }))!));
  }),
);

adminPeopleRouter.get(
  '/vendors/:id',
  asyncHandler(async (req, res) => {
    const v = await prisma.vendor.findUnique({ where: { id: req.params.id }, include: { ...vendorInclude, verifications: { orderBy: { submittedAt: 'desc' }, take: 3 } } });
    if (!v) throw notFound('Vendor');
    const rev = await vendorRevenue([v.id]);
    const [orders, payouts] = await Promise.all([
      prisma.order.findMany({ where: { vendorId: v.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, orderNumber: true, status: true, total: true, vendorEarning: true, createdAt: true } }),
      prisma.payout.findMany({ where: { vendorId: v.id }, orderBy: { requestedAt: 'desc' }, take: 10 }),
    ]);
    res.json({ ...serializeVendor(v, rev(v.id)), verifications: v.verifications, recentOrders: orders, payouts, registrationPayload: v.registrationPayload });
  }),
);

adminPeopleRouter.patch(
  '/vendors/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().min(2).optional(),
        owner: z.string().min(2).optional(),
        phone: z.string().optional(),
        email: z.string().email().nullable().optional(),
        location: z.string().optional(),
        city: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        zoneIds: z.array(z.number().int()).optional(),
        capacityPerDay: z.number().positive().optional(),
        commissionRate: z.number().min(0).max(100).optional(),
        status: z.string().optional(),
        vendorStatus: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'REJECTED']).optional(),
        accountStatus: userStatus.optional(),
        password: z.string().min(6).optional(),
      }),
      req.body,
    );
    const v = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    if (!v) throw notFound('Vendor');
    const vendorStatus = body.vendorStatus ?? (body.status ? ({ active: 'ACTIVE', 'pending verification': 'PENDING_VERIFICATION', suspended: 'SUSPENDED', rejected: 'REJECTED' } as const)[body.status.toLowerCase()] : undefined);
    await prisma.user.update({
      where: { id: v.userId },
      data: compact({ name: body.owner, email: body.email, status: body.accountStatus, phone: body.phone ? normalizePhone(body.phone) : undefined, passwordHash: body.password ? await bcrypt.hash(body.password, 10) : undefined }),
    });
    await prisma.vendor.update({
      where: { id: v.id },
      data: compact({
        shopName: body.name,
        ownerName: body.owner,
        shopAddress: body.location,
        city: body.city,
        latitude: body.latitude,
        longitude: body.longitude,
        dailyCapacityKg: body.capacityPerDay,
        commissionRate: body.commissionRate,
        status: vendorStatus,
        zones: body.zoneIds ? { deleteMany: {}, create: body.zoneIds.map((zoneId) => ({ zoneId })) } : undefined,
      }),
    });
    if (vendorStatus === 'SUSPENDED' || body.accountStatus === 'SUSPENDED') await revokeAllUserTokens(v.userId);
    if (vendorStatus && vendorStatus !== v.status) {
      await notifyUser(v.userId, { title: `Shop status: ${vendorStatus.replace('_', ' ').toLowerCase()}`, message: vendorStatus === 'ACTIVE' ? 'Your shop is live and can receive orders.' : 'Your shop status was updated by the Yes Dhobi team.', type: 'VENDOR' });
    }
    const rev = await vendorRevenue([v.id]);
    res.json(serializeVendor((await prisma.vendor.findUnique({ where: { id: v.id }, include: vendorInclude }))!, rev(v.id)));
  }),
);

adminPeopleRouter.delete(
  '/vendors/:id',
  asyncHandler(async (req, res) => {
    const v = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    if (!v) throw notFound('Vendor');
    const active = await prisma.order.count({ where: { vendorId: v.id, status: { notIn: ['DELIVERED', 'CANCELLED'] } } });
    if (active > 0) throw conflict(`Vendor has ${active} active order(s). Reassign them first.`);
    await prisma.$transaction([
      prisma.vendor.update({ where: { id: v.id }, data: { status: 'SUSPENDED' } }),
      prisma.user.update({ where: { id: v.userId }, data: { status: 'INACTIVE', phone: null, email: null } }),
    ]);
    await revokeAllUserTokens(v.userId);
    res.json({ message: 'Vendor deactivated' });
  }),
);
