/**
 * End-to-end: customer places an order -> rider accepts pickup -> OTP handoffs
 * -> vendor processes -> delivery rider -> delivered -> earnings & payouts.
 * Runs against the DATABASE_URL in .env (seeded).  `npm test`
 */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';
process.env.OTP_DEV_MODE = 'true';

let app: Express;
let prisma: typeof import('../src/lib/prisma.js')['prisma'];

const api = () => request(app);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

let adminToken = '';
let customerToken = '';
let vendorToken = '';
let riderToken = '';
let riderId = '';
let vendorId = '';
let orderId = '';
let customerPickupOtp = '';
let customerDeliveryOtp = '';

beforeAll(async () => {
  const { createApp } = await import('../src/app.js');
  ({ prisma } = await import('../src/lib/prisma.js'));
  app = createApp();

  const admin = await api().post('/api/v1/auth/admin/login').send({ email: 'admin@yesdhobi.com', password: 'Admin@12345' });
  expect(admin.status).toBe(200);
  adminToken = admin.body.accessToken;

  const vendor = await api().post('/api/v1/auth/vendor/login').send({ phone: '9123456789', password: 'Partner@123' });
  expect(vendor.status).toBe(200);
  vendorToken = vendor.body.accessToken;
  vendorId = vendor.body.vendor.id;

  const rider = await api().post('/api/v1/auth/rider/login').send({ phone: '9876543210', password: 'Partner@123' });
  expect(rider.status).toBe(200);
  riderToken = rider.body.accessToken;
  riderId = rider.body.rider.id;
  // make sure the rider is free and online for dispatch
  await prisma.rider.update({ where: { id: riderId }, data: { availability: 'ONLINE', currentLat: 12.915, currentLng: 77.64 } });
});

describe('customer auth (phone OTP)', () => {
  const phone = `98${Math.floor(10000000 + Math.random() * 89999999)}`;

  it('requests and verifies an OTP, creating the account', async () => {
    const req = await api().post('/api/v1/auth/customer/request-otp').send({ phone });
    expect(req.status).toBe(200);
    expect(req.body.isNewUser).toBe(true);
    expect(req.body.devOtp).toBe('1234');

    const missingName = await api().post('/api/v1/auth/customer/verify-otp').send({ phone, otp: '1234' });
    expect(missingName.status).toBe(400);

    await api().post('/api/v1/auth/customer/request-otp').send({ phone });
    const ok = await api().post('/api/v1/auth/customer/verify-otp').send({ phone, otp: '1234', name: 'Test Customer', email: `${phone}@example.com` });
    expect(ok.status).toBe(200);
    expect(ok.body.isNewUser).toBe(true);
    expect(ok.body.user.role).toBe('CUSTOMER');
    customerToken = ok.body.accessToken;
  });

  it('rejects a wrong OTP', async () => {
    await api().post('/api/v1/auth/customer/request-otp').send({ phone });
    const bad = await api().post('/api/v1/auth/customer/verify-otp').send({ phone, otp: '0000' });
    expect(bad.status).toBe(400);
  });

  it('adds an address', async () => {
    const res = await api()
      .post('/api/v1/customers/me/addresses')
      .set(auth(customerToken))
      .send({ label: 'Home', line1: 'Flat 4B, Silver Oak Apartments', city: 'Bangalore', pincode: '560102', lat: 12.9121, lng: 77.6446 });
    expect(res.status).toBe(201);
    expect(res.body.isDefault).toBe(true);
  });
});

