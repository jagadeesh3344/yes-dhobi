/**
 * In-order messaging and click-to-call between the three parties on an order.
 *
 * Three independent threads per order:
 *   CUSTOMER_RIDER   customer <-> whichever rider holds the current leg
 *   CUSTOMER_VENDOR  customer <-> laundry partner
 *   RIDER_VENDOR     rider    <-> laundry partner
 *
 * A party only ever sees the threads it belongs to, so the customer can never
 * read what the rider and the shop said to each other. Admins can read all
 * three for support, and post as ADMIN.
 *
 * Both chat and call are only open while the order is live and only between
 * parties who actually have business with each other at that point - once the
 * order is delivered or cancelled the contact details close again.
 */
import type { ChatParty, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { forbidden, notFound, unprocessable } from '../lib/errors.js';
import { maskPhone } from '../lib/utils.js';
import { realtime } from '../realtime/socket.js';
import { notifyUser } from './notifications.js';
import type { AuthUser } from '../middleware/auth.js';

/** Orders in these states have no live contact between parties any more. */
const CLOSED = ['DELIVERED', 'CANCELLED'] as const;

export const THREADS = ['CUSTOMER_RIDER', 'CUSTOMER_VENDOR', 'RIDER_VENDOR'] as const;
export type ThreadKey = (typeof THREADS)[number];

/** Canonical thread key for a pair of parties, whichever order they come in. */
export function threadKey(a: ChatParty, b: ChatParty): ThreadKey {
  const pair = [a, b].sort().join('_');
  const found = THREADS.find((t) => t.split('_').sort().join('_') === pair);
  if (!found) throw unprocessable(`${a} and ${b} cannot message each other`);
  return found;
}

type OrderForChat = Prisma.OrderGetPayload<{
  include: {
    customer: { include: { user: true } };
    vendor: { include: { user: true } };
    pickupRider: { include: { user: true } };
    deliveryRider: { include: { user: true } };
  };
}>;

export const chatOrderInclude = {
  customer: { include: { user: true } },
  vendor: { include: { user: true } },
  pickupRider: { include: { user: true } },
  deliveryRider: { include: { user: true } },
} satisfies Prisma.OrderInclude;

export async function loadOrderForChat(orderId: string): Promise<OrderForChat> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: chatOrderInclude });
  if (!order) throw notFound('Order');
  return order;
}

/** The rider who owns the order right now (delivery leg takes over at READY). */
export function activeRider(order: OrderForChat) {
  return ['READY', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status) ? (order.deliveryRider ?? order.pickupRider) : order.pickupRider;
}

/**
 * Which party is this caller on this order? Throws if they are not on it at
 * all, so every chat/call route is access-checked by calling this first.
 */
export function partyOf(order: OrderForChat, user: AuthUser): ChatParty {
  if (user.role === 'ADMIN') return 'ADMIN';
  if (user.role === 'CUSTOMER' && user.customerId === order.customerId) return 'CUSTOMER';
  if (user.role === 'VENDOR' && user.vendorId && user.vendorId === order.vendorId) return 'VENDOR';
  if (user.role === 'RIDER' && user.riderId && (user.riderId === order.pickupRiderId || user.riderId === order.deliveryRiderId)) return 'RIDER';
  throw notFound('Order');
}

export interface Counterparty {
  party: ChatParty;
  thread: ThreadKey;
  name: string;
  userId: string;
  /** full number when a call is allowed at this stage, masked otherwise */
  phone: string | null;
  callable: boolean;
  role: string;
  /** why calling is closed, when it is */
  note?: string;
}

/**
 * Who this party may contact on this order right now.
 *
 * Stage rules - a party is reachable only once there is a reason to talk:
 *   customer <-> rider   from the moment a rider is assigned to the live leg
 *   customer <-> vendor  once a partner has accepted the order
 *   rider    <-> vendor  once both exist (the rider has to find the shop)
 * All of them close when the order reaches DELIVERED or CANCELLED.
 */
