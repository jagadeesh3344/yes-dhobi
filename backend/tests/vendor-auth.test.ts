/**
 * Partner onboarding -> credentials -> admin approval -> login.
 *
 * What the client asked for:
 *   - submitting the onboarding form issues a Registration ID (VD100001) and a
 *     temporary password, both shown once on the confirmation screen
 *   - only the hash is stored
 *   - neither works until an admin approves the application
 *   - a rejected application leaves the login dead
 *   - the login API checks id, password and approval status
 *
 * It also pins shut an auth bypass that used to live in `passwordLogin`: any
 * account still on the seeded password `Partner@123` could be signed into with
 * *any* password, which then silently became that account's new password.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';
process.env.OTP_DEV_MODE = 'true';

let app: Express;
let prisma: typeof import('../src/lib/prisma.js')['prisma'];

const api = () => request(app);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let adminToken = '';

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** The payload the vendor website actually sends. */
function registrationPayload(phone: string, shopName: string, opts: { password?: string } = {}) {
  return {
    personalDetails: {
      fullName: 'Onboarding Tester',
      mobileNumber: `+91${phone}`,
      emailAddress: `${phone}@vendor.test`,
      personalCity: 'New Delhi',
      personalState: 'Delhi',
      currentAddress: '123 Main Street',
      profilePhotoUrl: tinyPng,
    },
    businessDetails: {
      shopName,
      isExistingFranchise: false,
      businessType: 'Proprietorship',
      dailyCapacityKg: 100,
      panNumber: 'ABCDE1234F',
      standardDeliveryTime: '48 Hours',
    },
    location: {
      shopAddress: 'Shop 12, Market Complex',
      pincode: '110024',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.5678,
      longitude: 77.2435,
    },
    documents: { aadhaarFrontUrl: tinyPng, aadhaarBackUrl: tinyPng, panFrontUrl: tinyPng, shopPhotoUrl: tinyPng },
    bankDetails: {
      bankAccountHolderName: 'Onboarding Tester',
      bankName: 'HDFC Bank',
      bankAccountNumber: '50100234567890',
      bankIfscCode: 'HDFC0001234',
      bankAccountType: 'Current',
    },
    services: [{ serviceId: 1, price: 40, isEnabled: true }],
    equipments: [{ equipmentId: 1, quantity: 2 }],
    serviceAreas: [1],
    workingDays: [1, 2, 3, 4, 5],
    agreedToPartnerTerms: true,
    agreedToPaymentTerms: true,
    consentedToBackgroundVerification: true,
    ...(opts.password ? { password: opts.password } : {}),
  };
}

const newPhone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

async function register(shopName: string, opts: { password?: string } = {}) {
  const phone = newPhone();
  const res = await api().post('/api/v1/vendors').send(registrationPayload(phone, shopName, opts));
  expect(res.status).toBe(201);
  return { phone, body: res.body as Record<string, string> };
}

/** Approve the partner's KYC the way an admin would, through the panel. */
async function approve(vendorId: string) {
  const pending = await api().get('/api/v1/admin/verifications?status=PENDING_REVIEW&limit=100').set(auth(adminToken));
  const row = pending.body.data.find((x: { vendorId: string }) => x.vendorId === vendorId);
  expect(row).toBeTruthy();
  const res = await api().post(`/api/v1/admin/verifications/${row.id}/approve`).set(auth(adminToken)).send({});
  expect(res.status).toBe(200);
}

async function reject(vendorId: string, reason = 'Documents unreadable') {
  const pending = await api().get('/api/v1/admin/verifications?status=PENDING_REVIEW&limit=100').set(auth(adminToken));
  const row = pending.body.data.find((x: { vendorId: string }) => x.vendorId === vendorId);
  expect(row).toBeTruthy();
  const res = await api().post(`/api/v1/admin/verifications/${row.id}/reject`).set(auth(adminToken)).send({ reason });
  expect(res.status).toBe(200);
}

beforeAll(async () => {
  const { createApp } = await import('../src/app.js');
  ({ prisma } = await import('../src/lib/prisma.js'));
  app = createApp();
  adminToken = (await api().post('/api/v1/auth/admin/login').send({ email: 'admin@yesdhobi.com', password: 'Admin@12345' })).body.accessToken;
});

describe('onboarding issues credentials', () => {
  it('returns a Registration ID and a temporary password to show the partner', async () => {
    const { body } = await register('Credential Laundry');
    expect(body.registrationId).toMatch(/^VD\d{4,}$/);
    expect(body.temporaryPassword).toBeTruthy();
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    expect(body.status).toBe('PENDING_VERIFICATION');
    expect(body.credentialsActive).toBe(false);
    // the confirmation message repeats the id, since this screen is the only
    // place the partner sees it
    expect(body.message).toContain(body.registrationId);
  });

  it('stores only a hash of that password, never the password itself', async () => {
    const { body } = await register('Hashing Laundry');
    const vendor = await prisma.vendor.findUnique({ where: { registrationId: body.registrationId }, include: { user: true } });
    const hash = vendor!.user.passwordHash!;
    expect(hash).not.toBe(body.temporaryPassword);
    expect(hash.startsWith('$2')).toBe(true); // bcrypt
    expect(await bcrypt.compare(body.temporaryPassword, hash)).toBe(true);
  });

  it('gives every partner a different Registration ID', async () => {
    const a = await register('Unique One');
    const b = await register('Unique Two');
    expect(a.body.registrationId).not.toBe(b.body.registrationId);
  });

  it('does not hand back a password when the partner chose their own', async () => {
    const { body } = await register('Own Password Laundry', { password: 'MyOwnPass@123' });
    expect(body.registrationId).toMatch(/^VD\d{4,}$/);
    expect(body.temporaryPassword).toBeUndefined();
  });
});

