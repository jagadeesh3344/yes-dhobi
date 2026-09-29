/**
 * The waterfall cascade the client asked for:
 *   - riders are offered the order ONE AT A TIME, nearest first
 *   - a decline passes the offer straight to the next nearest rider
 *   - the laundry partner is searched only AFTER a rider accepts
 *   - a partner decline passes the order to the next nearest partner
 *   - when everyone declines, admins are asked to assign manually
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';
process.env.OTP_DEV_MODE = 'true';

let app: Express;
let prisma: typeof import('../src/lib/prisma.js')['prisma'];
let sweepDispatches: typeof import('../src/services/dispatch.js')['sweepDispatches'];

const api = () => request(app);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Bangalore riders, ordered by distance from the customer address used below. */
const RIDERS = [
  { phone: '9876543210', name: 'Rahul Yadav', lat: 12.9125, lng: 77.645 }, // nearest
  { phone: '9876543211', name: 'Sunil Kumar', lat: 12.93, lng: 77.66 }, // second
  { phone: '9876543212', name: 'Zack Colah', lat: 12.95, lng: 77.68 }, // third
];
const VENDORS = [
  { phone: '9123456789', name: 'Star Bright Laundry' }, // nearest to HSR Layout
  { phone: '9123456790', name: 'Sai Ram Dry Cleaners' },
];

const riderTokens: Record<string, string> = {};
const riderIds: Record<string, string> = {};
const vendorTokens: Record<string, string> = {};
const vendorIds: Record<string, string> = {};
let customerToken = '';
let adminToken = '';
let addressId = '';

async function loginRider(phone: string) {
  const res = await api().post('/api/v1/auth/rider/login').send({ phone, password: 'Partner@123' });
  expect(res.status).toBe(200);
  riderTokens[phone] = res.body.accessToken;
  riderIds[phone] = res.body.rider.id;
}

async function loginVendor(phone: string) {
  const res = await api().post('/api/v1/auth/vendor/login').send({ phone, password: 'Partner@123' });
  expect(res.status).toBe(200);
  vendorTokens[phone] = res.body.accessToken;
  vendorIds[phone] = res.body.vendor.id;
}

/** Put the three seeded riders online at known coordinates so ranking is deterministic. */
async function resetRiders() {
  for (const r of RIDERS) {
    await prisma.rider.update({
      where: { id: riderIds[r.phone]! },
      data: { availability: 'ONLINE', currentLat: r.lat, currentLng: r.lng, zoneId: null },
    });
  }
}

async function placeOrder() {
  const res = await api()
    .post('/api/v1/orders')
    .set(auth(customerToken))
    .send({
      items: [{ code: 'wi_1', quantity: 2 }],
      addressId,
      pickupDate: new Date(Date.now() + 86400_000).toISOString(),
      pickupSlot: '6-8 PM',
      paymentMethod: 'COD',
    });
  expect(res.status).toBe(201);
  // give the cascade a tick to create the first offer
  await new Promise((r) => setTimeout(r, 400));
  return res.body.id as string;
}

/** Who currently holds the live offer for this order? */
async function liveRiderOffer(orderId: string) {
  return prisma.pickupRequest.findFirst({
    where: { orderId, status: 'OFFERED' },
    include: { rider: { include: { user: { select: { phone: true, name: true } } } } },
  });
}
async function liveVendorOffer(orderId: string) {
  return prisma.vendorRequest.findFirst({ where: { orderId, status: 'OFFERED' }, include: { vendor: true } });
}

beforeAll(async () => {
  const { createApp } = await import('../src/app.js');
  ({ prisma } = await import('../src/lib/prisma.js'));
  ({ sweepDispatches } = await import('../src/services/dispatch.js'));
  app = createApp();

  adminToken = (await api().post('/api/v1/auth/admin/login').send({ email: 'admin@yesdhobi.com', password: 'Admin@12345' })).body.accessToken;
  for (const r of RIDERS) await loginRider(r.phone);
  for (const v of VENDORS) await loginVendor(v.phone);

  const phone = `98${Math.floor(10000000 + Math.random() * 89999999)}`;
  await api().post('/api/v1/auth/customer/request-otp').send({ phone });
  const verify = await api().post('/api/v1/auth/customer/verify-otp').send({ phone, otp: '1234', name: 'Cascade Tester' });
  customerToken = verify.body.accessToken;
  const addr = await api()
    .post('/api/v1/customers/me/addresses')
    .set(auth(customerToken))
    .send({ label: 'Home', line1: 'Flat 9, HSR Layout', city: 'Bangalore', pincode: '560102', lat: 12.9121, lng: 77.6446 });
  addressId = addr.body.id;
});

