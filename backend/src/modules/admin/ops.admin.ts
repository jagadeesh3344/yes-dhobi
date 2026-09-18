import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, paginated, parseBody, parsePagination, parseQuery } from '../../lib/http.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { compact } from '../../lib/utils.js';
import { notifyUser } from '../../services/notifications.js';
import { nextId } from '../../lib/ids.js';
import { partyBalance } from '../../services/ledger.js';
import { realtime } from '../../realtime/socket.js';
import { ticketInclude } from '../support/support.routes.js';
import { createPayoutByAdmin, settlePayout } from '../payouts/payouts.service.js';
import { serializePayout, serializeVerification, verificationInclude } from './serializers.js';

/** Admin: KYC verifications, support tickets, FAQs, payouts. */
export const adminOpsRouter = Router();

// ---------------------------------------------------------------------------
// Verifications (KYC)
// ---------------------------------------------------------------------------

adminOpsRouter.get(
  '/verifications',
  asyncHandler(async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED']).optional(), type: z.enum(['VENDOR', 'RIDER']).optional() }), req.query);
    const p = parsePagination(req.query);
    const where: Prisma.VerificationWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.type ? { type: q.type } : {}) };
    const [rows, total] = await Promise.all([
      prisma.verification.findMany({ where, include: verificationInclude, orderBy: { submittedAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.verification.count({ where }),
    ]);
    res.json(paginated(rows.map(serializeVerification), total, p));
  }),
);

adminOpsRouter.get(
  '/verifications/:id',
  asyncHandler(async (req, res) => {
    const v = await prisma.verification.findUnique({ where: { id: req.params.id }, include: verificationInclude });
    if (!v) throw notFound('Verification');
    res.json(serializeVerification(v));
  }),
);

adminOpsRouter.post(
  '/verifications/:id/approve',
  asyncHandler(async (req, res) => {
    const v = await prisma.verification.findUnique({ where: { id: req.params.id }, include: verificationInclude });
    if (!v) throw notFound('Verification');
    if (v.status !== 'PENDING_REVIEW') throw unprocessable(`Already ${v.status.toLowerCase()}`);
    await prisma.$transaction(async (tx) => {
      await tx.verification.update({ where: { id: v.id }, data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: req.user!.id } });
      if (v.vendorId) await tx.vendor.update({ where: { id: v.vendorId }, data: { status: 'ACTIVE' } });
      if (v.riderId) await tx.rider.update({ where: { id: v.riderId }, data: { onboardingStatus: 'APPROVED' } });
      await tx.user.update({ where: { id: v.userId }, data: { status: 'ACTIVE' } });
    });
    await notifyUser(v.userId, {
      title: 'Verification approved',
      message: v.type === 'VENDOR' ? 'Your shop is verified and live on Yes Dhobi. You can start accepting orders.' : 'You are verified! Go online to start receiving pickup requests.',
      type: 'SYSTEM',
    });
    res.json(serializeVerification((await prisma.verification.findUnique({ where: { id: v.id }, include: verificationInclude }))!));
  }),
);

adminOpsRouter.post(
  '/verifications/:id/reject',
  asyncHandler(async (req, res) => {
    const { reason } = parseBody(z.object({ reason: z.string().min(3).max(500) }), req.body);
    const v = await prisma.verification.findUnique({ where: { id: req.params.id } });
    if (!v) throw notFound('Verification');
    if (v.status !== 'PENDING_REVIEW') throw unprocessable(`Already ${v.status.toLowerCase()}`);
    await prisma.$transaction(async (tx) => {
      await tx.verification.update({ where: { id: v.id }, data: { status: 'REJECTED', rejectionReason: reason, reviewedAt: new Date(), reviewedById: req.user!.id } });
      if (v.vendorId) await tx.vendor.update({ where: { id: v.vendorId }, data: { status: 'REJECTED' } });
      if (v.riderId) await tx.rider.update({ where: { id: v.riderId }, data: { onboardingStatus: 'REJECTED' } });
    });
    await notifyUser(v.userId, { title: 'Verification rejected', message: `Reason: ${reason}. Please re-submit your documents.`, type: 'SYSTEM' });
    res.json(serializeVerification((await prisma.verification.findUnique({ where: { id: v.id }, include: verificationInclude }))!));
  }),
);

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