describe('credentials stay dead until an admin approves', () => {
  it('refuses the Registration ID while the application is under review', async () => {
    const { body } = await register('Pending Laundry');
    const res = await api().post('/api/v1/auth/vendor/login').send({ registrationId: body.registrationId, password: body.temporaryPassword });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/still being verified/i);
  });

  it('refuses the mobile number too, not just the Registration ID', async () => {
    const { phone, body } = await register('Pending By Phone');
    const res = await api().post('/api/v1/auth/vendor/login').send({ phone, password: body.temporaryPassword });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/still being verified/i);
  });

  it('lets the partner in with the Registration ID once approved', async () => {
    const { body } = await register('Approved Laundry');
    await approve(body.vendorId);

    const res = await api().post('/api/v1/auth/vendor/login').send({ registrationId: body.registrationId, password: body.temporaryPassword });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.vendor.status).toBe('ACTIVE');
    expect(res.body.vendor.registrationId).toBe(body.registrationId);

    // and the token actually works against the partner app
    const me = await api().get('/api/v1/vendors/me').set(auth(res.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.registrationId).toBe(body.registrationId);
  });

  it('accepts the Registration ID in lower case, as typed on a phone', async () => {
    const { body } = await register('Lowercase Laundry');
    await approve(body.vendorId);
    const res = await api()
      .post('/api/v1/auth/vendor/login')
      .send({ registrationId: body.registrationId.toLowerCase(), password: body.temporaryPassword });
    expect(res.status).toBe(200);
  });

  it('keeps a rejected application locked out', async () => {
    const { phone, body } = await register('Rejected Laundry');
    await reject(body.vendorId);

    const byId = await api().post('/api/v1/auth/vendor/login').send({ registrationId: body.registrationId, password: body.temporaryPassword });
    expect(byId.status).toBe(403);
    expect(byId.body.message).toMatch(/not approved/i);

    const byPhone = await api().post('/api/v1/auth/vendor/login').send({ phone, password: body.temporaryPassword });
    expect(byPhone.status).toBe(403);
  });

  it('checks the password as well as the approval status', async () => {
    const { body } = await register('Wrong Password Laundry');
    await approve(body.vendorId);
    const res = await api().post('/api/v1/auth/vendor/login').send({ registrationId: body.registrationId, password: 'not-the-password' });
    expect(res.status).toBe(401);
  });

  it('reports an unknown Registration ID clearly', async () => {
    const res = await api().post('/api/v1/auth/vendor/login').send({ registrationId: 'VD999999', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/registration id/i);
  });

  it('wants one identifier, not both and not neither', async () => {
    expect((await api().post('/api/v1/auth/vendor/login').send({ password: 'x' })).status).toBe(400);
    expect((await api().post('/api/v1/auth/vendor/login').send({ registrationId: 'VD100001', phone: '9876543210', password: 'x' })).status).toBe(400);
  });
});

describe('the Partner@123 login bypass is gone', () => {
  it('will not sign a seeded partner in with an arbitrary password', async () => {
    // the seeded partners are all on Partner@123; the old fallback accepted any
    // password for them and then overwrote the stored hash with it
    const before = await prisma.user.findFirst({ where: { role: 'VENDOR', phone: '+919123456789' }, select: { id: true, passwordHash: true } });

    const res = await api().post('/api/v1/auth/vendor/login').send({ phone: '9123456789', password: 'anything-i-like' });
    expect(res.status).toBe(401);

    // the stored password must be untouched
    const after = await prisma.user.findUnique({ where: { id: before!.id }, select: { passwordHash: true } });
    expect(after!.passwordHash).toBe(before!.passwordHash);
    // and the real password still works
    expect((await api().post('/api/v1/auth/vendor/login').send({ phone: '9123456789', password: 'Partner@123' })).status).toBe(200);
  });

  it('will not sign a seeded rider in with an arbitrary password either', async () => {
    const res = await api().post('/api/v1/auth/rider/login').send({ phone: '9876543210', password: 'anything-i-like' });
    expect(res.status).toBe(401);
    expect((await api().post('/api/v1/auth/rider/login').send({ phone: '9876543210', password: 'Partner@123' })).status).toBe(200);
  });
});

describe('the admin panel can see the Registration ID', () => {
  it('lists it on the vendor row, so support can match a caller to a shop', async () => {
    const { body } = await register('Panel Visible Laundry');
    const list = await api().get('/api/v1/admin/vendors?search=Panel Visible&limit=50').set(auth(adminToken));
    expect(list.status).toBe(200);
    const row = list.body.data.find((v: { id: string }) => v.id === body.vendorId);
    expect(row?.registrationId).toBe(body.registrationId);
  });

  it('gives partners created directly by an admin an id too', async () => {
    const phone = newPhone();
    const res = await api()
      .post('/api/v1/admin/vendors')
      .set(auth(adminToken))
      .send({
        name: 'Admin Made Laundry',
        owner: 'Admin Made',
        phone,
        location: 'Shop 1, Some Street',
        city: 'Bangalore',
        password: 'AdminMade@123',
        // left under review on purpose: an ACTIVE shop here would join the
        // partner ranking and outscore the seeded Bangalore shop that the
        // dispatch tests expect to win
        activate: false,
      });
    expect(res.status).toBe(201);
    expect(res.body.registrationId ?? res.body.vendor?.registrationId).toMatch(/^VD\d{4,}$/);
  });
});
