import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import type { Role } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, parseBody } from '../../lib/http.js';
import { badRequest, conflict, forbidden, HttpError, notFound, unauthorized } from '../../lib/errors.js';
import { normalizePhone, referralCode } from '../../lib/utils.js';
import { requestOtp, verifyOtp } from '../../services/otp.js';
import { issueTokens, revokeAllUserTokens, revokeRefreshToken, rotateRefreshToken } from '../../services/tokens.js';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { getSettings } from '../../services/settings.js';
import { mailer } from '../../services/mailer.js';

export const authRouter = Router();

const phoneSchema = z.string().min(10).max(16);
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters').max(72);

function publicUser(u: { id: string; role: Role; name: string; phone: string | null; email: string | null; avatarUrl: string | null; status: string }) {
  return { id: u.id, role: u.role, name: u.name, phone: u.phone, email: u.email, avatarUrl: u.avatarUrl, status: u.status };
}

// ---------------------------------------------------------------------------
// Customer: phone OTP
// ---------------------------------------------------------------------------

authRouter.post(
  '/customer/request-otp',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { phone } = parseBody(z.object({ phone: phoneSchema }), req.body);
    const normalized = normalizePhone(phone);
    const existing = await prisma.user.findUnique({ where: { phone_role: { phone: normalized, role: 'CUSTOMER' } } });
    const result = await requestOtp(normalized, 'LOGIN');
    res.json({ ...result, isNewUser: !existing });
  }),
);

authRouter.post(
  '/customer/verify-otp',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        phone: phoneSchema,
        otp: z.string().min(4).max(6),
        name: z.string().min(2).max(80).optional(),
        email: z.string().email().optional(),
        referralCode: z.string().optional(),
      }),
      req.body,
    );
    const phone = normalizePhone(body.phone);
    await verifyOtp(phone, body.otp, 'LOGIN');

    let user = await prisma.user.findUnique({ where: { phone_role: { phone, role: 'CUSTOMER' } }, include: { customer: true } });
    let isNewUser = false;
    if (!user) {
      if (!body.name) throw badRequest('Name is required to create your account', { field: 'name' });
      isNewUser = true;
      const referrer = body.referralCode
        ? await prisma.customer.findUnique({ where: { referralCode: body.referralCode.toUpperCase() } })
        : null;
      user = await prisma.user.create({
        data: {
          role: 'CUSTOMER',
          phone,
          name: body.name,
          email: body.email,
          customer: { create: { referralCode: referralCode(body.name), referredById: referrer?.id } },
        },
        include: { customer: true },
      });
      if (referrer) {
        const settings = await getSettings();
        const bonus = settings.referralBonus;
        if (bonus > 0) {
          const updated = await prisma.customer.update({ where: { id: referrer.id }, data: { walletBalance: { increment: bonus } } });
          await prisma.walletTransaction.create({
            data: {
              customerId: referrer.id,
              type: 'REFERRAL_BONUS',
              amount: bonus,
              balanceAfter: updated.walletBalance,
              description: `Referral bonus for inviting ${body.name}`,
            },
          });
        }
      }
    } else if (user.status === 'SUSPENDED') {
      throw forbidden('Your account has been suspended. Contact support.');
    }

    const tokens = await issueTokens(user);
    res.json({ ...tokens, isNewUser, user: publicUser(user), customer: user.customer });
  }),
);

/** "Continue with Google" for customers: exchange a Google ID token. */
authRouter.post(
  '/customer/google',
  authLimiter,
  asyncHandler(async (req, res) => {
    if (!env.GOOGLE_CLIENT_ID) throw new HttpError(501, 'NOT_CONFIGURED', 'Google sign-in is not configured on this server');
    const { idToken } = parseBody(z.object({ idToken: z.string().min(10) }), req.body);
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID }).catch(() => null);
    const payload = ticket?.getPayload();
    if (!payload?.email) throw unauthorized('Invalid Google token');

    let user = await prisma.user.findUnique({ where: { email_role: { email: payload.email, role: 'CUSTOMER' } }, include: { customer: true } });
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const name = payload.name ?? payload.email.split('@')[0]!;
      user = await prisma.user.create({
        data: {
          role: 'CUSTOMER',
          email: payload.email,
          name,
          avatarUrl: payload.picture,
          customer: { create: { referralCode: referralCode(name) } },
        },
        include: { customer: true },
      });
    }
    const tokens = await issueTokens(user);
    res.json({ ...tokens, isNewUser, user: publicUser(user), customer: user.customer });
  }),
);

// ---------------------------------------------------------------------------
// Rider & Vendor: phone + password
// ---------------------------------------------------------------------------

async function passwordLogin(role: Role, phoneInput: string, password: string) {
  const phone = normalizePhone(phoneInput);
  const user = await prisma.user.findUnique({
    where: { phone_role: { phone, role } },
    include: { rider: true, vendor: true },
  });
  if (!user || !user.passwordHash) throw unauthorized('No account found for this mobile number');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw unauthorized('Incorrect password');
  if (user.status === 'SUSPENDED') throw forbidden('Your account has been suspended. Contact support.');
  const tokens = await issueTokens(user);
  return { ...tokens, user: publicUser(user), rider: user.rider ?? undefined, vendor: user.vendor ?? undefined };
}

const loginSchema = z.object({ phone: phoneSchema, password: z.string().min(1) });

authRouter.post(
  '/rider/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { phone, password } = parseBody(loginSchema, req.body);
    res.json(await passwordLogin('RIDER', phone, password));
  }),
);

authRouter.post(
  '/vendor/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { phone, password } = parseBody(loginSchema, req.body);
    res.json(await passwordLogin('VENDOR', phone, password));
  }),
);

