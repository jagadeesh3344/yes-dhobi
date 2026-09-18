import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, paginated, parseBody, parsePagination } from '../../lib/http.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { compact } from '../../lib/utils.js';
import { requireCustomer } from '../../middleware/auth.js';

/** Endpoints for the logged-in customer (customer app). */
export const customersRouter = Router();
customersRouter.use(requireCustomer);

const addressSchema = z.object({
  label: z.string().min(1).max(30).default('Home'),
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional(),
  landmark: z.string().max(120).optional(),
  city: z.string().min(2).max(80),
  state: z.string().max(80).optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().optional(),
});

customersRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.user!.customerId },
      include: {
        user: { select: { id: true, name: true, phone: true, email: true, avatarUrl: true, createdAt: true } },
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
        _count: { select: { orders: true } },
      },
    });
    if (!customer) throw notFound('Customer');
    res.json({ ...customer, totalOrders: customer._count.orders });
  }),
);

customersRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({ name: z.string().min(2).max(80).optional(), email: z.string().email().optional(), avatarUrl: z.string().url().optional(), city: z.string().max(80).optional() }),
      req.body,
    );
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: compact({ name: body.name, email: body.email, avatarUrl: body.avatarUrl }),
      select: { id: true, name: true, phone: true, email: true, avatarUrl: true },
    });
    if (body.city) await prisma.customer.update({ where: { id: req.user!.customerId }, data: { city: body.city } });
    res.json(user);
  }),
);

// ---- Addresses --------------------------------------------------------------

customersRouter.get(
  '/me/addresses',
  asyncHandler(async (req, res) => {
    res.json({ data: await prisma.address.findMany({ where: { customerId: req.user!.customerId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }) });
  }),
);

customersRouter.post(
  '/me/addresses',
  asyncHandler(async (req, res) => {
    const body = parseBody(addressSchema, req.body);
    const customerId = req.user!.customerId!;
    const count = await prisma.address.count({ where: { customerId } });
    const makeDefault = body.isDefault || count === 0;
    const address = await prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      const a = await tx.address.create({ data: { ...body, customerId, isDefault: makeDefault } });
      if (makeDefault) await tx.customer.update({ where: { id: customerId }, data: { defaultAddressId: a.id, city: a.city } });
      return a;
    });
    res.status(201).json(address);
  }),
);

customersRouter.patch(
  '/me/addresses/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(addressSchema.partial(), req.body);
    const customerId = req.user!.customerId!;
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, customerId } });
    if (!existing) throw notFound('Address');
    const address = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
        await tx.customer.update({ where: { id: customerId }, data: { defaultAddressId: existing.id } });
      }
      return tx.address.update({ where: { id: existing.id }, data: compact(body) });
    });
    res.json(address);
  }),
);

customersRouter.delete(
  '/me/addresses/:id',
  asyncHandler(async (req, res) => {
    const customerId = req.user!.customerId!;
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, customerId } });
    if (!existing) throw notFound('Address');
    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: existing.id } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({ where: { customerId }, orderBy: { createdAt: 'asc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
        await tx.customer.update({ where: { id: customerId }, data: { defaultAddressId: next?.id ?? null } });
      }
    });
    res.json({ message: 'Address removed' });
  }),
);

// ---- Wallet & referrals -----------------------------------------------------

customersRouter.get(
  '/me/wallet',
  asyncHandler(async (req, res) => {
    const p = parsePagination(req.query);
    const customerId = req.user!.customerId!;
    const [customer, txns, total] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId }, select: { walletBalance: true, referralCode: true } }),
      prisma.walletTransaction.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.walletTransaction.count({ where: { customerId } }),
    ]);
    res.json({ balance: customer?.walletBalance ?? 0, referralCode: customer?.referralCode, ...paginated(txns, total, p) });
  }),
);

/** Mock top-up: in production this is completed by the payment-gateway webhook. */
customersRouter.post(
  '/me/wallet/topup',
  asyncHandler(async (req, res) => {
    const { amount } = parseBody(z.object({ amount: z.number().positive().max(50_000) }), req.body);
    if (amount < 1) throw badRequest('Invalid amount');
    const customerId = req.user!.customerId!;
    const result = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.update({ where: { id: customerId }, data: { walletBalance: { increment: amount } } });
      const t = await tx.walletTransaction.create({
        data: { customerId, type: 'TOPUP', amount, balanceAfter: c.walletBalance, description: 'Wallet top-up' },
      });
      return { balance: c.walletBalance, transaction: t };
    });
    res.json(result);
  }),
);

customersRouter.get(
  '/me/referrals',
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.user!.customerId },
      select: { referralCode: true, referrals: { select: { id: true, createdAt: true, user: { select: { name: true } } } } },
    });
    res.json({ referralCode: customer?.referralCode, referrals: customer?.referrals ?? [] });
  }),
);
