import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { loadAuthUser, type AuthUser } from '../middleware/auth.js';

/**
 * Socket.IO rooms
 *  user:{userId}      - private channel (notifications, pickup offers, order updates)
 *  order:{orderId}    - live tracking for a specific order (customer, rider, vendor, admins)
 *  admins             - every connected admin (dashboard live feed)
 *  zone:{zoneId}      - riders in a zone
 */

let io: Server | null = null;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: env.CORS_ORIGINS === '*' ? '*' : env.CORS_ORIGINS.split(',').map((s) => s.trim()) },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (typeof socket.handshake.query.token === 'string' ? socket.handshake.query.token : undefined) ??
        socket.handshake.headers.authorization?.replace(/^Bearer /, '');
      if (!token) return next(new Error('Authentication required'));
      (socket.data as { user: AuthUser }).user = await loadAuthUser(token);
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket.data as { user: AuthUser }).user;
    socket.join(`user:${user.id}`);
    if (user.role === 'ADMIN') socket.join('admins');
    logger.debug({ userId: user.id, role: user.role }, 'socket connected');

    socket.on('order:subscribe', (orderId: string) => {
      if (typeof orderId === 'string') socket.join(`order:${orderId}`);
    });
    socket.on('order:unsubscribe', (orderId: string) => {
      if (typeof orderId === 'string') socket.leave(`order:${orderId}`);
    });
    socket.on('zone:subscribe', (zoneId: number) => {
      if (Number.isInteger(zoneId)) socket.join(`zone:${zoneId}`);
    });
  });

  return io;
}

export function getIo(): Server | null {
  return io;
}

export const realtime = {
  toUser(userId: string, event: string, payload: unknown) {
    io?.to(`user:${userId}`).emit(event, payload);
  },
  toOrder(orderId: string, event: string, payload: unknown) {
    io?.to(`order:${orderId}`).emit(event, payload);
  },
  toAdmins(event: string, payload: unknown) {
    io?.to('admins').emit(event, payload);
  },
  toZone(zoneId: number, event: string, payload: unknown) {
    io?.to(`zone:${zoneId}`).emit(event, payload);
  },
};
