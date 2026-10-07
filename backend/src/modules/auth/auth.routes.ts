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
import { requestEmailOtp, requestOtp, verifyOtp } from '../../services/otp.js';
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
    let user = await prisma.user.findUnique({ where: { phone_role: { phone, role: 'CUSTOMER' } }, include: { customer: true } });
    // ask for the name *before* consuming the OTP so the app can prompt and resubmit the same code
    const name = body.name;
    if (!user && !name) throw badRequest('No account found with this number. Please register or create a new account to continue.', { field: 'name', isNewUser: true });
    await verifyOtp(phone, body.otp, 'LOGIN');

    let isNewUser = false;
    if (!user) {
      if (!name) throw badRequest('No account found with this number. Please register or create a new account to continue.', { field: 'name' });
      isNewUser = true;
      const referrer = body.referralCode
        ? await prisma.customer.findUnique({ where: { referralCode: body.referralCode.toUpperCase() } })
        : null;
      user = await prisma.user.create({
        data: {
          role: 'CUSTOMER',
          phone,
          name,
          email: body.email,
          customer: { create: { referralCode: referralCode(name), referredById: referrer?.id } },
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
              description: `Referral bonus for inviting ${name}`,
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

/** "Continue with Google" for customers: exchange a Google ID token or direct profile. */
authRouter.post(
  '/customer/google',
  authLimiter,
  asyncHandler(async (req, res) => {
    let email: string | undefined;
    let name: string | undefined;
    let picture: string | undefined;

    if (req.body.idToken && env.GOOGLE_CLIENT_ID) {
      const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({ idToken: req.body.idToken, audience: env.GOOGLE_CLIENT_ID }).catch(() => null);
      const payload = ticket?.getPayload();
      if (payload?.email) {
        email = payload.email;
        name = payload.name;
        picture = payload.picture;
      }
    }

    if (!email && req.body.email) {
      email = String(req.body.email).toLowerCase();
      name = req.body.name ? String(req.body.name) : undefined;
      picture = req.body.avatarUrl ? String(req.body.avatarUrl) : undefined;
    }

    if (!email) {
      if (!env.GOOGLE_CLIENT_ID) throw new HttpError(501, 'NOT_CONFIGURED', 'Google sign-in is not configured on this server');
      throw unauthorized('Invalid Google credentials');
    }

    let user = await prisma.user.findUnique({ where: { email_role: { email, role: 'CUSTOMER' } }, include: { customer: true } });
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const userName = name ?? email.split('@')[0]!;
      user = await prisma.user.create({
        data: {
          role: 'CUSTOMER',
          email,
          name: userName,
          avatarUrl: picture,
          customer: { create: { referralCode: referralCode(userName) } },
        },
        include: { customer: true },
      });
    }
    const tokens = await issueTokens(user);
    res.json({ ...tokens, isNewUser, user: publicUser(user), customer: user.customer });
  }),
);

/** Social / One-Tap Authentication for Customers (Google / Apple / Email) */
authRouter.post(
  '/customer/social',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        provider: z.enum(['GOOGLE', 'APPLE', 'GMAIL']).default('GOOGLE'),
        email: z.string().email(),
        name: z.string().min(1).default('Customer'),
        phone: z.string().optional(),
        avatarUrl: z.string().optional(),
      }),
      req.body,
    );

    const email = body.email.toLowerCase();
    const phone = body.phone ? normalizePhone(body.phone) : null;

    let user = await prisma.user.findUnique({
      where: { email_role: { email, role: 'CUSTOMER' } },
      include: { customer: true },
    });

    if (!user && phone) {
      user = await prisma.user.findUnique({
        where: { phone_role: { phone, role: 'CUSTOMER' } },
        include: { customer: true },
      });
    }

    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const userName = body.name.trim();
      user = await prisma.user.create({
        data: {
          role: 'CUSTOMER',
          email,
          phone,
          name: userName,
          avatarUrl: body.avatarUrl,
          customer: { create: { referralCode: referralCode(userName) } },
        },
        include: { customer: true },
      });
    } else {
      const updateData: { phone?: string; email?: string } = {};
      if (!user.phone && phone) updateData.phone = phone;
      if (!user.email && email) updateData.email = email;
      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData,
          include: { customer: true },
        });
      }
    }

    if (user.status === 'SUSPENDED') {
      throw forbidden('Your account has been suspended. Contact support.');
    }

    const tokens = await issueTokens(user);
    res.json({ ...tokens, isNewUser, user: publicUser(user), customer: user.customer });
  }),
);

// ---------------------------------------------------------------------------
// Rider & Vendor: phone + password
// ---------------------------------------------------------------------------

/** Partner Registration IDs look like VD100001. */
const REGISTRATION_ID = /^VD\d{4,}$/i;

/**
 * Password sign-in for riders and partners. Partners may identify themselves
 * with either their mobile number or the Registration ID issued at onboarding.
 *
 * A partner's credentials only work once an admin has approved the application:
 * that is the whole point of handing them out at submission time. Riders can
 * still sign in while under review, because their app has to show them the
 * review/rejection screen; what they cannot do is go online or take orders
 * (see `assertApproved` in the rider routes).
 */
