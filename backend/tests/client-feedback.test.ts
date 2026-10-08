/**
 * The customer-side and rider-side changes the client asked for:
 *
 *   customer  search bar over the catalogue
 *             address search / pin drop (endpoints + serviceability)
 *             live rider position on the tracking screen
 *             cancel only until a rider is allocated
 *   rider     "Arrived at location"
 *             order history that includes declined and missed offers
 *             rejection at verification blocks the app for 24 hours
 *             forgot password by email
 *             no re-offer loop between riders who already declined
 *   both      call + chat, with the threads kept apart
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';
process.env.OTP_DEV_MODE = 'true';

let app: Express;
let prisma: typeof import('../src/lib/prisma.js')['prisma'];

const api = () => request(app);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

const RIDERS = [
  { phone: '9876543210', lat: 12.9125, lng: 77.645 }, // nearest to the address below
  { phone: '9876543211', lat: 12.93, lng: 77.66 },
  { phone: '9876543212', lat: 12.95, lng: 77.68 },
];
const VENDOR_PHONE = '9123456789';

const riderTokens: Record<string, string> = {};
const riderIds: Record<string, string> = {};
let vendorToken = '';
let customerToken = '';
let adminToken = '';
let addressId = '';

async function resetRiders() {
  for (const r of RIDERS) {
    await prisma.rider.update({
      where: { id: riderIds[r.phone]! },
      data: { availability: 'ONLINE', currentLat: r.lat, currentLng: r.lng, lastLocationAt: new Date(), zoneId: null, onboardingStatus: 'APPROVED' },
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
  await new Promise((r) => setTimeout(r, 400));
  return res.body.id as string;
}

async function liveOffer(orderId: string) {
  return prisma.pickupRequest.findFirst({
    where: { orderId, status: 'OFFERED' },
    include: { rider: { include: { user: { select: { phone: true } } } } },
  });
}

/** Walk an order up to ASSIGNED by having the nearest rider accept. */
async function acceptWithNearest(orderId: string) {
  const offer = await liveOffer(orderId);
  expect(offer).toBeTruthy();
  const phone = offer!.rider.user.phone!.replace('+91', '');
  const res = await api().post(`/api/v1/riders/me/requests/${offer!.id}/accept`).set(auth(riderTokens[phone]!));
  expect(res.status).toBe(200);
  return { phone, token: riderTokens[phone]!, riderId: offer!.riderId };
}

beforeAll(async () => {
  const { createApp } = await import('../src/app.js');
  ({ prisma } = await import('../src/lib/prisma.js'));
  app = createApp();

  adminToken = (await api().post('/api/v1/auth/admin/login').send({ email: 'admin@yesdhobi.com', password: 'Admin@12345' })).body.accessToken;

  for (const r of RIDERS) {
    const res = await api().post('/api/v1/auth/rider/login').send({ phone: r.phone, password: 'Partner@123' });
    expect(res.status).toBe(200);
    riderTokens[r.phone] = res.body.accessToken;
    riderIds[r.phone] = res.body.rider.id;
  }
  vendorToken = (await api().post('/api/v1/auth/vendor/login').send({ phone: VENDOR_PHONE, password: 'Partner@123' })).body.accessToken;

  const phone = `98${Math.floor(10000000 + Math.random() * 89999999)}`;
  await api().post('/api/v1/auth/customer/request-otp').send({ phone });
  customerToken = (await api().post('/api/v1/auth/customer/verify-otp').send({ phone, otp: '1234', name: 'Feedback Tester' })).body.accessToken;
  const addr = await api()
    .post('/api/v1/customers/me/addresses')
    .set(auth(customerToken))
    .send({ label: 'Home', line1: 'Flat 9, HSR Layout', city: 'Bangalore', pincode: '560102', lat: 12.9121, lng: 77.6446 });
  addressId = addr.body.id;
});

afterAll(async () => {
  await resetRiders().catch(() => undefined);
});