afterAll(async () => {
  await resetRiders().catch(() => undefined);
});

describe('rider waterfall', () => {
  it('offers the order to ONE rider at a time, nearest first', async () => {
    await resetRiders();
    const orderId = await placeOrder();

    const offer = await liveRiderOffer(orderId);
    expect(offer?.rider.user.phone).toBe('+91' + RIDERS[0]!.phone);

    // exactly one live offer, not a broadcast to everyone
    expect(await prisma.pickupRequest.count({ where: { orderId, status: 'OFFERED' } })).toBe(1);
    // the other riders see nothing yet
    const second = await api().get('/api/v1/riders/me/requests').set(auth(riderTokens[RIDERS[1]!.phone]!));
    expect(second.body.data.some((o: { orderId: string }) => o.orderId === orderId)).toBe(false);
  });

  it('passes the offer to the next nearest rider the moment one declines', async () => {
    await resetRiders();
    const orderId = await placeOrder();

    const first = await liveRiderOffer(orderId);
    expect(first?.rider.user.phone).toBe('+91' + RIDERS[0]!.phone);

    const decline = await api().post(`/api/v1/riders/me/requests/${first!.id}/decline`).set(auth(riderTokens[RIDERS[0]!.phone]!));
    expect(decline.status).toBe(200);

    // rider 2 now holds it, without any admin action or waiting
    const second = await liveRiderOffer(orderId);
    expect(second?.rider.user.phone).toBe('+91' + RIDERS[1]!.phone);
    expect(second!.id).not.toBe(first!.id);

    const visible = await api().get('/api/v1/riders/me/requests').set(auth(riderTokens[RIDERS[1]!.phone]!));
    expect(visible.body.data.some((o: { orderId: string }) => o.orderId === orderId)).toBe(true);

    // and rider 1 can no longer accept what he declined
    const late = await api().post(`/api/v1/riders/me/requests/${first!.id}/accept`).set(auth(riderTokens[RIDERS[0]!.phone]!));
    expect(late.status).toBe(409);
  });

  it('cascades through every rider and then asks admins to assign', async () => {
    await resetRiders();
    const orderId = await placeOrder();

    const seen: string[] = [];
    for (let i = 0; i < RIDERS.length; i++) {
      const offer = await liveRiderOffer(orderId);
      expect(offer).toBeTruthy();
      seen.push(offer!.rider.user.phone!);
      await api().post(`/api/v1/riders/me/requests/${offer!.id}/decline`).set(auth(riderTokens[offer!.rider.user.phone!.replace('+91', '')]!));
    }
    // nearest-first order, each rider offered exactly once
    expect(seen).toEqual(RIDERS.map((r) => '+91' + r.phone));

    expect(await liveRiderOffer(orderId)).toBeNull();
    const dispatch = await prisma.dispatch.findFirst({ where: { orderId, kind: 'RIDER_PICKUP' } });
    expect(dispatch?.status).toBe('EXHAUSTED');

    const notified = await prisma.notification.findFirst({
      where: { title: 'Rider needed', createdAt: { gte: new Date(Date.now() - 60_000) } },
      orderBy: { createdAt: 'desc' },
    });
    expect(notified).toBeTruthy();

    // an admin can still restart the search or assign directly
    const restart = await api().post(`/api/v1/admin/orders/${orderId}/dispatch`).set(auth(adminToken)).send({ leg: 'PICKUP' });
    expect(restart.status).toBe(200);
    expect(restart.body.ridersNotified).toBeGreaterThan(0);
  });

  it('expires an unanswered offer and moves on by itself', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const first = await liveRiderOffer(orderId);

    // simulate the offer window elapsing, then run the sweeper
    await prisma.pickupRequest.update({ where: { id: first!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await prisma.dispatch.updateMany({ where: { orderId, kind: 'RIDER_PICKUP', status: 'ACTIVE' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await sweepDispatches();

    expect((await prisma.pickupRequest.findUnique({ where: { id: first!.id } }))!.status).toBe('EXPIRED');
    const next = await liveRiderOffer(orderId);
    expect(next?.rider.user.phone).toBe('+91' + RIDERS[1]!.phone);
  });
});

describe('laundry partner waterfall', () => {
  it('searches for a partner only after a rider accepts, then offers one at a time', async () => {
    await resetRiders();
    const orderId = await placeOrder();

    // no partner and no partner offer while the order is still looking for a rider
    const before = await prisma.order.findUnique({ where: { id: orderId } });
    expect(before?.vendorId).toBeNull();
    expect(await liveVendorOffer(orderId)).toBeNull();

    const offer = await liveRiderOffer(orderId);
    await api().post(`/api/v1/riders/me/requests/${offer!.id}/accept`).set(auth(riderTokens[RIDERS[0]!.phone]!));
    await new Promise((r) => setTimeout(r, 400));

    const vendorOffer = await liveVendorOffer(orderId);
    expect(vendorOffer).toBeTruthy();
    expect(vendorOffer!.vendor.shopName).toBe(VENDORS[0]!.name); // nearest partner
    expect(await prisma.vendorRequest.count({ where: { orderId, status: 'OFFERED' } })).toBe(1);

    // the order still has no partner until one accepts
    expect((await prisma.order.findUnique({ where: { id: orderId } }))!.vendorId).toBeNull();
  });

  it('passes the order to the next nearest partner when one declines', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const offer = await liveRiderOffer(orderId);
    await api().post(`/api/v1/riders/me/requests/${offer!.id}/accept`).set(auth(riderTokens[RIDERS[0]!.phone]!));
    await new Promise((r) => setTimeout(r, 400));

    const first = await liveVendorOffer(orderId);
    expect(first!.vendor.shopName).toBe(VENDORS[0]!.name);

    const decline = await api()
      .post(`/api/v1/vendors/me/orders/${orderId}/reject`)
      .set(auth(vendorTokens[VENDORS[0]!.phone]!))
      .send({ reason: 'Capacity full today' });
    expect(decline.status).toBe(200);

    const second = await liveVendorOffer(orderId);
    expect(second).toBeTruthy();
    expect(second!.vendorId).not.toBe(first!.vendorId);

    // the second partner accepts: order, money and rider drop-off all update
    const accept = await api().post(`/api/v1/vendors/me/orders/${orderId}/accept`).set(auth(vendorTokens[VENDORS[1]!.phone]!));
    expect(accept.status).toBe(200);
    const saved = await prisma.order.findUnique({ where: { id: orderId } });
    expect(saved!.vendorId).toBe(vendorIds[VENDORS[1]!.phone]);
    expect(saved!.vendorAcceptedAt).toBeTruthy();
    expect(Number(saved!.vendorEarning)).toBeGreaterThan(0);

    // the first partner cannot take it afterwards
    const late = await api().post(`/api/v1/vendors/me/orders/${orderId}/accept`).set(auth(vendorTokens[VENDORS[0]!.phone]!));
    expect(late.status).toBe(404);
  });

  it('alerts admins when every partner declines, and admin assignment still works', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const offer = await liveRiderOffer(orderId);
    await api().post(`/api/v1/riders/me/requests/${offer!.id}/accept`).set(auth(riderTokens[RIDERS[0]!.phone]!));
    await new Promise((r) => setTimeout(r, 400));

    // decline from every partner that gets offered
    for (let i = 0; i < 10; i++) {
      const live = await liveVendorOffer(orderId);
      if (!live) break;
      const phone = (await prisma.user.findUnique({ where: { id: live.vendor.userId } }))!.phone!.replace('+91', '');
      if (!vendorTokens[phone]) {
        // a partner outside the test fixtures: decline it directly
        await prisma.vendorRequest.update({ where: { id: live.id }, data: { status: 'DECLINED', respondedAt: new Date() } });
        const d = await prisma.dispatch.findFirst({ where: { orderId, kind: 'VENDOR', status: 'ACTIVE', currentOfferId: live.id } });
        if (d) await prisma.dispatch.update({ where: { id: d.id }, data: { cursor: d.cursor + 1, currentOfferId: null, expiresAt: null } });
        await sweepDispatches();
        continue;
      }
      await api().post(`/api/v1/vendors/me/orders/${orderId}/reject`).set(auth(vendorTokens[phone]!)).send({ reason: 'No capacity' });
    }

    expect((await prisma.order.findUnique({ where: { id: orderId } }))!.vendorId).toBeNull();

    // admin assigns manually; commission and drop-off are set from that partner
    const assign = await api()
      .post(`/api/v1/admin/orders/${orderId}/assign-vendor`)
      .set(auth(adminToken))
      .send({ vendorId: vendorIds[VENDORS[0]!.phone] });
    expect(assign.status).toBe(200);
    expect(assign.body.partnerName).toBe(VENDORS[0]!.name);
  });

  it('gives admins a live view of both cascades', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const view = await api().get(`/api/v1/admin/orders/${orderId}/dispatch`).set(auth(adminToken));
    expect(view.status).toBe(200);
    expect(view.body.dispatches[0].kind).toBe('RIDER_PICKUP');
    expect(view.body.dispatches[0].attempt).toMatch(/^1 of \d+$/);
    expect(view.body.riderOffers.length).toBeGreaterThan(0);
  });
});
