import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../lib/errors.js';

/**
 * Razorpay (https://razorpay.com/docs/api/).
 *
 * Flow:
 *   1. the app calls POST /payments/intent  -> we create a Razorpay order and
 *      return { keyId, providerOrderId, amount } for the checkout SDK
 *   2. the customer pays; checkout hands the app
 *      razorpay_order_id / razorpay_payment_id / razorpay_signature
 *   3. the app calls POST /payments/:id/confirm with those three values -
 *      we verify the signature (HMAC-SHA256 of "order|payment" with the key secret)
 *   4. independently Razorpay calls POST /payments/webhook - we verify
 *      X-Razorpay-Signature (HMAC-SHA256 of the RAW body with the webhook secret)
 *      and settle the order even if the app died mid-payment
 *
 * Money is sent to Razorpay in paise (integer), so 160.50 -> 16050.
 */

export const razorpayConfigured = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

const authHeader = () => 'Basic ' + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
export const toPaise = (rupees: number) => Math.round(rupees * 100);

async function call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: init.method,
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { description?: string } };
  if (!res.ok) {
    const message = json.error?.description ?? `Razorpay responded ${res.status}`;
    logger.error({ path, status: res.status, message }, 'Razorpay API error');
    throw new HttpError(502, 'PAYMENT_PROVIDER_ERROR', `Payment gateway: ${message}`);
  }
  return json as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

export function createOrder(input: { amountRupees: number; receipt: string; notes?: Record<string, string> }) {
  return call<RazorpayOrder>('/orders', {
    method: 'POST',
    body: { amount: toPaise(input.amountRupees), currency: 'INR', receipt: input.receipt.slice(0, 40), notes: input.notes, payment_capture: 1 },
  });
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method?: string;
  error_description?: string;
}

export const fetchPayment = (paymentId: string) => call<RazorpayPayment>(`/payments/${paymentId}`, { method: 'GET' });

export const refund = (paymentId: string, amountRupees?: number) =>
  call<{ id: string; amount: number; status: string }>(`/payments/${paymentId}/refund`, {
    method: 'POST',
    body: amountRupees === undefined ? {} : { amount: toPaise(amountRupees) },
  });

/** Constant-time compare so a wrong signature cannot be guessed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Checkout callback: HMAC-SHA256("<order_id>|<payment_id>") keyed with the API key secret. */
export function verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${input.orderId}|${input.paymentId}`).digest('hex');
  return safeEqual(expected, input.signature);
}

/**
 * Webhook: HMAC-SHA256 of the RAW request body keyed with the *webhook* secret
 * (a different secret from the API key - set it in the Razorpay dashboard).
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