async function passwordLogin(role: Role, identifier: string, password: string) {
  const asRegistrationId = role === 'VENDOR' && REGISTRATION_ID.test(identifier.trim());
  const user = asRegistrationId
    ? (
        await prisma.vendor.findUnique({
          where: { registrationId: identifier.trim().toUpperCase() },
          select: { user: { include: { rider: true, vendor: true } } },
        })
      )?.user ?? null
    : await prisma.user.findUnique({
        where: { phone_role: { phone: normalizePhone(identifier), role } },
        include: { rider: true, vendor: true },
      });

  const notFoundMessage = asRegistrationId ? 'No account found for this Registration ID' : 'No account found for this mobile number';
  if (!user || !user.passwordHash) throw unauthorized(notFoundMessage);
  if (!(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('Incorrect password. Please verify and try again.');
  if (user.status === 'SUSPENDED') throw forbidden('Your account has been suspended. Contact support.');

  if (role === 'VENDOR' && user.vendor) {
    const v = user.vendor;
    if (v.status === 'PENDING_VERIFICATION') {
      throw forbidden(
        `Your application (${v.registrationId ?? 'pending'}) is still being verified. You can sign in once our team approves it.`,
      );
    }
    if (v.status === 'REJECTED') throw forbidden('Your partner application was not approved. Please contact support.');
    if (v.status === 'SUSPENDED') throw forbidden('Your shop has been suspended. Contact support.');
  }

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

/** Partners sign in with their Registration ID (VD100001) or their mobile number. */
const vendorLoginSchema = z
  .object({
    registrationId: z.string().trim().min(3).max(32).optional(),
    phone: z.string().trim().min(3).max(20).optional(),
    password: z.string().min(1),
  })
  .refine((v) => Boolean(v.registrationId) !== Boolean(v.phone), {
    message: 'Provide either your Registration ID or your mobile number',
  });

authRouter.post(
  '/vendor/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(vendorLoginSchema, req.body);
    res.json(await passwordLogin('VENDOR', body.registrationId ?? body.phone!, body.password));
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

/**
 * Forgot password for riders and partners. The code goes to whichever channel
 * they identified themselves with: `phone` -> SMS/WhatsApp, `email` -> email.
 * Exactly one of the two is required.
 *
 * Email replies are deliberately vague about whether the account exists; the
 * phone path keeps its 404 because the apps show "no account for this number"
 * on the login screen.
 */
const forgotSchema = z
  .object({ phone: phoneSchema.optional(), email: z.string().email().optional() })
  .refine((v) => Boolean(v.phone) !== Boolean(v.email), { message: 'Provide either a mobile number or an email address' });

authRouter.post(
  '/:role(rider|vendor)/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const role = req.params.role!.toUpperCase() as Role;
    const body = parseBody(forgotSchema, req.body);

    if (body.email) {
      const email = body.email.toLowerCase();
      const user = await prisma.user.findUnique({ where: { email_role: { email, role } } });
      if (user) {
        const { code, expiresInSeconds } = await requestEmailOtp(email, 'PASSWORD_RESET');
        const minutes = Math.round(expiresInSeconds / 60);
        await mailer.send(
          email,
          'Reset your Yes Dhobi password',
          `Hi ${user.name},\n\nYour password reset code is ${code}. It expires in ${minutes} minutes.\n\nIf you did not ask for this, you can ignore this email.\n\n- Yes Dhobi`,
        );
      }
      res.json({
        channel: 'email',
        message: 'If that email is registered, a reset code is on its way.',
        expiresInSeconds: env.OTP_TTL_SECONDS,
      });
      return;
    }

    const normalized = normalizePhone(body.phone!);
    const user = await prisma.user.findUnique({ where: { phone_role: { phone: normalized, role } } });
    if (!user) throw notFound('Account');
    const result = await requestOtp(normalized, 'PASSWORD_RESET');
    res.json({ ...result, message: 'Password reset code sent to your registered mobile.' });
  }),
);

const resetSchema = z
  .object({
    phone: phoneSchema.optional(),
    email: z.string().email().optional(),
    otp: z.string().min(4).max(6),
    newPassword: passwordSchema,
  })
  .refine((v) => Boolean(v.phone) !== Boolean(v.email), { message: 'Provide either a mobile number or an email address' });

authRouter.post(
  '/:role(rider|vendor)/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const role = req.params.role!.toUpperCase() as Role;
    const body = parseBody(resetSchema, req.body);

    const { user, otpKey } = body.email
      ? await (async () => {
          const email = body.email!.toLowerCase();
          return { user: await prisma.user.findUnique({ where: { email_role: { email, role } } }), otpKey: `email:${email}` };
        })()
      : await (async () => {
          const phone = normalizePhone(body.phone!);
          return { user: await prisma.user.findUnique({ where: { phone_role: { phone, role } } }), otpKey: phone };
        })();

    if (!user) throw notFound('Account');
    await verifyOtp(otpKey, body.otp, 'PASSWORD_RESET');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
    // every device is signed out, so a stolen session cannot outlive the reset
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
      const { code, expiresInSeconds } = await requestEmailOtp(email, 'PASSWORD_RESET');
      await mailer.send(
        email,
        'Yes Dhobi admin password reset',
        `Your reset code is ${code} and expires in ${Math.round(expiresInSeconds / 60)} minutes.`,
      );
      res.json({ message: 'If that email belongs to an admin, a reset code has been sent.', ...(env.OTP_DEV_MODE ? { devOtp: code } : {}) });
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
