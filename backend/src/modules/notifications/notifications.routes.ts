import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, paginated, parsePagination } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const p = parsePagination(req.query);
    const where = { userId: req.user!.id, ...(req.query.unread === 'true' ? { read: false } : {}) };
    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user!.id, read: false } }),
    ]);
    res.json({ ...paginated(items, total, p), unreadCount: unread });
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id }, data: { read: true } });
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, read: false }, data: { read: true } });
    res.json({ ok: true });
  }),
);

notificationsRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    await prisma.notification.deleteMany({ where: { userId: req.user!.id } });
    res.json({ ok: true });
  }),
);
