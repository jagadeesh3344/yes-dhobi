import type { NotificationType, Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { realtime } from '../realtime/socket.js';

interface NotifyInput {
  title: string;
  message: string;
  type?: NotificationType;
  data?: Prisma.InputJsonValue;
}

/** Persist a notification for one user and push it over the socket. */
export async function notifyUser(userId: string, input: NotifyInput) {
  const n = await prisma.notification.create({
    data: { userId, title: input.title, message: input.message, type: input.type ?? 'SYSTEM', data: input.data },
  });
  realtime.toUser(userId, 'notification:new', n);
  return n;
}

/** Notify every admin (used for dashboard feed: new orders, KYC submissions...). */
export async function notifyAdmins(input: NotifyInput) {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title: input.title,
      message: input.message,
      type: input.type ?? 'SYSTEM',
      data: input.data,
    })),
  });
  realtime.toAdmins('notification:new', { ...input, createdAt: new Date().toISOString() });
}

/** Broadcast to an audience (admin "Broadcast" modal). */
export async function broadcast(roles: Role[], input: NotifyInput) {
  const users = await prisma.user.findMany({ where: { role: { in: roles }, status: 'ACTIVE' }, select: { id: true } });
  if (users.length === 0) return 0;
  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      title: input.title,
      message: input.message,
      type: input.type ?? 'PROMO',
      data: input.data,
    })),
  });
  for (const u of users) realtime.toUser(u.id, 'notification:new', { ...input, createdAt: new Date().toISOString() });
  return users.length;
}
