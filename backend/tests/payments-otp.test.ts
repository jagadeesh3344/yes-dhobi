/**
 * Razorpay signature handling and the OTP delivery channel.
 * These run against the mock gateway plus direct unit checks of the crypto,
 * so no real Razorpay/Meta account is needed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';
process.env.OTP_DEV_MODE = 'true';
// set before any import: config/env.ts validates the environment once, at import time
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';

let app: Express;
const api = () => request(app);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let customerToken = '';
let orderId = '';

beforeAll(async () => {
  const { createApp } = await import('../src/app.js');
  app = createApp();

  const phone = `98${Math.floor(10000000 + Math.random() * 89999999)}`;
  await api().post('/api/v1/auth/customer/request-otp').send({ phone });
  customerToken = (await api().post('/api/v1/auth/customer/verify-otp').send({ phone, otp: '1234', name: 'Payment Tester' })).body.accessToken;
  const addr = await api()
    .post('/api/v1/customers/me/addresses')
    .set(auth(customerToken))
    .send({ label: 'Home', line1: 'Flat 2, HSR Layout', city: 'Bangalore', pincode: '560102', lat: 12.9121, lng: 77.6446 });
  const order = await api()
    .post('/api/v1/orders')
    .set(auth(customerToken))
    .send({
      items: [{ code: 'wi_1', quantity: 2 }],
      addressId: addr.body.id,
      pickupDate: new Date(Date.now() + 86400_000).toISOString(),
      pickupSlot: '6-8 PM',
      paymentMethod: 'UPI',
    });
  orderId = order.body.id;
});

describe('OTP delivery', () => {
  it('reports which channel the code went out on', async () => {
    const phone = `97${Math.floor(10000000 + Math.random() * 89999999)}`;
    const res = await api().post('/api/v1/auth/customer/request-otp').send({ phone });
    expect(res.status).toBe(200);
    expect(res.body.channel).toBe('sms'); // default; 'whatsapp' once OTP_CHANNEL is switched
    expect(res.body.devOtp).toBe('1234');
  });

  it('falls back to SMS when WhatsApp is selected but not configured', async () => {
    const { sendWhatsAppOtp, whatsappConfigured } = await import('../src/services/whatsapp.js');
    expect(whatsappConfigured()).toBe(false);
    const attempt = await sendWhatsAppOtp('+919876500000', '1234');
    expect(attempt.ok).toBe(false); // never throws, so the OTP service can fall back
  });
});

describe('payments (mock gateway)', () => {
  // PAYMENT_PROVIDER is left at its default 'mock', so the keys above are unused here
  let paymentId = '';

  it('creates a payment intent for the order', async () => {
    const res = await api().post('/api/v1/payments/intent').set(auth(customerToken)).send({ orderId, method: 'UPI' });
    expect(res.status).toBe(201);
    expect(res.body.provider).toBe('mock');
    expect(res.body.amountPaise).toBe(Math.round(res.body.amount * 100));
    expect(res.body.providerOrderId).toBeTruthy();
    paymentId = res.body.paymentId;
  });

  it('marks the order paid on confirm', async () => {
    const res = await api().post(`/api/v1/payments/${paymentId}/confirm`).set(auth(customerToken)).send({ providerPaymentId: 'mock_pay_1' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
    const order = await api().get(`/api/v1/orders/${orderId}`).set(auth(customerToken));
    expect(order.body.paymentStatus).toBe('PAID');
  });

  it('refuses to pay for an order that is already paid', async () => {
    const res = await api().post('/api/v1/payments/intent').set(auth(customerToken)).send({ orderId, method: 'UPI' });
    expect(res.status).toBe(422);
  });
});

describe('razorpay signature handling', () => {
  it('accepts a correct checkout signature and rejects a tampered one', async () => {
    const secret = process.env.RAZORPAY_KEY_SECRET!;
    const mod = await import('../src/services/razorpay.js');
    const orderId = 'order_ABC123';
    const paymentId = 'pay_XYZ789';
    const good = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

    expect(mod.verifyCheckoutSignature({ orderId, paymentId, signature: good })).toBe(true);
    expect(mod.verifyCheckoutSignature({ orderId, paymentId, signature: good.replace(/.$/, '0') })).toBe(false);
    expect(mod.verifyCheckoutSignature({ orderId, paymentId: 'pay_OTHER', signature: good })).toBe(false);
    expect(mod.verifyCheckoutSignature({ orderId, paymentId, signature: 'short' })).toBe(false);
  });

  it('verifies the webhook signature over the raw body', async () => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
    const mod = await import('../src/services/razorpay.js');
    const raw = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} }));
    const good = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    expect(mod.verifyWebhookSignature(raw, good)).toBe(true);
    expect(mod.verifyWebhookSignature(raw, undefined)).toBe(false);
    expect(mod.verifyWebhookSignature(Buffer.from(JSON.stringify({ event: 'tampered' })), good)).toBe(false);
  });

  it('converts rupees to paise without floating point drift', async () => {
    const { toPaise } = await import('../src/services/razorpay.js');
    expect(toPaise(160)).toBe(16000);
    expect(toPaise(160.5)).toBe(16050);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(1234.56)).toBe(123456);
  });
});
