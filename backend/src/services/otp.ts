import dayjs from 'dayjs';
import type { OtpPurpose } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { badRequest, tooMany } from '../lib/errors.js';
import { randomDigits, sha256 } from '../lib/utils.js';
import { sms } from './sms.js';

const OTP_LENGTH = 4; // the customer app renders a 4-digit OTP field
const MAX_ATTEMPTS = 5;
const DEV_OTP = '1234';

export async function requestOtp(phone: string, purpose: OtpPurpose) {
  // throttle: max 3 active codes per 10 minutes per phone/purpose
  const recent = await prisma.otpCode.count({
    where: { phone, purpose, createdAt: { gte: dayjs().subtract(10, 'minute').toDate() } },
  });
  if (recent >= 3) throw tooMany('Too many OTP requests. Please wait a few minutes.');

  // invalidate older codes
  await prisma.otpCode.updateMany({
    where: { phone, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = env.OTP_DEV_MODE ? DEV_OTP : randomDigits(OTP_LENGTH);
  const expiresAt = dayjs().add(env.OTP_TTL_SECONDS, 'second').toDate();
  await prisma.otpCode.create({ data: { phone, purpose, codeHash: sha256(code), expiresAt } });

  // email-keyed codes (admin resets) are delivered by the caller through the mailer
  if (!phone.startsWith('email:')) {
    await sms.send(phone, `${code} is your Yes Dhobi verification code. Valid for ${Math.round(env.OTP_TTL_SECONDS / 60)} minutes.`);
  }

  return {
    phone,
    expiresInSeconds: env.OTP_TTL_SECONDS,
    // Only exposed in dev mode so the apps can be exercised without an SMS gateway.
    ...(env.OTP_DEV_MODE ? { devOtp: code } : {}),
  };
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
