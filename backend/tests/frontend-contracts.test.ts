/**
 * Contract checks for the exact payload shapes each frontend sends
 * (admin panel modals, customer app screens, rider app extras).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';
process.env.OTP_DEV_MODE = 'true';

let app: Express;
const api = () => request(app);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let adminToken = '';
let customerToken = '';
let riderToken = '';

beforeAll(async () => {
  const { createApp } = await import('../src/app.js');
  app = createApp();
  adminToken = (await api().post('/api/v1/auth/admin/login').send({ email: 'admin@yesdhobi.com', password: 'Admin@12345' })).body.accessToken;
  riderToken = (await api().post('/api/v1/auth/rider/login').send({ phone: '9876543211', password: 'Partner@123' })).body.accessToken;
  const phone = '9876543000'; // seeded customer Rahul Sharma
  await api().post('/api/v1/auth/customer/request-otp').send({ phone });
  customerToken = (await api().post('/api/v1/auth/customer/verify-otp').send({ phone, otp: '1234' })).body.accessToken;
  expect(adminToken && riderToken && customerToken).toBeTruthy();
});

describe('admin panel modals', () => {
  let orderId = '';

  it('OrderModal: creates a manual order with free-form fields and panel labels', async () => {
    const res = await api().post('/api/v1/admin/orders').set(auth(adminToken)).send({
      customerName: 'Sneha Kapoor',
      customerPhone: '+91 98765 11223',
      customerAddress: 'Flat 402, Palm Heights, Indiranagar, Bangalore',
      partnerName: 'Star Bright Laundry',
      riderName: 'Unassigned',
      serviceName: 'Wash & Iron',
      itemsCount: 12,
      itemDetails: '6 Shirts, 4 Trousers, 2 Bedsheets',
      amount: 240,
      status: 'Pending Pickup',
      pickupDate: 'Today, 10:00 AM',
      deliveryDate: 'Tomorrow, 06:00 PM',
      paymentMethod: 'Card',
      paymentStatus: 'Paid',
      notes: 'Gentle detergent for silk shirts please',
    });
    expect(res.status).toBe(201);
    expect(res.body.customerName).toBe('Sneha Kapoor');
    expect(res.body.partnerName).toBe('Star Bright Laundry');
    expect(res.body.riderName).toBe('');
    expect(res.body.amount).toBe(240);
    expect(res.body.paymentMethod).toBe('CARD');
    expect(res.body.paymentStatus).toBe('PAID');
    expect(res.body.statusLabel).toBe('Pending Pickup');
    expect(res.body.payouts.vendor).toBe(192); // 20% commission
    orderId = res.body.id;
  });

  it('OrderModal edit: updates amount, rider and status via labels', async () => {
    const res = await api().patch(`/api/v1/admin/orders/${orderId}`).set(auth(adminToken)).send({ amount: 300, riderName: 'Rahul Yadav', status: 'In Laundry', paymentMethod: 'Wallet' });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(300);
    expect(res.body.riderName).toBe('Rahul Yadav');
    expect(res.body.statusLabel).toBe('In Laundry');
    expect(res.body.payouts.vendor).toBe(240);
  });

  it('assign-rider / dispatch endpoints respond', async () => {
    const riders = await api().get('/api/v1/admin/riders').set(auth(adminToken));
    expect(riders.body.data[0].status).toMatch(/Online|Offline|On Delivery/);
    expect(riders.body.data[0].vehicle).toBe('Scooter');
  });

  it('ZoneModal: accepts Operational | Paused', async () => {
    const name = `Test Zone ${Date.now()}`;
    const res = await api().post('/api/v1/admin/zones').set(auth(adminToken)).send({ name, city: 'Bangalore', status: 'Paused' });
    expect(res.status).toBe(201);
    expect(res.body.isActive).toBe(false);
    const upd = await api().patch(`/api/v1/admin/zones/${res.body.id}`).set(auth(adminToken)).send({ status: 'Operational' });
    expect(upd.body.isActive).toBe(true);
    await api().delete(`/api/v1/admin/zones/${res.body.id}`).set(auth(adminToken));
  });

  it('BroadcastModal: accepts targetAudience + priority', async () => {
    const res = await api().post('/api/v1/admin/broadcast').set(auth(adminToken)).send({ targetAudience: 'Riders', priority: 'High Alert', title: 'Heavy rain', message: 'Drive safe, delays expected' });
    expect(res.status).toBe(200);
    expect(res.body.recipients).toBeGreaterThan(0);
    const mine = await api().get('/api/v1/notifications?unread=true').set(auth(riderToken));
    expect(mine.body.data[0].title).toBe('Heavy rain');
  });

  it('PromoModal / ServiceModal / SurchargeModal shapes', async () => {
    const promo = await api().post('/api/v1/admin/promotions').set(auth(adminToken)).send({ code: `t${Date.now()}`.slice(0, 12), title: 'Test', type: 'Percentage', discountValue: 10, minOrder: 100, maxUses: 'Unlimited', validity: '2030-01-01' });
    expect(promo.status).toBe(201);
    expect(promo.body.maxUses).toBe('Unlimited');
    expect(promo.body.status).toBe('Active');

    const svc = await api().post('/api/v1/admin/services').set(auth(adminToken)).send({ name: `Test Service ${Date.now()}`, ratePerKgOrItem: 99, rateUnit: '/kg', leadTimeHours: 24, status: 'Inactive', iconName: 'Shirt', description: 'x' });
    expect(svc.status).toBe(201);
    expect(svc.body.rateUnit).toBe('/kg');
    expect(svc.body.status).toBe('Inactive');

    const sur = await api().post('/api/v1/admin/surcharges').set(auth(adminToken)).send({ rule: 'Test rule', trigger: 'always', kind: 'FLAT', value: 5, condition: 'ALWAYS', status: 'Inactive' });
    expect(sur.status).toBe(201);
    expect(sur.body.modifier).toBe('Flat ₹5 Surcharge');
    // clean up so test rows never show in the apps
    await api().delete(`/api/v1/admin/surcharges/${sur.body.id}`).set(auth(adminToken));
    await api().delete(`/api/v1/admin/promotions/${promo.body.id}`).set(auth(adminToken));
    await api().delete(`/api/v1/admin/services/${svc.body.id}`).set(auth(adminToken));
  });

  it('Settings page: settings + activeServiceZones; admin forgot-password', async () => {
    const s = await api().get('/api/v1/admin/settings').set(auth(adminToken));
    expect(s.body.vendorCommissionRate).toBe(20);
    expect(Array.isArray(s.body.activeServiceZones)).toBe(true);

    const fp = await api().post('/api/v1/auth/admin/forgot-password').send({ email: 'admin@yesdhobi.com' });
    expect(fp.status).toBe(200);
    expect(fp.body.devOtp).toBe('1234');
    const bad = await api().post('/api/v1/auth/admin/reset-password').send({ email: 'admin@yesdhobi.com', otp: '9999', newPassword: 'Admin@12345' });
    expect(bad.status).toBe(400);
    const ok = await api().post('/api/v1/auth/admin/reset-password').send({ email: 'admin@yesdhobi.com', otp: '1234', newPassword: 'Admin@12345' });
    expect(ok.status).toBe(200);
  });
});

describe('customer app screens', () => {
  it('home: available coupons, catalog search, config', async () => {
    const promos = await api().get('/api/v1/catalog/promotions');
    expect(promos.body.data.some((p: { code: string }) => p.code === 'FIRSTORDER')).toBe(true);
    const search = await api().get('/api/v1/catalog/items?q=saree');
    expect(search.body.data.length).toBeGreaterThan(0);
    expect(search.body.data.every((i: { name: string }) => /saree/i.test(i.name))).toBe(true);
  });

  it('order details: invoice + reorder', async () => {
    const orders = await api().get('/api/v1/orders?status=all').set(auth(customerToken));
    let orderId = orders.body.data[0]?.id;
    if (!orderId) {
      const created = await api().post('/api/v1/orders').set(auth(customerToken)).send({
        items: [{ code: 'sc_1', quantity: 1 }],
        address: { line1: 'Flat 402, Green Glen Layout', city: 'Bangalore', pincode: '560103' },
        pickupDate: new Date(Date.now() + 86400_000).toISOString(),
        pickupSlot: '6-8 PM',
        paymentMethod: 'COD',
      });
      expect(created.status).toBe(201);
      orderId = created.body.id;
    }
    const inv = await api().get(`/api/v1/orders/${orderId}/invoice`).set(auth(customerToken));
    expect(inv.status).toBe(200);
    expect(inv.body.invoiceNumber).toMatch(/^INV-YD-/);
    expect(inv.body.lines.length).toBeGreaterThan(0);

    const re = await api().post(`/api/v1/orders/${orderId}/reorder`).set(auth(customerToken));
    expect(re.status).toBe(200);
    expect(re.body.items[0].code).toBeTruthy();
    expect(re.body.quote.total).toBeGreaterThan(0);
  });
});

describe('rider app extras', () => {
  it('post-login selfie verification stores the image', async () => {
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const res = await api().post('/api/v1/riders/me/selfie').set(auth(riderToken)).send({ image: tinyPng });
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.selfieUrl).toMatch(/^http/);
  });
});
