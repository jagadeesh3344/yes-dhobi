import dayjs from 'dayjs';
import type { OtpPurpose } from '@prisma/client';
import { env, isTest } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { badRequest, HttpError, tooMany } from '../lib/errors.js';
import { randomDigits, sha256 } from '../lib/utils.js';
import { sms } from './sms.js';
import { sendWhatsAppOtp, whatsappConfigured } from './whatsapp.js';

const OTP_LENGTH = 4; // the customer app renders a 4-digit OTP field
const MAX_ATTEMPTS = 5;
const DEV_OTP = '1234';
/**
 * Codes per 10 minutes per number and purpose. Effectively off under test for
 * the same reason the HTTP auth limiter is: the suite re-uses seeded phone
 * numbers, so a second run inside ten minutes would otherwise fail on the
 * throttle rather than on anything real.
 */
const MAX_CODES_PER_WINDOW = isTest ? 10_000 : 3;

export async function requestOtp(phone: string, purpose: OtpPurpose) {
  // throttle: max 3 active codes per 10 minutes per phone/purpose
  const recent = await prisma.otpCode.count({
    where: { phone, purpose, createdAt: { gte: dayjs().subtract(10, 'minute').toDate() } },
  });
  if (recent >= MAX_CODES_PER_WINDOW) throw tooMany('Too many OTP requests. Please wait a few minutes.');

  // invalidate older codes
  await prisma.otpCode.updateMany({
    where: { phone, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = env.OTP_DEV_MODE ? DEV_OTP : randomDigits(OTP_LENGTH);
  const expiresAt = dayjs().add(env.OTP_TTL_SECONDS, 'second').toDate();
  await prisma.otpCode.create({ data: { phone, purpose, codeHash: sha256(code), expiresAt } });

  // email-keyed codes (admin resets) are delivered by the caller through the mailer
  let channel: 'sms' | 'whatsapp' | 'none' = 'none';
  if (!phone.startsWith('email:')) {
    const minutes = String(Math.round(env.OTP_TTL_SECONDS / 60));
    const text = `${code} is your Yes Dhobi verification code. Valid for ${minutes} minutes.`;
    const wantsWhatsApp = env.OTP_CHANNEL === 'whatsapp' || env.OTP_CHANNEL === 'whatsapp_then_sms';

    if (wantsWhatsApp && whatsappConfigured()) {
      const sent = await sendWhatsAppOtp(phone, code);
      if (sent.ok) channel = 'whatsapp';
      else if (env.OTP_CHANNEL === 'whatsapp') throw new HttpError(502, 'OTP_SEND_FAILED', 'Could not send the WhatsApp code. Please try again.');
    }

    if (channel === 'none') {
      // sms, or the WhatsApp attempt failed and we are allowed to fall back
      await sms.send(phone, text, { templateId: env.SMS_OTP_TEMPLATE_ID ?? env.MSG91_OTP_TEMPLATE_ID, vars: { otp: code, minutes } });
      channel = 'sms';
    }
  }

  return {
    phone,
    channel,
    expiresInSeconds: env.OTP_TTL_SECONDS,
    // Only exposed in dev mode so the apps can be exercised without a gateway.
    ...(env.OTP_DEV_MODE ? { devOtp: code } : {}),
  };
}

/**
 * A reset code for an email address. Codes are keyed `email:<address>` so they
 * share the same store and throttling as phone codes, but nothing is sent here
 * - the plain code is handed back so the caller can put it in an email. It is
 * deliberately never part of an HTTP response.
 */
export async function requestEmailOtp(email: string, purpose: OtpPurpose): Promise<{ code: string; expiresInSeconds: number }> {
  const key = `email:${email.toLowerCase()}`;
  const recent = await prisma.otpCode.count({
    where: { phone: key, purpose, createdAt: { gte: dayjs().subtract(10, 'minute').toDate() } },
  });
  if (recent >= MAX_CODES_PER_WINDOW) throw tooMany('Too many reset requests. Please wait a few minutes.');

  await prisma.otpCode.updateMany({ where: { phone: key, purpose, consumedAt: null }, data: { consumedAt: new Date() } });

  const code = env.OTP_DEV_MODE ? DEV_OTP : randomDigits(OTP_LENGTH);
  const expiresAt = dayjs().add(env.OTP_TTL_SECONDS, 'second').toDate();
  await prisma.otpCode.create({ data: { phone: key, purpose, codeHash: sha256(code), expiresAt } });
  return { code, expiresInSeconds: env.OTP_TTL_SECONDS };
}

export async function verifyOtp(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
  const record = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw badRequest('No OTP requested for this number. Please request a new code.');
  if (record.expiresAt < new Date()) throw badRequest('OTP has expired. Please request a new code.');
  if (record.attempts >= MAX_ATTEMPTS) throw badRequest('Too many incorrect attempts. Please request a new code.');

  if (record.codeHash !== sha256(code)) {
    await prisma.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw badRequest('Incorrect OTP');
  }
  await prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
}