/** Accept either the cuid or the human number (TKT-1001) so the panel can use display ids. */
async function ticketByKey(key: string) {
  const t = await prisma.supportTicket.findFirst({ where: { OR: [{ id: key }, { ticketNumber: key.toUpperCase() }] } });
  if (!t) throw notFound('Ticket');
  return t;
}
async function payoutIdByKey(key: string) {
  const p = await prisma.payout.findFirst({ where: { OR: [{ id: key }, { payoutNumber: key.toUpperCase() }] }, select: { id: true } });
  if (!p) throw notFound('Payout');
  return p.id;
}

const ticketSerialize = (t: Prisma.SupportTicketGetPayload<{ include: typeof ticketInclude }>) => ({
  ...t,
  by: t.createdBy.name,
  role: t.creatorRole.charAt(0) + t.creatorRole.slice(1).toLowerCase(),
  messages: t.messages.map((m) => ({ ...m, sender: m.senderName, time: m.createdAt })),
});

adminOpsRouter.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(), priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(), role: z.enum(['CUSTOMER', 'VENDOR', 'RIDER']).optional(), search: z.string().optional() }), req.query);
    const p = parsePagination(req.query);
    const where: Prisma.SupportTicketWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.role ? { creatorRole: q.role } : {}),
      ...(q.search ? { OR: [{ subject: { contains: q.search, mode: 'insensitive' } }, { ticketNumber: { contains: q.search, mode: 'insensitive' } }, { createdBy: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.supportTicket.findMany({ where, include: ticketInclude, orderBy: [{ status: 'asc' }, { priority: 'asc' }, { updatedAt: 'desc' }], skip: p.skip, take: p.limit }),
      prisma.supportTicket.count({ where }),
    ]);
    res.json(paginated(rows.map(ticketSerialize), total, p));
  }),
);

/** Admin opens a ticket on behalf of a user (NewTicketModal). */
adminOpsRouter.post(
  '/tickets',
  asyncHandler(async (req, res) => {
    const b = parseBody(
      z.object({
        userId: z.string().optional(),
        subject: z.string().min(3),
        message: z.string().min(1),
        category: z.enum(['DAMAGE', 'DELAY', 'PAYOUT', 'APP_BUG', 'REFUND', 'DELIVERY', 'QUALITY', 'OTHER']).default('OTHER'),
        priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
        orderId: z.string().optional(),
      }),
      req.body,
    );
    const creator = b.userId ? await prisma.user.findUnique({ where: { id: b.userId } }) : null;
    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber: await nextId('TKT'),
        subject: b.subject,
        category: b.category,
        priority: b.priority,
        createdById: creator?.id ?? req.user!.id,
        creatorRole: creator?.role ?? 'ADMIN',
        orderId: b.orderId,
        assignedToId: req.user!.id,
        messages: { create: { senderId: req.user!.id, senderName: req.user!.name, text: b.message, isStaff: true } },
      },
      include: ticketInclude,
    });
    res.status(201).json(ticketSerialize(ticket));
  }),
);

adminOpsRouter.get(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const { id } = await ticketByKey(req.params.id!);
    const t = await prisma.supportTicket.findUnique({ where: { id }, include: ticketInclude });
    res.json(ticketSerialize(t!));
  }),
);

adminOpsRouter.post(
  '/tickets/:id/reply',
  asyncHandler(async (req, res) => {
    const { text } = parseBody(z.object({ text: z.string().min(1).max(2000) }), req.body);
    const t = await ticketByKey(req.params.id!);
    const message = await prisma.ticketMessage.create({ data: { ticketId: t.id, senderId: req.user!.id, senderName: req.user!.name, text, isStaff: true } });
    await prisma.supportTicket.update({ where: { id: t.id }, data: { status: t.status === 'OPEN' ? 'IN_PROGRESS' : t.status, assignedToId: t.assignedToId ?? req.user!.id } });
    realtime.toUser(t.createdById, 'ticket:message', { ticketId: t.id, message });
    await notifyUser(t.createdById, { title: `Support replied on ${t.ticketNumber}`, message: text.slice(0, 120), type: 'SUPPORT', data: { ticketId: t.id } });
    res.status(201).json(message);
  }),
);

adminOpsRouter.patch(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const b = parseBody(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(), priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(), assignedToId: z.string().nullable().optional() }), req.body);
    const t = await prisma.supportTicket.update({
      where: { id: (await ticketByKey(req.params.id!)).id },
      data: compact({ ...b, resolvedAt: b.status === 'RESOLVED' ? new Date() : b.status ? null : undefined }),
      include: ticketInclude,
    });
    if (b.status === 'RESOLVED') await notifyUser(t.createdById, { title: `Ticket ${t.ticketNumber} resolved`, message: 'Let us know if you need anything else.', type: 'SUPPORT', data: { ticketId: t.id } });
    res.json(ticketSerialize(t));
  }),
);