describe('order lifecycle', () => {
  it('quotes and applies a first-order coupon', async () => {
    const quote = await api()
      .post('/api/v1/orders/quote')
      .set(auth(customerToken))
      .send({ items: [{ code: 'wi_1', quantity: 2 }, { code: 'wf_5', quantity: 1 }], promoCode: 'FIRSTORDER' });
    expect(quote.status).toBe(200);
    expect(quote.body.subtotal).toBe(200);
    expect(quote.body.discount).toBe(40);
    expect(quote.body.promo.code).toBe('FIRSTORDER');
    expect(quote.body.deliveryFee).toBe(0); // above free-pickup threshold
  });

  it('places the order, auto-selects a vendor and dispatches a pickup offer', async () => {
    const addr = (await api().get('/api/v1/customers/me/addresses').set(auth(customerToken))).body.data[0];
    const res = await api()
      .post('/api/v1/orders')
      .set(auth(customerToken))
      .send({
        items: [{ code: 'wi_1', quantity: 2 }, { code: 'wf_5', quantity: 1 }],
        addressId: addr.id,
        pickupDate: new Date(Date.now() + 86400_000).toISOString(),
        pickupSlot: '6-8 PM',
        promoCode: 'FIRSTORDER',
        paymentMethod: 'COD',
        notes: 'Gentle detergent please',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_PICKUP');
    expect(res.body.orderNumber).toMatch(/^YD-\d+$/);
    expect(res.body.pricing.total).toBe(160);
    expect(res.body.vendor.id).toBe(vendorId); // nearest active vendor to HSR Layout
    expect(res.body.otps.pickup).toMatch(/^\d{4}$/);
    orderId = res.body.id;
    customerPickupOtp = res.body.otps.pickup;
    customerDeliveryOtp = res.body.otps.delivery;

    // dispatch runs after the response; give it a tick
    await new Promise((r) => setTimeout(r, 300));
    const offers = await api().get('/api/v1/riders/me/requests').set(auth(riderToken));
    expect(offers.status).toBe(200);
    expect(offers.body.data.some((o: { orderId: string }) => o.orderId === orderId)).toBe(true);
  });

  it('vendor sees it as a new request and accepts', async () => {
    const list = await api().get('/api/v1/vendors/me/orders?tab=new').set(auth(vendorToken));
    expect(list.body.data.some((o: { id: string }) => o.id === orderId)).toBe(true);
    const accept = await api().post(`/api/v1/vendors/me/orders/${orderId}/accept`).set(auth(vendorToken));
    expect(accept.status).toBe(200);
    expect(accept.body.isAccepted).toBe(true);
  });

  it('rider accepts the pickup offer -> ASSIGNED', async () => {
    const offers = await api().get('/api/v1/riders/me/requests').set(auth(riderToken));
    const offer = offers.body.data.find((o: { orderId: string }) => o.orderId === orderId);
    const res = await api().post(`/api/v1/riders/me/requests/${offer.requestId}/accept`).set(auth(riderToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ASSIGNED');
    expect(res.body.pickupRider.id).toBe(riderId);
  });

  it('rider confirms pickup with the customer OTP -> PICKED_UP', async () => {
    const bad = await api().post(`/api/v1/riders/me/orders/${orderId}/confirm-pickup`).set(auth(riderToken)).send({ otp: '0000' });
    expect(bad.status).toBe(400);
    const res = await api().post(`/api/v1/riders/me/orders/${orderId}/confirm-pickup`).set(auth(riderToken)).send({ otp: customerPickupOtp });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PICKED_UP');
  });

  it('rider drops at the vendor with the vendor OTP -> IN_LAUNDRY and earns the pickup payout', async () => {
    const vendorView = await api().get(`/api/v1/vendors/me/orders/${orderId}`).set(auth(vendorToken));
    const res = await api().post(`/api/v1/riders/me/orders/${orderId}/confirm-dropoff`).set(auth(riderToken)).send({ otp: vendorView.body.otps.riderDrop });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_LAUNDRY');
    const earnings = await api().get('/api/v1/riders/me/earnings').set(auth(riderToken));
    expect(earnings.body.today.amount).toBeGreaterThan(0);
  });

  it('vendor moves through washing -> ready and books a delivery rider', async () => {
    for (const status of ['WASHING', 'IRONING', 'QUALITY_CHECK']) {
      const r = await api().post(`/api/v1/vendors/me/orders/${orderId}/status`).set(auth(vendorToken)).send({ status });
      expect(r.status).toBe(200);
      expect(r.body.status).toBe(status);
    }
    const book = await api().post(`/api/v1/vendors/me/orders/${orderId}/book-rider`).set(auth(vendorToken));
    expect(book.status).toBe(200);
    expect(book.body.status).toBe('READY');
    expect(book.body.ridersNotified).toBeGreaterThan(0);
  });

  it('rider accepts delivery, collects with handover OTP, delivers with customer OTP', async () => {
    const offers = await api().get('/api/v1/riders/me/requests').set(auth(riderToken));
    const offer = offers.body.data.find((o: { orderId: string; leg: string }) => o.orderId === orderId && o.leg === 'DELIVERY');
    expect(offer).toBeTruthy();
    const accept = await api().post(`/api/v1/riders/me/requests/${offer.requestId}/accept`).set(auth(riderToken));
    expect(accept.status).toBe(200);
    expect(accept.body.deliveryRider.id).toBe(riderId);

    const vendorView = await api().get(`/api/v1/vendors/me/orders/${orderId}`).set(auth(vendorToken));
    expect(vendorView.body.isRiderBooked).toBe(true);
    const out = await api().post(`/api/v1/riders/me/orders/${orderId}/confirm-handover`).set(auth(riderToken)).send({ otp: vendorView.body.otps.riderHandover });
    expect(out.body.status).toBe('OUT_FOR_DELIVERY');

    const delivered = await api().post(`/api/v1/riders/me/orders/${orderId}/confirm-delivery`).set(auth(riderToken)).send({ otp: customerDeliveryOtp, collectedCash: true });
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe('DELIVERED');
    expect(delivered.body.paymentStatus).toBe('PAID'); // COD collected
  });

  it('customer tracking shows all steps done and can rate', async () => {
    const track = await api().get(`/api/v1/orders/${orderId}/track`).set(auth(customerToken));
    expect(track.body.tracking.every((s: { state: string }) => s.state === 'done')).toBe(true);
    const rate = await api().post(`/api/v1/orders/${orderId}/rate`).set(auth(customerToken)).send({ rating: 5, comment: 'Crisp!' });
    expect(rate.status).toBe(200);
    expect(rate.body.rating).toBe(5);
  });

  it('vendor earned commission-adjusted revenue and can request a payout that admin processes', async () => {
    const earnings = await api().get('/api/v1/vendors/me/earnings').set(auth(vendorToken));
    expect(earnings.body.today.amount).toBeGreaterThan(0);
    expect(earnings.body.outstanding).toBeGreaterThan(0);

    const payoutReq = await api().post('/api/v1/vendors/me/payouts').set(auth(vendorToken)).send({});
    expect(payoutReq.status).toBe(201);
    expect(payoutReq.body.status).toBe('PENDING');

    const processed = await api().post(`/api/v1/admin/payouts/${payoutReq.body.id}/process`).set(auth(adminToken)).send({ reference: 'UTR123' });
    expect(processed.status).toBe(200);
    expect(processed.body.payoutStatus).toBe('PROCESSED');

    const after = await api().get('/api/v1/vendors/me/earnings').set(auth(vendorToken));
    expect(after.body.outstanding).toBe(0);
  });

  it('admin sees the order in the panel shape and dashboard KPIs', async () => {
    const o = await api().get(`/api/v1/admin/orders/${orderId}`).set(auth(adminToken));
    expect(o.status).toBe(200);
    expect(o.body.customerName).toBe('Test Customer');
    expect(o.body.partnerName).toBe('Star Bright Laundry');
    expect(o.body.riderName).toBe('Rahul Yadav');
    expect(o.body.statusLabel).toBe('Delivered');

    const dash = await api().get('/api/v1/admin/dashboard').set(auth(adminToken));
    expect(dash.status).toBe(200);
    expect(dash.body.kpis.ordersToday.value).toBeGreaterThan(0);

    const rev = await api().get('/api/v1/admin/analytics/revenue?range=7d').set(auth(adminToken));
    expect(rev.body.totals.grossRevenue).toBeGreaterThan(0);
  });

  it('enforces the state machine and role boundaries', async () => {
    const forbidden = await api().get('/api/v1/admin/orders').set(auth(customerToken));
    expect(forbidden.status).toBe(403);
    const cancel = await api().post(`/api/v1/orders/${orderId}/cancel`).set(auth(customerToken)).send({});
    expect(cancel.status).toBe(422); // already delivered
    const noAuth = await api().get('/api/v1/orders');
    expect(noAuth.status).toBe(401);
  });
});

describe('vendor web registration contract (POST /api/v1/vendors)', () => {
  it('accepts the exact payload produced by frontends/web vendorApi.ts', async () => {
    const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`; // 10-digit Indian mobile
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const payload = {
      personalDetails: { fullName: 'John Doe', mobileNumber: `+91${phone}`, whatsappNumber: phone, emailAddress: `${phone}@vendor.test`, dateOfBirth: '1990-01-01T00:00:00.000Z', gender: 'Male', personalPincode: '110024', personalCity: 'New Delhi', personalState: 'Delhi', currentAddress: '123 Main Street', aadhaarNumber: '123456781234', profilePhotoUrl: tinyPng },
      businessDetails: { shopName: 'Super Clean Laundry', isExistingFranchise: false, franchiseName: '', businessType: 'Proprietorship', yearsOfExperience: 5, numberOfWorkers: 4, hasOwnShop: true, shopAreaSqft: 250.5, numberOfWashingMachines: 3, dailyCapacityKg: 100, gstNumber: '22AAAAA0000A1Z5', panNumber: 'ABCDE1234F', standardDeliveryTime: '48 Hours', offersExpressDelivery: true, expressDeliveryChargePercentage: 15 },
      location: { shopAddress: 'Shop 12, Market Complex', landmark: 'Near Metro Station', pincode: '110024', city: 'New Delhi', state: 'Delhi', latitude: 28.5678, longitude: 77.2435, serviceRadiusKm: 5, workingHoursFrom: '08:00:00', workingHoursTo: '19:00:00' },
      documents: { aadhaarFrontUrl: tinyPng, aadhaarBackUrl: tinyPng, panFrontUrl: tinyPng, shopPhotoUrl: tinyPng, gstCertificateUrl: 'https://example.com/gst.jpg', tradeLicenseUrl: null, labourLicenseUrl: null },
      bankDetails: { bankAccountHolderName: 'John Doe', bankName: 'HDFC Bank', bankAccountNumber: '50100234567890', bankIfscCode: 'HDFC0001234', bankAccountType: 'Current', cancelledChequePassbookUrl: tinyPng },
      services: [{ serviceId: 1, price: 40, isEnabled: true }, { serviceId: 5, price: 150, isEnabled: true }],
      equipments: [{ equipmentId: 1, quantity: 3 }, { equipmentId: 3, quantity: 1 }],
      serviceAreas: [1, 2],
      workingDays: [1, 2, 3, 4, 5, 6],
      agreedToPartnerTerms: true,
      agreedToPaymentTerms: true,
      consentedToBackgroundVerification: true,
    };
    const res = await api().post('/api/v1/vendors').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.registrationId).toBeTruthy();
    expect(res.body.status).toBe('PENDING_VERIFICATION');

    const v = await prisma.vendor.findUnique({ where: { id: res.body.vendorId }, include: { zones: true, services: true, equipments: true, verifications: true } });
    expect(v?.zones.map((z) => z.zoneId).sort()).toEqual([1, 2]);
    expect(v?.services).toHaveLength(2);
    expect(v?.equipments).toHaveLength(2);
    expect(v?.verifications[0]?.status).toBe('PENDING_REVIEW');
    const docs = v?.documents as Record<string, string>;
    expect(docs.aadhaarFront).toMatch(/^http/);
    expect(docs.gstCertificate).toBe('https://example.com/gst.jpg');

    // the new vendor cannot accept orders until admin approves KYC
    const login = await api().post('/api/v1/auth/vendor/forgot-password').send({ phone });
    expect(login.status).toBe(200);

    const pending = await api().get('/api/v1/admin/verifications?status=PENDING_REVIEW').set(auth(adminToken));
    const mine = pending.body.data.find((x: { vendorId: string }) => x.vendorId === res.body.vendorId);
    expect(mine.type).toBe('Vendor');
    const approve = await api().post(`/api/v1/admin/verifications/${mine.id}/approve`).set(auth(adminToken));
    expect(approve.body.verificationStatus).toBe('APPROVED');
    expect((await prisma.vendor.findUnique({ where: { id: res.body.vendorId } }))?.status).toBe('ACTIVE');
  });

  it('rejects duplicate phone and missing terms', async () => {
    const dup = await api().post('/api/v1/vendors').send({
      personalDetails: { fullName: 'Rajesh Kumar', mobileNumber: '+919123456789' },
      businessDetails: { shopName: 'Dup' },
      location: { shopAddress: 'Shop 1, Market Road', city: 'Bangalore' },
      agreedToPartnerTerms: true,
      agreedToPaymentTerms: true,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toMatch(/already exists/);
  });
});

describe('rider self-registration', () => {
  it('registers, completes vehicle + documents and lands in the admin KYC queue', async () => {
    const phone = `97${Math.floor(10000000 + Math.random() * 89999999)}`;
    const reg = await api().post('/api/v1/auth/rider/register').send({ fullName: 'New Rider', mobileNumber: phone, password: 'secret123', zoneId: 12 });
    expect(reg.status).toBe(201);
    const t = reg.body.accessToken;
    const veh = await api().put('/api/v1/riders/me/vehicle').set(auth(t)).send({ vehicleType: 'Scooter', vehicleNumber: 'ka01ab1234', drivingLicenseNumber: 'KA0120200012345' });
    expect(veh.body.onboardingStatus).toBe('VEHICLE_DETAILS');
    expect(veh.body.vehicleType).toBe('SCOOTER');
    const docs = await api().put('/api/v1/riders/me/documents').set(auth(t)).send({ aadhaarNumber: '123412341234', panNumber: 'ABCDE1234F', bankAccountNumber: '1234567890', ifscCode: 'SBIN0004012' });
    expect(docs.body.onboardingStatus).toBe('UNDER_REVIEW');
    const online = await api().post('/api/v1/riders/me/availability').set(auth(t)).send({ availability: 'ONLINE' });
    expect(online.status).toBe(403); // not approved yet
  });
});
