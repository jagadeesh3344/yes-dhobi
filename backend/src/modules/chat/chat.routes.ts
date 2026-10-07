import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parseBody, parseQuery } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  THREADS,
  type ThreadKey,
  counterparties,
  listMessages,
  loadOrderForChat,
  markThreadRead,
  partyOf,
  sendMessage,
  threadKey,
  unreadCounts,
} from '../../services/chat.js';

/**
 * Call + chat between the parties on an order, for all four apps.
 *
 * Every route resolves the caller's party from the order first, so a customer
 * cannot read the rider/partner thread and nobody can touch an order they are
 * not on.
 *
 *   GET  /chat/:orderId/contacts        who I can call/message now + their numbers
 *   GET  /chat/:orderId/:party          the thread with that party
 *   POST /chat/:orderId/:party          send a message
 *   POST /chat/:orderId/:party/read     mark the thread read
 */
export const chatRouter = Router();
chatRouter.use(requireAuth);

const partyParam = z.enum(['CUSTOMER', 'RIDER', 'VENDOR', 'ADMIN']);

/**
 * The call sheet. `phone` is the real number only while a call is appropriate
 * for the stage of the order; otherwise it comes back masked with `callable:
 * false` so the app can grey the button out.
 */
chatRouter.get(
  '/:orderId/contacts',
  asyncHandler(async (req, res) => {
    const order = await loadOrderForChat(req.params.orderId!);
    const me = partyOf(order, req.user!);
    const contacts = counterparties(order, me);
    res.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      me,
      contacts,
      unread: await unreadCounts(order.id, me),
    });
  }),
);

chatRouter.get(
  '/:orderId/:party',
  asyncHandler(async (req, res) => {
    const order = await loadOrderForChat(req.params.orderId!);
    const me = partyOf(order, req.user!);
    const other = partyParam.parse(req.params.party!.toUpperCase());
    const q = parseQuery(z.object({ limit: z.coerce.number().int().min(1).max(300).default(100) }), req.query);
    const thread = threadKey(me === 'ADMIN' ? other : me, other);
    res.json({
      orderId: order.id,
      thread,
      data: await listMessages(order.id, thread, me, q.limit),
    });
  }),
);

chatRouter.post(
  '/:orderId/:party',
  asyncHandler(async (req, res) => {
    const order = await loadOrderForChat(req.params.orderId!);
    const me = partyOf(order, req.user!);
    const other = partyParam.parse(req.params.party!.toUpperCase());
    const { body } = parseBody(z.object({ body: z.string().trim().min(1, 'Message cannot be empty').max(1000) }), req.body);
    res.status(201).json(await sendMessage({ order, me, user: req.user!, to: other, body }));
  }),
);

chatRouter.post(
  '/:orderId/:party/read',
  asyncHandler(async (req, res) => {
    const order = await loadOrderForChat(req.params.orderId!);
    const me = partyOf(order, req.user!);
    const other = partyParam.parse(req.params.party!.toUpperCase());
    const thread = threadKey(me === 'ADMIN' ? other : me, other);
    res.json(await markThreadRead(order.id, thread as ThreadKey, me));
  }),
);

/** Admin support view: all three threads on one order. */
chatRouter.get(
  '/:orderId',
  asyncHandler(async (req, res) => {
    const order = await loadOrderForChat(req.params.orderId!);
    const me = partyOf(order, req.user!);
    const threads = await Promise.all(
      THREADS.filter((t) => me === 'ADMIN' || t.split('_').includes(me)).map(async (t) => ({
        thread: t,
        messages: await listMessages(order.id, t, me),
      })),
    );
    res.json({ orderId: order.id, me, threads });
  }),
);