// ---- FAQs -------------------------------------------------------------------

const faqBody = z.object({ category: z.string().min(2), question: z.string().min(3), answer: z.string().min(3), sortOrder: z.number().int().default(0), isActive: z.boolean().default(true) });
adminOpsRouter.get('/faqs', asyncHandler(async (_req, res) => res.json({ data: await prisma.faq.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] }) })));
adminOpsRouter.post('/faqs', asyncHandler(async (req, res) => res.status(201).json(await prisma.faq.create({ data: parseBody(faqBody, req.body) }))));
adminOpsRouter.patch('/faqs/:id', asyncHandler(async (req, res) => res.json(await prisma.faq.update({ where: { id: req.params.id }, data: compact(parseBody(faqBody.partial(), req.body)) }))));
adminOpsRouter.delete(
  '/faqs/:id',
  asyncHandler(async (req, res) => {
    await prisma.faq.delete({ where: { id: req.params.id } });
    res.json({ message: 'FAQ deleted' });
  }),
);

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

const payoutInclude = { vendor: { select: { shopName: true } }, rider: { select: { user: { select: { name: true } } } } };

adminOpsRouter.get(
  '/payouts',
  asyncHandler(async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(['PENDING', 'PROCESSED', 'FAILED']).optional(), type: z.enum(['VENDOR', 'RIDER']).optional() }), req.query);
    const p = parsePagination(req.query);
    const where: Prisma.PayoutWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.type ? { partyType: q.type } : {}) };
    const [rows, total] = await Promise.all([
      prisma.payout.findMany({ where, include: payoutInclude, orderBy: { requestedAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.payout.count({ where }),
    ]);
    res.json(paginated(rows.map(serializePayout), total, p));
  }),
);

adminOpsRouter.post(
  '/payouts',
  asyncHandler(async (req, res) => {
    const b = parseBody(z.object({ type: z.enum(['VENDOR', 'RIDER', 'Vendor', 'Rider']), partyId: z.string(), amount: z.number().positive(), method: z.string().optional() }), req.body);
    const payout = await createPayoutByAdmin({ type: b.type.toUpperCase() as 'VENDOR' | 'RIDER', id: b.partyId }, b.amount, b.method);
    res.status(201).json(serializePayout((await prisma.payout.findUnique({ where: { id: payout.id }, include: payoutInclude }))!));
  }),
);

adminOpsRouter.post(
  '/payouts/:id/process',
  asyncHandler(async (req, res) => {
    const { reference } = parseBody(z.object({ reference: z.string().optional() }), req.body ?? {});
    const id = await payoutIdByKey(req.params.id!);
    await settlePayout(id, 'PROCESSED', { reference });
    res.json(serializePayout((await prisma.payout.findUnique({ where: { id }, include: payoutInclude }))!));
  }),
);

adminOpsRouter.post(
  '/payouts/:id/fail',
  asyncHandler(async (req, res) => {
    const { reason } = parseBody(z.object({ reason: z.string().min(2) }), req.body);
    const id = await payoutIdByKey(req.params.id!);
    await settlePayout(id, 'FAILED', { failureReason: reason });
    res.json(serializePayout((await prisma.payout.findUnique({ where: { id }, include: payoutInclude }))!));
  }),
);

/** Outstanding balances per party, to decide who to pay. */
adminOpsRouter.get(
  '/payouts/outstanding',
  asyncHandler(async (_req, res) => {
    const [vendors, riders] = await Promise.all([
      prisma.vendor.findMany({ where: { status: 'ACTIVE' }, select: { id: true, shopName: true } }),
      prisma.rider.findMany({ where: { onboardingStatus: 'APPROVED' }, include: { user: { select: { name: true } } } }),
    ]);
    const data = [
      ...(await Promise.all(vendors.map(async (v) => ({ type: 'Vendor', partyId: v.id, name: v.shopName, ...(await partyBalance({ type: 'VENDOR', id: v.id })) })))),
      ...(await Promise.all(riders.map(async (r) => ({ type: 'Rider', partyId: r.id, name: r.user.name, ...(await partyBalance({ type: 'RIDER', id: r.id })) })))),
    ].filter((x) => x.outstanding > 0 || x.pendingPayout > 0);
    res.json({ data });
  }),
);
