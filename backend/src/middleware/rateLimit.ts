import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env.js';

const json = (message: string) => ({ error: { code: 'RATE_LIMITED', message }, message });

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10_000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many requests, please slow down'),
});

/** Tight limit for OTP / login endpoints to blunt brute force & SMS pumping. */
export const authLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: isTest ? 10_000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many attempts. Try again in a few minutes.'),
});
