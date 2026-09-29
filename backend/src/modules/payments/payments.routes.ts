import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import type { PaymentStatus } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, parseBody } from '../../lib/http.js';
import { badRequest, HttpError, notFound, unauthorized, unprocessable } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { requireCustomer } from '../../middleware/auth.js';
import { addEvent, broadcastOrder } from '../../services/orders.js';
import { notifyUser } from '../../services/notifications.js';
import { createOrder as createRazorpayOrder, fetchPayment, razorpayConfigured, refund as razorpayRefund, verifyCheckoutSignature, verifyWebhookSignature } from '../../services/razorpay.js';

/**
 * Online payments (UPI / card / netbanking).
 *
 *   PAYMENT_PROVIDER=mock      built-in fake gateway, for testing without money
 *   PAYMENT_PROVIDER=razorpay  live gateway (needs RAZORPAY_KEY_ID / _KEY_SECRET,
 *                              and RAZORPAY_WEBHOOK_SECRET for the webhook)
 *
 * Cash on delivery and wallet do not come through here - they are settled in the
 * order flow itself.
 */
export const paymentsRouter = Router();

const useRazorpay = () => env.PAYMENT_PROVIDER === 'razorpay' && razorpayConfigured();

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
  const order = await broadcastOrder(payment.orderId);
  await notifyUser(order.customer.userId, {
    title: 'Payment received',
    message: `₹${Number(payment.amount)} for order ${order.orderNumber}`,
    type: 'ORDER',
    data: { orderId: order.id },
  });
  return updated;
}

async function markFailed(paymentId: string, reason?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status === 'PAID') return payment;
  await prisma.payment.update({ where: { id: paymentId }, data: { status: 'FAILED', meta: { reason } as never } });
  await addEvent(prisma, payment.orderId, { type: 'PAYMENT', title: 'Payment failed', description: reason });
  return payment;
}

// ---------------------------------------------------------------------------
// Webhook (no auth: authenticity comes from the signature over the raw body)
// ---------------------------------------------------------------------------

paymentsRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    // ---- Razorpay
    if (useRazorpay()) {
      const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
      if (!raw) throw new HttpError(500, 'RAW_BODY_MISSING', 'Raw body capture is not configured');
      if (!verifyWebhookSignature(raw, req.header('x-razorpay-signature'))) {
        logger.warn({ ip: req.ip }, 'razorpay webhook: bad signature');
        throw unauthorized('Invalid webhook signature');
      }

      const body = req.body as { event?: string; payload?: { payment?: { entity?: { id: string; order_id: string; status: string; error_description?: string } } } };
      const entity = body.payload?.payment?.entity;
      if (!entity) {
        res.json({ received: true });
        return;
      }
      const payment = await prisma.payment.findFirst({ where: { providerOrderId: entity.order_id }, orderBy: { createdAt: 'desc' } });
      if (!payment) {
        logger.warn({ orderId: entity.order_id, event: body.event }, 'razorpay webhook: no matching payment');
        res.json({ received: true });
        return;
      }
      if (body.event === 'payment.captured' || entity.status === 'captured') await markPaid(payment.id, entity.id, { source: 'webhook', event: body.event });
      else if (body.event === 'payment.failed') await markFailed(payment.id, entity.error_description ?? 'Payment failed at the gateway');
      res.json({ received: true });
      return;
    }

    // ---- mock gateway
    const b = parseBody(z.object({ paymentId: z.string(), providerPaymentId: z.string(), status: z.enum(['PAID', 'FAILED']) }), req.body);
    if (b.status === 'PAID') await markPaid(b.paymentId, b.providerPaymentId, { source: 'webhook' });
    else await markFailed(b.paymentId, 'Mock gateway reported failure');
    res.json({ received: true });
  }),
);

paymentsRouter.use(requireCustomer);

// ---------------------------------------------------------------------------
// Start a payment
// ---------------------------------------------------------------------------

