import jwt, { type SignOptions } from 'jsonwebtoken';
import dayjs from 'dayjs';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { randomToken, sha256 } from '../lib/utils.js';
import { unauthorized } from '../lib/errors.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}

function ttlToDate(ttl: string): Date {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return dayjs().add(30, 'day').toDate();
  const n = Number(m[1]);
  const unit = { s: 'second', m: 'minute', h: 'hour', d: 'day' }[m[2] as 's' | 'm' | 'h' | 'd'] as dayjs.ManipulateType;
  return dayjs().add(n, unit).toDate();
}

export async function issueTokens(user: { id: string; role: Role; name: string }) {
  const accessToken = signAccessToken({ sub: user.id, role: user.role, name: user.name });
  const refreshToken = randomToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: sha256(refreshToken), expiresAt: ttlToDate(env.JWT_REFRESH_TTL) },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: env.JWT_ACCESS_TTL };
}

export async function rotateRefreshToken(refreshToken: string) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { user: true },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date()) throw unauthorized('Refresh token is invalid');
  if (record.user.status === 'SUSPENDED') throw unauthorized('Account suspended');
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return issueTokens(record.user);
}

export async function revokeRefreshToken(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserTokens(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