export function counterparties(order: OrderForChat, me: ChatParty): Counterparty[] {
  const closed = (CLOSED as readonly string[]).includes(order.status);
  const rider = activeRider(order);
  const out: Counterparty[] = [];

  const push = (party: ChatParty, name: string | undefined, userId: string | undefined, phone: string | null | undefined, role: string, open: boolean) => {
    if (!name || !userId) return;
    const callable = open && !closed;
    out.push({
      party,
      thread: threadKey(me === 'ADMIN' ? party : me, party),
      name,
      userId,
      phone: callable ? (phone ?? null) : phone ? maskPhone(phone) : null,
      callable,
      role,
      ...(callable ? {} : { note: closed ? 'This order is closed' : 'Not available at this stage of the order' }),
    });
  };

  const riderOpen = Boolean(rider);
  const vendorOpen = Boolean(order.vendorId);

  if (me === 'CUSTOMER' || me === 'ADMIN') {
    push('RIDER', rider?.user.name, rider?.userId, rider?.user.phone, 'Rider', riderOpen);
    push('VENDOR', order.vendor?.shopName, order.vendor?.userId, order.vendor?.user.phone, 'Laundry partner', vendorOpen);
  }
  if (me === 'RIDER' || me === 'ADMIN') {
    push('CUSTOMER', order.customer.user.name, order.customer.userId, order.customer.user.phone, 'Customer', true);
    if (me === 'RIDER') push('VENDOR', order.vendor?.shopName, order.vendor?.userId, order.vendor?.user.phone, 'Laundry partner', vendorOpen);
  }
  if (me === 'VENDOR') {
    push('CUSTOMER', order.customer.user.name, order.customer.userId, order.customer.user.phone, 'Customer', true);
    push('RIDER', rider?.user.name, rider?.userId, rider?.user.phone, 'Rider', riderOpen);
  }

  // admin asked for everyone; de-duplicate the pairs it saw twice
  return me === 'ADMIN' ? out.filter((c, i) => out.findIndex((o) => o.party === c.party) === i) : out;
}

/** The threads this party is allowed to read. */
export function allowedThreads(me: ChatParty): ThreadKey[] {
  if (me === 'ADMIN') return [...THREADS];
  return THREADS.filter((t) => t.split('_').includes(me));
}

function assertThread(me: ChatParty, thread: ThreadKey) {
  if (!allowedThreads(me).includes(thread)) throw forbidden('You are not part of this conversation');
}

export async function listMessages(orderId: string, thread: ThreadKey, me: ChatParty, limit = 100) {
  assertThread(me, thread);
  const rows = await prisma.orderMessage.findMany({
    where: { orderId, thread },
    orderBy: { createdAt: 'asc' },
    take: Math.min(Math.max(limit, 1), 300),
  });
  return rows.map((m) => ({
    id: m.id,
    body: m.body,
    senderRole: m.senderRole,
    senderName: m.senderName,
    mine: m.senderRole === me,
    readAt: m.readAt,
    createdAt: m.createdAt,
  }));
}

/** Mark everything the other side wrote in this thread as read. */
export async function markThreadRead(orderId: string, thread: ThreadKey, me: ChatParty) {
  assertThread(me, thread);
  const { count } = await prisma.orderMessage.updateMany({
    where: { orderId, thread, senderRole: { not: me }, readAt: null },
    data: { readAt: new Date() },
  });
  return { read: count };
}

/** Unread counts per thread, for the chat badges. */
export async function unreadCounts(orderId: string, me: ChatParty) {
  const rows = await prisma.orderMessage.groupBy({
    by: ['thread'],
    where: { orderId, thread: { in: allowedThreads(me) }, senderRole: { not: me }, readAt: null },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.thread, r._count._all])) as Partial<Record<ThreadKey, number>>;
}

export async function sendMessage(opts: {
  order: OrderForChat;
  me: ChatParty;
  user: AuthUser;
  to: ChatParty;
  body: string;
}) {
  const { order, me, user, to, body } = opts;
  if ((CLOSED as readonly string[]).includes(order.status)) throw unprocessable('This order is closed, you can no longer send messages.');

  const target = counterparties(order, me).find((c) => c.party === to);
  if (!target) throw unprocessable(`There is no ${to.toLowerCase()} on this order yet`);
  if (!target.callable && me !== 'ADMIN') throw unprocessable(target.note ?? 'Not available at this stage of the order');

  const thread = threadKey(me === 'ADMIN' ? to : me, to);
  assertThread(me, thread);

  const message = await prisma.orderMessage.create({
    data: { orderId: order.id, thread, senderRole: me, senderUserId: user.id, senderName: user.name, body },
  });

  const payload = {
    id: message.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    thread,
    body: message.body,
    senderRole: message.senderRole,
    senderName: message.senderName,
    createdAt: message.createdAt,
  };
  realtime.toUser(target.userId, 'chat:message', payload);
  realtime.toOrder(order.id, 'chat:message', payload);
  realtime.toAdmins('chat:message', payload);

  await notifyUser(target.userId, {
    title: `Message from ${user.name}`,
    message: body.length > 120 ? `${body.slice(0, 117)}...` : body,
    type: 'ORDER',
    data: { orderId: order.id, thread },
  });

  return { ...payload, mine: true, readAt: null };
}