/** Rider self-registration (step 1 of the app: personal details + password). */
authRouter.post(
  '/rider/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        fullName: z.string().min(2).max(80),
        mobileNumber: phoneSchema,
        email: z.string().email().optional(),
        password: passwordSchema,
        dateOfBirth: z.coerce.date().optional(),
        zoneId: z.number().int().optional(),
      }),
      req.body,
    );
    const phone = normalizePhone(body.mobileNumber);
    const exists = await prisma.user.findUnique({ where: { phone_role: { phone, role: 'RIDER' } } });
    if (exists) throw conflict('A rider account already exists for this number. Please login.');
    const user = await prisma.user.create({
      data: {
        role: 'RIDER',
        phone,
        email: body.email,
        name: body.fullName,
        passwordHash: await bcrypt.hash(body.password, 10),
        status: 'ACTIVE',
        rider: { create: { dateOfBirth: body.dateOfBirth, zoneId: body.zoneId, onboardingStatus: 'PERSONAL_DETAILS' } },
      },
      include: { rider: true },
    });
    const tokens = await issueTokens(user);
    res.status(201).json({ ...tokens, user: publicUser(user), rider: user.rider });
  }),
);

// Forgot password: OTP to registered mobile, then reset.
authRouter.post(
  '/:role(rider|vendor)/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const role = req.params.role!.toUpperCase() as Role;
    const { phone } = parseBody(z.object({ phone: phoneSchema }), req.body);
    const normalized = normalizePhone(phone);
    const user = await prisma.user.findUnique({ where: { phone_role: { phone: normalized, role } } });
    if (!user) throw notFound('Account');
    const result = await requestOtp(normalized, 'PASSWORD_RESET');
    res.json({ ...result, message: 'Password reset code sent to your registered mobile.' });
  }),
);

authRouter.post(
  '/:role(rider|vendor)/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const role = req.params.role!.toUpperCase() as Role;
    const body = parseBody(z.object({ phone: phoneSchema, otp: z.string().min(4).max(6), newPassword: passwordSchema }), req.body);
    const phone = normalizePhone(body.phone);
    const user = await prisma.user.findUnique({ where: { phone_role: { phone, role } } });
    if (!user) throw notFound('Account');
    await verifyOtp(phone, body.otp, 'PASSWORD_RESET');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
    await revokeAllUserTokens(user.id);
    res.json({ message: 'Password updated. Please login with your new password.' });
  }),
);

// ---------------------------------------------------------------------------
// Admin: email + password
// ---------------------------------------------------------------------------

authRouter.post(
  '/admin/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = parseBody(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const user = await prisma.user.findUnique({ where: { email_role: { email: email.toLowerCase(), role: 'ADMIN' } } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('Invalid email or password');
    if (user.status !== 'ACTIVE') throw forbidden('This admin account is disabled');
    const tokens = await issueTokens(user);
    res.json({ ...tokens, user: publicUser(user) });
  }),
);

/** Admin "Forgot password": a 6-digit code is emailed (console in dev, `devOtp` echoed when OTP_DEV_MODE). */
authRouter.post(
  '/admin/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parseBody(z.object({ email: z.string().email() }), req.body);
    const user = await prisma.user.findUnique({ where: { email_role: { email: email.toLowerCase(), role: 'ADMIN' } } });
    // do not reveal whether the account exists
    if (user) {
      const result = await requestOtp(`email:${email.toLowerCase()}`, 'PASSWORD_RESET');
      await mailer.send(email, 'Yes Dhobi admin password reset', `Your reset code is ${result.devOtp ?? '(sent by SMS provider)'} and expires in ${Math.round(result.expiresInSeconds / 60)} minutes.`);
      res.json({ message: 'If that email belongs to an admin, a reset code has been sent.', ...(result.devOtp ? { devOtp: result.devOtp } : {}) });
      return;
    }
    res.json({ message: 'If that email belongs to an admin, a reset code has been sent.' });
  }),
);

authRouter.post(
  '/admin/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ email: z.string().email(), otp: z.string().min(4).max(6), newPassword: z.string().min(8).max(72) }), req.body);
    const email = body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email_role: { email, role: 'ADMIN' } } });
    if (!user) throw notFound('Account');
    await verifyOtp(`email:${email}`, body.otp, 'PASSWORD_RESET');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
    await revokeAllUserTokens(user.id);
    res.json({ message: 'Password updated. Please sign in again.' });
  }),
);

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = parseBody(z.object({ refreshToken: z.string().min(10) }), req.body);
    res.json(await rotateRefreshToken(refreshToken));
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = parseBody(z.object({ refreshToken: z.string().optional() }), req.body ?? {});
    if (refreshToken) await revokeRefreshToken(refreshToken);
    res.json({ message: 'Logged out' });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        customer: { include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } },
        rider: { include: { zone: true } },
        vendor: { include: { zones: { include: { zone: true } }, services: { include: { serviceCategory: true } } } },
      },
    });
    if (!user) throw notFound('User');
    res.json({ user: publicUser(user), customer: user.customer, rider: user.rider, vendor: user.vendor });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = parseBody(z.object({ currentPassword: z.string(), newPassword: passwordSchema }), req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw unauthorized('Current password is incorrect');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    res.json({ message: 'Password changed' });
  }),
);

authRouter.post(
  '/device-token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { token, platform } = parseBody(z.object({ token: z.string().min(10), platform: z.enum(['android', 'ios', 'web']).default('android') }), req.body);
    await prisma.deviceToken.upsert({
      where: { token },
      update: { userId: req.user!.id, platform },
      create: { token, platform, userId: req.user!.id },
    });
    res.json({ message: 'Device registered' });
  }),
);