paymentsRouter.post(
  '/intent',
  asyncHandler(async (req, res) => {
    const { orderId, method } = parseBody(z.object({ orderId: z.string(), method: z.enum(['UPI', 'CARD']).default('UPI') }), req.body);
    const order = await prisma.order.findFirst({ where: { id: orderId, customerId: req.user!.customerId } });
    if (!order) throw notFound('Order');
    if (order.paymentStatus === 'PAID') throw unprocessable('Order is already paid');
    if (order.status === 'CANCELLED') throw unprocessable('Order was cancelled');

    const amount = Number(order.total);
    let providerOrderId: string;
    let provider: string;

    if (useRazorpay()) {
      const rp = await createRazorpayOrder({
        amountRupees: amount,
        receipt: order.orderNumber,
        notes: { orderId: order.id, orderNumber: order.orderNumber, customerId: order.customerId },
      });
      providerOrderId = rp.id;
      provider = 'razorpay';
    } else {
      providerOrderId = `mock_order_${crypto.randomBytes(6).toString('hex')}`;
      provider = 'mock';
    }

    const payment = await prisma.payment.create({
      data: { orderId: order.id, customerId: order.customerId, method, amount: order.total, provider, providerOrderId },
    });
    await prisma.order.update({ where: { id: order.id }, data: { paymentMethod: method } });

    res.status(201).json({
      paymentId: payment.id,
      provider,
      // the checkout SDK needs these three
      keyId: useRazorpay() ? env.RAZORPAY_KEY_ID : null,
      providerOrderId,
      amount,
      amountPaise: Math.round(amount * 100),
      currency: 'INR',
      orderNumber: order.orderNumber,
    });
  }),
);

// ---------------------------------------------------------------------------
// Confirm after checkout
// ---------------------------------------------------------------------------

paymentsRouter.post(
  '/:id/confirm',
  asyncHandler(async (req, res) => {
    const b = parseBody(
      z.object({
        providerPaymentId: z.string().optional(),
        signature: z.string().optional(),
        // aliases as the Razorpay checkout SDK returns them
        razorpay_payment_id: z.string().optional(),
        razorpay_order_id: z.string().optional(),
        razorpay_signature: z.string().optional(),
      }),
      req.body ?? {},
    );
    const payment = await prisma.payment.findFirst({ where: { id: req.params.id, customerId: req.user!.customerId } });
    if (!payment) throw notFound('Payment');
    if (payment.status === 'PAID') {
      res.json(payment);
      return;
    }

    const providerPaymentId = b.razorpay_payment_id ?? b.providerPaymentId;
    const signature = b.razorpay_signature ?? b.signature;

    if (useRazorpay()) {
      if (!providerPaymentId || !signature) throw badRequest('razorpay_payment_id and razorpay_signature are required');
      const orderId = b.razorpay_order_id ?? payment.providerOrderId;
      if (!orderId) throw badRequest('Missing razorpay_order_id');
      if (!verifyCheckoutSignature({ orderId, paymentId: providerPaymentId, signature })) {
        await markFailed(payment.id, 'Signature verification failed');
        throw unauthorized('Payment signature verification failed');
      }
      // trust but verify: ask the gateway what actually happened
      const remote = await fetchPayment(providerPaymentId);
      if (remote.status !== 'captured' && remote.status !== 'authorized') {
        await markFailed(payment.id, remote.error_description ?? `Gateway status ${remote.status}`);
        throw unprocessable(`Payment not completed (status: ${remote.status})`);
      }
      res.json(await markPaid(payment.id, providerPaymentId, { source: 'client', method: remote.method }));
      return;
    }

    res.json(await markPaid(payment.id, providerPaymentId ?? 'mock_pay', { source: 'client' }));
  }),
);

paymentsRouter.get(
  '/order/:orderId',
  asyncHandler(async (req, res) => {
    res.json({ data: await prisma.payment.findMany({ where: { orderId: req.params.orderId, customerId: req.user!.customerId }, orderBy: { createdAt: 'desc' } }) });
  }),
);

// ---------------------------------------------------------------------------
// Refunds (used when a paid order is cancelled)
// ---------------------------------------------------------------------------

/** Refund every captured online payment on an order. Safe to call when there are none. */
export async function refundOrderPayments(orderId: string, reason: string): Promise<number> {
  const payments = await prisma.payment.findMany({ where: { orderId, status: 'PAID', provider: 'razorpay' } });
  let refunded = 0;
  for (const p of payments) {
    if (!p.providerPaymentId) continue;
    try {
      await razorpayRefund(p.providerPaymentId, Number(p.amount));
      await prisma.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED' as PaymentStatus } });
      refunded += Number(p.amount);
      await addEvent(prisma, orderId, { type: 'PAYMENT', title: 'Refund issued', description: `₹${Number(p.amount)} • ${reason}` });
    } catch (err) {
      logger.error({ err, paymentId: p.id }, 'refund failed; settle manually in the Razorpay dashboard');
      await addEvent(prisma, orderId, { type: 'PAYMENT', title: 'Refund failed', description: 'Please refund manually in the Razorpay dashboard' });
    }
  }
  if (refunded > 0) await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'REFUNDED' } });
  return refunded;
}
