import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, paginated, parseBody, parsePagination, parseQuery } from '../../lib/http.js';
import { notFound } from '../../lib/errors.js';
import { nextId } from '../../lib/ids.js';
import { requireAuth } from '../../middleware/auth.js';
import { notifyAdmins, notifyUser } from '../../services/notifications.js';
import { realtime } from '../../realtime/socket.js';
import { getSettings } from '../../services/settings.js';

/** Help & support for any logged-in user; admin management lives in the admin router. */
export const supportRouter = Router();

supportRouter.get(
  '/faqs',
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const search = typeof req.query.q === 'string' ? req.query.q : undefined;
    const faqs = await prisma.faq.findMany({
      where: {
        isActive: true,
        ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
        ...(search ? { OR: [{ question: { contains: search, mode: 'insensitive' } }, { answer: { contains: search, mode: 'insensitive' } }] } : {}),
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
    res.json({ data: faqs });
  }),
);

supportRouter.use(requireAuth);

export const ticketInclude = {
  messages: { orderBy: { createdAt: 'asc' as const } },
  createdBy: { select: { id: true, name: true, role: true, phone: true } },
  assignedTo: { select: { id: true, name: true } },
  order: { select: { id: true, orderNumber: true, status: true } },
};

supportRouter.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    const p = parsePagination(req.query);
    const where = { createdById: req.user!.id };
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({ where, include: ticketInclude, orderBy: { updatedAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.supportTicket.count({ where }),
    ]);
    res.json(paginated(tickets, total, p));
  }),
);

supportRouter.post(
  '/tickets',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        subject: z.string().min(3).max(150),
        message: z.string().min(3).max(2000),
        category: z.enum(['DAMAGE', 'DELAY', 'PAYOUT', 'APP_BUG', 'REFUND', 'DELIVERY', 'QUALITY', 'OTHER']).default('OTHER'),
        priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
        orderId: z.string().optional(),
      }),
      req.body,
    );
    if (body.orderId) {
      const order = await prisma.order.findFirst({ where: { OR: [{ id: body.orderId }, { orderNumber: body.orderId.replace(/^#/, '') }] } });
      if (!order) throw notFound('Order');
      body.orderId = order.id;
    }
    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber: await nextId('TKT'),
        subject: body.subject,
        category: body.category,
        priority: body.priority,
        createdById: req.user!.id,
        creatorRole: req.user!.role,
        orderId: body.orderId,
        messages: { create: { senderId: req.user!.id, senderName: req.user!.name, text: body.message, isStaff: false } },
      },
      include: ticketInclude,
    });
    await notifyAdmins({ title: `New ${body.priority.toLowerCase()} priority ticket`, message: `${req.user!.name} (${req.user!.role}): ${body.subject}`, type: 'SUPPORT', data: { ticketId: ticket.id } });
    realtime.toAdmins('ticket:new', ticket);
    res.status(201).json(ticket);
  }),
);

supportRouter.get(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const ticket = await prisma.supportTicket.findFirst({ where: { id: req.params.id, createdById: req.user!.id }, include: ticketInclude });
    if (!ticket) throw notFound('Ticket');
    res.json(ticket);
  }),
);

supportRouter.post(
  '/tickets/:id/messages',
  asyncHandler(async (req, res) => {
    const { text } = parseBody(z.object({ text: z.string().min(1).max(2000) }), req.body);
    const ticket = await prisma.supportTicket.findFirst({ where: { id: req.params.id, createdById: req.user!.id } });
    if (!ticket) throw notFound('Ticket');
    const message = await prisma.ticketMessage.create({ data: { ticketId: ticket.id, senderId: req.user!.id, senderName: req.user!.name, text, isStaff: false } });
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status, updatedAt: new Date() } });
    realtime.toAdmins('ticket:message', { ticketId: ticket.id, message });
    if (ticket.assignedToId) await notifyUser(ticket.assignedToId, { title: `Reply on ${ticket.ticketNumber}`, message: text.slice(0, 120), type: 'SUPPORT', data: { ticketId: ticket.id } });
    res.status(201).json(message);
  }),
);

/** Live chat / call / WhatsApp entry points shown on the Help screen. */
supportRouter.get(
  '/channels',
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    res.json({ phone: s.supportPhone, email: s.supportEmail, whatsapp: s.supportPhone, hours: s.operatingHours, liveChat: true });
  }),
);
