import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, parseBody } from '../../lib/http.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { requireCustomer } from '../../middleware/auth.js';
import { addEvent, broadcastOrder } from '../../services/orders.js';

/**
 * Online payments (UPI / Card).
 *
 * This ships with a *mock* provider so the apps can be exercised end to end:
 *   1. POST /payments/intent  { orderId }         -> { paymentId, providerOrderId, amount }
 *   2. client "pays"
 *   3. POST /payments/:id/confirm { providerPaymentId, signature } -> marks PAID
 *
 * To integrate Razorpay/PhonePe: create the provider order in `intent`, verify the
 * signature in `confirm` and handle `webhook` for asynchronous confirmations.
 */
export const paymentsRouter = Router();

async function markPaid(paymentId: string, providerPaymentId: string, meta?: Record<string, unknown>) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw notFound('Payment');
  if (payment.status === 'PAID') return payment;
  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({ where: { id: paymentId }, data: { status: 'PAID', providerPaymentId, meta: meta as never } });
    await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: 'PAID' } });
    await addEvent(tx, payment.orderId, { type: 'PAYMENT', title: 'Payment received', description: `${payment.method} • ₹${Number(payment.amount)}` });
    return p;
  });
  await broadcastOrder(payment.orderId);
  return updated;
}

/** Provider webhook (no auth; verify signature with your provider secret). */
paymentsRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ paymentId: z.string(), providerPaymentId: z.string(), status: z.enum(['PAID', 'FAILED']) }), req.body);
    if (body.status === 'PAID') await markPaid(body.paymentId, body.providerPaymentId, { source: 'webhook' });
    else await prisma.payment.update({ where: { id: body.paymentId }, data: { status: 'FAILED' } });
    res.json({ received: true });
  }),
);

paymentsRouter.use(requireCustomer);

paymentsRouter.post(
  '/intent',
  asyncHandler(async (req, res) => {
    const { orderId, method } = parseBody(z.object({ orderId: z.string(), method: z.enum(['UPI', 'CARD']).default('UPI') }), req.body);
    const order = await prisma.order.findFirst({ where: { id: orderId, customerId: req.user!.customerId } });
    if (!order) throw notFound('Order');
    if (order.paymentStatus === 'PAID') throw unprocessable('Order is already paid');
    const providerOrderId = `mock_order_${crypto.randomBytes(6).toString('hex')}`;
    const payment = await prisma.payment.create({
      data: { orderId: order.id, customerId: order.customerId, method, amount: order.total, provider: 'mock', providerOrderId },
    });
    await prisma.order.update({ where: { id: order.id }, data: { paymentMethod: method } });
    res.status(201).json({ paymentId: payment.id, providerOrderId, amount: order.total, currency: 'INR', provider: 'mock' });
  }),
);

paymentsRouter.post(
  '/:id/confirm',
  asyncHandler(async (req, res) => {
    const { providerPaymentId } = parseBody(z.object({ providerPaymentId: z.string().default('mock_pay'), signature: z.string().optional() }), req.body ?? {});
    const payment = await prisma.payment.findFirst({ where: { id: req.params.id, customerId: req.user!.customerId } });
    if (!payment) throw notFound('Payment');
    res.json(await markPaid(payment.id, providerPaymentId, { source: 'client' }));
  }),
);

paymentsRouter.get(
  '/order/:orderId',
  asyncHandler(async (req, res) => {
    res.json({ data: await prisma.payment.findMany({ where: { orderId: req.params.orderId, customerId: req.user!.customerId }, orderBy: { createdAt: 'desc' } }) });
  }),
);
