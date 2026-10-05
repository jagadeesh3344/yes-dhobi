import rateLimit from 'express-rate-limit';
import { env, isTest } from '../config/env.js';

const json = (message: string) => ({ error: { code: 'RATE_LIMITED', message }, message });

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10_000 : env.RATE_LIMIT_PER_MINUTE,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many requests, please slow down'),
});

/**
 * Login / OTP endpoints. Kept low to blunt brute force, but not so low that a
 * team testing from one office IP locks itself out - the real protection
 * against SMS pumping is the per-phone throttle in services/otp.ts (3 codes
 * per number per 10 minutes), which is unaffected by this.
 */
export const authLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: isTest ? 10_000 : env.AUTH_RATE_LIMIT_PER_10MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many attempts. Try again in a few minutes.'),
});