// ---------------------------------------------------------------------------
describe('customer: search bar', () => {
  it('finds services and items from one query', async () => {
    const res = await api().get('/api/v1/catalog/search?q=wash').set(auth(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    // both levels come back so the app can show two sections
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.services.length + res.body.items.length).toBe(res.body.total);
  });

  it('matches an item by its own name, not just the service name', async () => {
    const res = await api().get('/api/v1/catalog/search?q=shirt').set(auth(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((i: { name: string }) => typeof i.name === 'string')).toBe(true);
  });

  it('stays quiet for a single character instead of dumping the catalogue', async () => {
    const res = await api().get('/api/v1/catalog/search?q=a').set(auth(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('customer: address search and pin drop', () => {
  it('reports whether address search is switched on', async () => {
    const res = await api().get('/api/v1/geo/config');
    expect(res.status).toBe(200);
    expect(typeof res.body.searchEnabled).toBe('boolean');
  });

  it('asks for a real query before searching', async () => {
    const res = await api().get('/api/v1/geo/autocomplete?q=h');
    expect(res.status).toBe(400);
  });

  it('answers clearly when the location key is not configured, so the app can fall back', async () => {
    // no AWS_LOCATION_API_KEY in the test env
    const res = await api().get('/api/v1/geo/autocomplete?q=hsr layout');
    expect(res.status).toBe(503);
    expect(res.body.error?.code ?? res.body.code).toBe('PLACES_NOT_CONFIGURED');
  });

  it('tells the customer whether we deliver to the pin they dropped', async () => {
    const res = await api().get('/api/v1/geo/serviceability?lat=12.9121&lng=77.6446&city=Bangalore');
    expect(res.status).toBe(200);
    expect(typeof res.body.serviceable).toBe('boolean');
    if (!res.body.serviceable) expect(res.body.message).toBeTruthy();
  });

  it('refuses coordinates that are not on the planet', async () => {
    expect((await api().get('/api/v1/geo/serviceability?lat=999&lng=77')).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('customer: live tracking and cancellation', () => {
  it('can cancel while no rider is allocated', async () => {
    await resetRiders();
    const orderId = await placeOrder();

    const before = await api().get(`/api/v1/orders/${orderId}`).set(auth(customerToken));
    expect(before.body.canCancel).toBe(true);

    const res = await api().post(`/api/v1/orders/${orderId}/cancel`).set(auth(customerToken)).send({ reason: 'Changed my mind' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    // the status flips straight away, which is what the tracking screen shows
    expect(res.body.canCancel).toBe(false);
  });

  it('hides and refuses cancellation once a rider is allocated', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    await acceptWithNearest(orderId);

    const detail = await api().get(`/api/v1/orders/${orderId}`).set(auth(customerToken));
    expect(detail.body.canCancel).toBe(false);
    expect(detail.body.cancelBlockedReason).toMatch(/rider has been allocated/i);

    // and the API enforces it, not just the button
    const res = await api().post(`/api/v1/orders/${orderId}/cancel`).set(auth(customerToken)).send({});
    expect(res.status).toBe(422);
  });

  it('serves the map a live rider position and an ETA', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const rider = await acceptWithNearest(orderId);

    await api().post('/api/v1/riders/me/location').set(auth(rider.token)).send({ lat: 12.9131, lng: 77.6449, orderId });

    const res = await api().get(`/api/v1/orders/${orderId}/track`).set(auth(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.map.live).toBe(true);
    expect(res.body.map.leg).toBe('PICKUP');
    expect(res.body.map.riderPosition.lat).toBeCloseTo(12.9131, 3);
    expect(res.body.map.customer).toEqual({ lat: 12.9121, lng: 77.6446 });
    expect(res.body.map.etaMinutes).toBeGreaterThan(0);
    // the app should follow the socket rather than poll this
    expect(res.body.map.socket.room).toBe(`order:${orderId}`);
    expect(res.body.canCancel).toBe(false);
  });

  it('cancelling stops the rider search so no rider is sent out', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    expect(await liveOffer(orderId)).toBeTruthy();

    await api().post(`/api/v1/orders/${orderId}/cancel`).set(auth(customerToken)).send({});
    expect(await liveOffer(orderId)).toBeNull();
    const dispatch = await prisma.dispatch.findFirst({ where: { orderId, kind: 'RIDER_PICKUP' } });
    expect(dispatch?.status).toBe('CANCELLED');
  });
});

// ---------------------------------------------------------------------------
describe('order lookup accepts what the apps actually send', () => {
  it('finds the order by id, by order number, and by the bare number', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const detail = await api().get(`/api/v1/orders/${orderId}`).set(auth(customerToken));
    const orderNumber = detail.body.orderNumber as string; // e.g. YD-100945
    expect(orderNumber).toMatch(/^YD-\d+$/);

    const bare = orderNumber.replace('YD-', '');
    // the rider app strips '#' and 'YD-' off the displayed '#YD-100945'
    for (const key of [orderId, orderNumber, `#${orderNumber}`, bare]) {
      const res = await api().get(`/api/v1/orders/${encodeURIComponent(key)}`).set(auth(customerToken));
      expect(res.status, `lookup by "${key}"`).toBe(200);
      expect(res.body.id).toBe(orderId);
    }
  });

  it('lets the rider confirm pickup using the stripped number', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const rider = await acceptWithNearest(orderId);
    const detail = await api().get(`/api/v1/orders/${orderId}`).set(auth(customerToken));
    const bare = (detail.body.orderNumber as string).replace('YD-', '');

    const res = await api()
      .post(`/api/v1/riders/me/orders/${bare}/confirm-pickup`)
      .set(auth(rider.token))
      .send({ otp: detail.body.otps.pickup });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PICKED_UP');
  });
});

// ---------------------------------------------------------------------------
describe('rider: arrived at location', () => {
  it('marks arrival, tells the customer, and records it on the order', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const rider = await acceptWithNearest(orderId);

    const res = await api().post(`/api/v1/riders/me/orders/${orderId}/arrived`).set(auth(rider.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.leg).toBe('PICKUP');
    expect(res.body.arrivedAt).toBeTruthy();

    // visible to the customer, on the order and on the map
    const track = await api().get(`/api/v1/orders/${orderId}/track`).set(auth(customerToken));
    expect(track.body.map.riderArrived).toBe(true);
    expect(track.body.events.some((e: { type: string }) => e.type === 'RIDER_ARRIVED')).toBe(true);
  });

  it('is idempotent, so a double tap does not create a second event', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const rider = await acceptWithNearest(orderId);

    await api().post(`/api/v1/riders/me/orders/${orderId}/arrived`).set(auth(rider.token)).send({});
    const second = await api().post(`/api/v1/riders/me/orders/${orderId}/arrived`).set(auth(rider.token)).send({});
    expect(second.status).toBe(200);
    expect(second.body.alreadyMarked).toBe(true);
    expect(await prisma.orderEvent.count({ where: { orderId, type: 'RIDER_ARRIVED' } })).toBe(1);
  });

  it('cannot be marked by a rider who is not on the order', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const rider = await acceptWithNearest(orderId);
    const other = RIDERS.find((r) => r.phone !== rider.phone)!;

    const res = await api().post(`/api/v1/riders/me/orders/${orderId}/arrived`).set(auth(riderTokens[other.phone]!)).send({});
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('rider: order history', () => {
  it('includes offers the rider declined and ones that timed out', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const offer = await liveOffer(orderId);
    const phone = offer!.rider.user.phone!.replace('+91', '');
    await api().post(`/api/v1/riders/me/requests/${offer!.id}/decline`).set(auth(riderTokens[phone]!));

    const res = await api().get('/api/v1/riders/me/requests/history?status=rejected').set(auth(riderTokens[phone]!));
    expect(res.status).toBe(200);
    const mine = res.body.data.find((r: { id: string }) => r.id === offer!.id);
    expect(mine).toBeTruthy();
    expect(mine.status).toBe('DECLINED');
    // the real order is attached, not a placeholder
    expect(mine.order.id).toBe(orderId);
    expect(mine.order.orderNumber).toBeTruthy();
  });

  it('labels a timed-out offer as Missed', async () => {
    const { sweepDispatches } = await import('../src/services/dispatch.js');
    await resetRiders();
    const orderId = await placeOrder();
    const offer = await liveOffer(orderId);
    const phone = offer!.rider.user.phone!.replace('+91', '');

    await prisma.pickupRequest.update({ where: { id: offer!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await prisma.dispatch.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await sweepDispatches();

    const res = await api().get('/api/v1/riders/me/requests/history?status=expired').set(auth(riderTokens[phone]!));
    const mine = res.body.data.find((r: { id: string }) => r.id === offer!.id);
    expect(mine?.statusLabel).toBe('Missed');
  });
});

// ---------------------------------------------------------------------------
describe('rider: dispatch does not loop between riders who declined', () => {
  it('a restarted search skips everyone who already said no', async () => {
    await resetRiders();
    const orderId = await placeOrder();

    // every rider declines in turn
    const declined: string[] = [];
    for (let i = 0; i < RIDERS.length; i++) {
      const offer = await liveOffer(orderId);
      if (!offer) break;
      const phone = offer.rider.user.phone!.replace('+91', '');
      declined.push(phone);
      await api().post(`/api/v1/riders/me/requests/${offer.id}/decline`).set(auth(riderTokens[phone]!));
    }
    expect(declined.length).toBe(RIDERS.length);
    expect(await liveOffer(orderId)).toBeNull();

    // an automatic restart must not hand it back to the same riders
    const { startRiderDispatch } = await import('../src/services/dispatch.js');
    const found = await startRiderDispatch(orderId, 'PICKUP');
    expect(found).toBe(0);
    expect(await liveOffer(orderId)).toBeNull();
  });

  it('an admin pressing "search again" may still give everyone another go', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const offer = await liveOffer(orderId);
    const phone = offer!.rider.user.phone!.replace('+91', '');
    await api().post(`/api/v1/riders/me/requests/${offer!.id}/decline`).set(auth(riderTokens[phone]!));

    const res = await api().post(`/api/v1/admin/orders/${orderId}/dispatch`).set(auth(adminToken)).send({ leg: 'PICKUP' });
    expect(res.status).toBe(200);
    expect(res.body.ridersNotified).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
describe('rider: hand-off speed (TAT)', () => {
  it('passes a declined offer to the next rider with no sweep in between', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const offer = await liveOffer(orderId);
    const phone = offer!.rider.user.phone!.replace('+91', '');

    const t0 = Date.now();
    const res = await api().post(`/api/v1/riders/me/requests/${offer!.id}/decline`).set(auth(riderTokens[phone]!));
    expect(res.status).toBe(200);

    // the next offer exists by the time the decline call returns - the cascade
    // moves on inside the request, it does not wait for the sweeper
    const next = await liveOffer(orderId);
    expect(next).toBeTruthy();
    expect(next!.riderId).not.toBe(offer!.riderId);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('retires a lapsed offer and moves on without waiting for the next sweep', async () => {
    const { sweepDispatches } = await import('../src/services/dispatch.js');
    await resetRiders();
    const orderId = await placeOrder();
    const offer = await liveOffer(orderId);
    expect(offer).toBeTruthy();

    // bring the deadline forward instead of waiting out the real 15 s
    await prisma.pickupRequest.update({ where: { id: offer!.id }, data: { expiresAt: new Date(Date.now() - 50) } });
    await prisma.dispatch.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { expiresAt: new Date(Date.now() - 50) } });
    await sweepDispatches();

    const expired = await prisma.pickupRequest.findUnique({ where: { id: offer!.id } });
    expect(expired?.status).toBe('EXPIRED');
    const next = await liveOffer(orderId);
    expect(next).toBeTruthy();
    expect(next!.riderId).not.toBe(offer!.riderId);
  });

  it('ignores a rider whose GPS fix is stale, so the offer is not wasted on them', async () => {
    await resetRiders();
    // the nearest rider went online, sent one fix, and closed the app an hour ago
    await prisma.rider.update({
      where: { id: riderIds[RIDERS[0]!.phone]! },
      data: { lastLocationAt: new Date(Date.now() - 60 * 60_000) },
    });

    const orderId = await placeOrder();
    const offer = await liveOffer(orderId);
    expect(offer).toBeTruthy();
    // the second-nearest, whose position we can still trust, is asked first
    expect(offer!.riderId).toBe(riderIds[RIDERS[1]!.phone]);

    // the stale rider is still in the running, just last
    const dispatch = await prisma.dispatch.findFirst({ where: { orderId, kind: 'RIDER_PICKUP' } });
    expect(dispatch!.candidates).toContain(riderIds[RIDERS[0]!.phone]);
    expect(dispatch!.candidates.indexOf(riderIds[RIDERS[0]!.phone]!)).toBeGreaterThan(0);
  });

  it('two sweeps racing on the same offer do not skip a rider', async () => {
    const { sweepDispatches } = await import('../src/services/dispatch.js');
    await resetRiders();
    const orderId = await placeOrder();
    const first = await liveOffer(orderId);
    expect(first).toBeTruthy();

    const dispatchBefore = await prisma.dispatch.findFirst({ where: { orderId, kind: 'RIDER_PICKUP', status: 'ACTIVE' } });
    const cursorBefore = dispatchBefore!.cursor;

    await prisma.pickupRequest.update({ where: { id: first!.id }, data: { expiresAt: new Date(Date.now() - 50) } });
    await prisma.dispatch.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { expiresAt: new Date(Date.now() - 50) } });

    // the offer's own timer and the sweeper can both fire on one lapsed offer;
    // only one of them may move the cursor, or a rider gets skipped entirely
    await Promise.all([sweepDispatches(), sweepDispatches(), sweepDispatches()]);

    const dispatchAfter = await prisma.dispatch.findFirst({ where: { orderId, kind: 'RIDER_PICKUP' } });
    expect(dispatchAfter!.cursor).toBe(cursorBefore + 1);

    const next = await liveOffer(orderId);
    expect(next).toBeTruthy();
    // the very next candidate in the list, not the one after it
    expect(next!.riderId).toBe(dispatchAfter!.candidates[cursorBefore + 1]);
  });
});

// ---------------------------------------------------------------------------
describe('second leg: a delivery rider is found as soon as the order is ready', () => {
  it('starts the search the moment the order reaches READY, without anyone booking', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    const rider = await acceptWithNearest(orderId);

    // walk the order to READY the way a shop does, via the status endpoint -
    // no "book rider" call anywhere in this test
    const detail = await api().get(`/api/v1/orders/${orderId}`).set(auth(customerToken));
    await api().post(`/api/v1/riders/me/orders/${orderId}/confirm-pickup`).set(auth(rider.token)).send({ otp: detail.body.otps.pickup });
    await new Promise((r) => setTimeout(r, 600));
    await api().post(`/api/v1/vendors/me/orders/${orderId}/accept`).set(auth(vendorToken)).send({});
    const vendorView = await api().get(`/api/v1/vendors/me/orders/${orderId}`).set(auth(vendorToken));
    await api().post(`/api/v1/riders/me/orders/${orderId}/confirm-dropoff`).set(auth(rider.token)).send({ otp: vendorView.body.otps.riderDrop });

    for (const status of ['WASHING', 'IRONING', 'QUALITY_CHECK', 'READY']) {
      const res = await api().post(`/api/v1/vendors/me/orders/${orderId}/status`).set(auth(vendorToken)).send({ status });
      expect(res.status, `set ${status}`).toBe(200);
    }

    // a delivery cascade should already be running
    await new Promise((r) => setTimeout(r, 600));
    const dispatch = await prisma.dispatch.findFirst({ where: { orderId, kind: 'RIDER_DELIVERY' } });
    expect(dispatch, 'no delivery search was started').toBeTruthy();
    expect(dispatch!.status).toBe('ACTIVE');

    const offer = await prisma.pickupRequest.findFirst({ where: { orderId, leg: 'DELIVERY', status: 'OFFERED' } });
    expect(offer, 'no rider was offered the delivery').toBeTruthy();
    expect(offer!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('booking a rider does not restart a search that is already running', async () => {
    const order = await prisma.order.findFirst({
      where: { status: 'READY', deliveryRiderId: null },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    expect(order, 'needs the READY order from the previous test').toBeTruthy();

    const before = await prisma.pickupRequest.findFirst({ where: { orderId: order!.id, leg: 'DELIVERY', status: 'OFFERED' } });
    expect(before).toBeTruthy();

    const res = await api().post(`/api/v1/vendors/me/orders/${order!.id}/book-rider`).set(auth(vendorToken)).send({});
    expect(res.status).toBe(200);

    // the same rider still holds the same offer - it was not cancelled and
    // restarted from the top of the list
    const after = await prisma.pickupRequest.findFirst({ where: { orderId: order!.id, leg: 'DELIVERY', status: 'OFFERED' } });
    expect(after!.id).toBe(before!.id);
    expect(after!.riderId).toBe(before!.riderId);
  });
});

// ---------------------------------------------------------------------------
describe('laundry partner is searched for within the minute', () => {
  it('gives each shop a short window so several can be tried inside a minute', async () => {
    await resetRiders();
    const orderId = await placeOrder();
    await acceptWithNearest(orderId);
    await new Promise((r) => setTimeout(r, 700));

    const offer = await prisma.vendorRequest.findFirst({ where: { orderId, status: 'OFFERED' } });
    expect(offer, 'no partner was offered the order').toBeTruthy();

    const windowSeconds = Math.round((offer!.expiresAt.getTime() - offer!.offeredAt.getTime()) / 1000);
    expect(windowSeconds).toBeLessThanOrEqual(30);
    // at least two shops must fit inside the one-minute target
    expect(windowSeconds * 2).toBeLessThanOrEqual(60);
  });
});

// ---------------------------------------------------------------------------
describe('rider: verification verdict', () => {
  it('a rejected rider is locked out with the exact message and a 24 hour wait', async () => {
    const phone = RIDERS[2]!.phone;
    const riderId = riderIds[phone]!;
    const rider = await prisma.rider.findUnique({ where: { id: riderId }, select: { userId: true, onboardingStatus: true } });

    // stand in for the admin rejecting this rider's KYC just now
    const v = await prisma.verification.create({
      data: {
        type: 'RIDER',
        userId: rider!.userId,
        riderId,
        status: 'REJECTED',
        rejectionReason: 'Documents unreadable',
        reviewedAt: new Date(),
      },
    });
    await prisma.rider.update({ where: { id: riderId }, data: { onboardingStatus: 'REJECTED' } });

    const status = await api().get('/api/v1/riders/me/onboarding').set(auth(riderTokens[phone]!));
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('REJECTED');
    expect(status.body.canWork).toBe(false);
    expect(status.body.rejected).toBe(true);
    expect(status.body.message).toBe('Your proposal has been rejected. Please try again after 24 hours.');
    expect(status.body.canReapply).toBe(false);
    expect(status.body.canReapplyAt).toBeTruthy();
    expect(status.body.rejectionReason).toBe('Documents unreadable');

    // and the rider app is genuinely blocked, not just told so
    const online = await api().post('/api/v1/riders/me/availability').set(auth(riderTokens[phone]!)).send({ availability: 'ONLINE' });
    expect(online.status).toBe(403);
    expect(online.body.error?.message ?? online.body.message).toBe('Your proposal has been rejected. Please try again after 24 hours.');

    // once 24 hours have passed they may apply again
    await prisma.verification.update({ where: { id: v.id }, data: { reviewedAt: new Date(Date.now() - 25 * 3600_000) } });
    const later = await api().get('/api/v1/riders/me/onboarding').set(auth(riderTokens[phone]!));
    expect(later.body.canReapply).toBe(true);
    expect(later.body.canReapplyAt).toBeNull();

    // put the rider back for the other tests
    await prisma.verification.delete({ where: { id: v.id } });
    await prisma.rider.update({ where: { id: riderId }, data: { onboardingStatus: 'APPROVED' } });
  });
});

// ---------------------------------------------------------------------------
describe('rider and partner: forgot password by email', () => {
  it('accepts an email address and does not leak whether it exists', async () => {
    const res = await api().post('/api/v1/auth/rider/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.channel).toBe('email');
    expect(res.body.message).toMatch(/if that email is registered/i);
    // the code is never echoed back over HTTP
    expect(res.body.devOtp).toBeUndefined();
    expect(res.body.code).toBeUndefined();
  });

  it('still works by mobile number', async () => {
    // a rider of this test's own, so repeated runs never pile up codes on a
    // seeded number and trip the per-number throttle
    const phone = `94${Math.floor(10000000 + Math.random() * 89999999)}`;
    const reg = await api()
      .post('/api/v1/auth/rider/register')
      .send({ fullName: 'SMS Reset Tester', mobileNumber: phone, password: 'Rider@12345' });
    expect(reg.status).toBe(201);

    const res = await api().post('/api/v1/auth/rider/forgot-password').send({ phone });
    expect(res.status).toBe(200);
    expect(res.body.channel).toBe('sms');
  });

  it('insists on exactly one of email or phone', async () => {
    expect((await api().post('/api/v1/auth/rider/forgot-password').send({})).status).toBe(400);
    expect((await api().post('/api/v1/auth/rider/forgot-password').send({ phone: RIDERS[0]!.phone, email: 'a@b.com' })).status).toBe(400);
  });

  it('resets the password with the emailed code and signs every device out', async () => {
    const email = `rider.reset.${Date.now()}@example.com`;
    const phone = `96${Math.floor(10000000 + Math.random() * 89999999)}`;
    const reg = await api().post('/api/v1/auth/rider/register').send({ fullName: 'Reset Tester', mobileNumber: phone, email, password: 'Rider@12345' });
    expect(reg.status).toBe(201);

    expect((await api().post('/api/v1/auth/rider/forgot-password').send({ email })).status).toBe(200);
    // a JWT `iat` is whole seconds, so the session cutoff can only tell tokens
    // apart across a second boundary - wait one out before resetting
    await new Promise((r) => setTimeout(r, 1100));
    const reset = await api().post('/api/v1/auth/rider/reset-password').send({ email, otp: '1234', newPassword: 'Rider@54321' });
    expect(reset.status).toBe(200);

    // the new password works and the old one does not
    expect((await api().post('/api/v1/auth/rider/login').send({ phone, password: 'Rider@54321' })).status).toBe(200);
    expect((await api().post('/api/v1/auth/rider/login').send({ phone, password: 'Rider@12345' })).status).toBe(401);
    // the access token issued at registration no longer works: the reset moved
    // the account's session cutoff past it, so a stolen session cannot outlive
    // the password it was opened with
    expect((await api().get('/api/v1/riders/me').set(auth(reg.body.accessToken))).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('call and chat between the parties', () => {
  let orderId = '';
  let riderToken = '';

  beforeAll(async () => {
    await resetRiders();
    orderId = await placeOrder();
    riderToken = (await acceptWithNearest(orderId)).token;
    // let the partner cascade start and accept, so all three parties exist
    await new Promise((r) => setTimeout(r, 500));
    await api().post(`/api/v1/vendors/me/orders/${orderId}/accept`).set(auth(vendorToken)).send({});
  });

  it('gives the customer the rider’s real number once a rider is on the way', async () => {
    const res = await api().get(`/api/v1/chat/${orderId}/contacts`).set(auth(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.me).toBe('CUSTOMER');
    const rider = res.body.contacts.find((c: { party: string }) => c.party === 'RIDER');
    expect(rider.callable).toBe(true);
    expect(rider.phone).toMatch(/^\+91\d{10}$/);
  });

  it('gives the rider the customer’s number - they could not call before', async () => {
    const res = await api().get(`/api/v1/chat/${orderId}/contacts`).set(auth(riderToken));
    expect(res.status).toBe(200);
    const customer = res.body.contacts.find((c: { party: string }) => c.party === 'CUSTOMER');
    expect(customer.callable).toBe(true);
    expect(customer.phone).toMatch(/^\+91\d{10}$/);
  });

  it('carries a message from the customer to the rider', async () => {
    const sent = await api().post(`/api/v1/chat/${orderId}/rider`).set(auth(customerToken)).send({ body: 'Gate code is 4521' });
    expect(sent.status).toBe(201);

    const thread = await api().get(`/api/v1/chat/${orderId}/rider`).set(auth(customerToken));
    expect(thread.body.thread).toBe('CUSTOMER_RIDER');
    expect(thread.body.data.at(-1).body).toBe('Gate code is 4521');

    // the rider sees the same message, from the other side
    const riderSide = await api().get(`/api/v1/chat/${orderId}/customer`).set(auth(riderToken));
    const last = riderSide.body.data.at(-1);
    expect(last.body).toBe('Gate code is 4521');
    expect(last.mine).toBe(false);
    expect(last.senderRole).toBe('CUSTOMER');
  });

  it('keeps the rider/partner thread away from the customer', async () => {
    await api().post(`/api/v1/chat/${orderId}/vendor`).set(auth(riderToken)).send({ body: 'Reaching your shop in 10' });

    // the customer may not even name that thread
    const res = await api().get(`/api/v1/chat/${orderId}`).set(auth(customerToken));
    const threads = res.body.threads.map((t: { thread: string }) => t.thread);
    expect(threads).not.toContain('RIDER_VENDOR');
    expect(threads).toContain('CUSTOMER_RIDER');

    const all = JSON.stringify(res.body);
    expect(all).not.toContain('Reaching your shop in 10');
  });

  it('counts unread messages for the badge, and clears them on read', async () => {
    await api().post(`/api/v1/chat/${orderId}/customer`).set(auth(riderToken)).send({ body: 'At your gate' });

    const before = await api().get(`/api/v1/chat/${orderId}/contacts`).set(auth(customerToken));
    expect(before.body.unread.CUSTOMER_RIDER).toBeGreaterThan(0);

    await api().post(`/api/v1/chat/${orderId}/rider/read`).set(auth(customerToken)).send({});
    const after = await api().get(`/api/v1/chat/${orderId}/contacts`).set(auth(customerToken));
    expect(after.body.unread.CUSTOMER_RIDER ?? 0).toBe(0);
  });

  it('refuses an outsider entirely', async () => {
    const phone = `95${Math.floor(10000000 + Math.random() * 89999999)}`;
    await api().post('/api/v1/auth/customer/request-otp').send({ phone });
    const stranger = (await api().post('/api/v1/auth/customer/verify-otp').send({ phone, otp: '1234', name: 'Nosy Parker' })).body.accessToken;

    expect((await api().get(`/api/v1/chat/${orderId}/contacts`).set(auth(stranger))).status).toBe(404);
    expect((await api().get(`/api/v1/chat/${orderId}/rider`).set(auth(stranger))).status).toBe(404);
    expect((await api().post(`/api/v1/chat/${orderId}/rider`).set(auth(stranger)).send({ body: 'hello?' })).status).toBe(404);
  });

  it('rejects an empty message', async () => {
    expect((await api().post(`/api/v1/chat/${orderId}/rider`).set(auth(customerToken)).send({ body: '   ' })).status).toBe(400);
  });

  it('lets an admin read all three threads for support', async () => {
    const res = await api().get(`/api/v1/chat/${orderId}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.me).toBe('ADMIN');
    expect(res.body.threads.map((t: { thread: string }) => t.thread)).toEqual(['CUSTOMER_RIDER', 'CUSTOMER_VENDOR', 'RIDER_VENDOR']);
  });
});
