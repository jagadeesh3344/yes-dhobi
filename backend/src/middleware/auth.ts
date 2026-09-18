import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../services/tokens.js';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  /** profile id for the role: customerId / riderId / vendorId */
  customerId?: string;
  riderId?: string;
  vendorId?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  if (typeof req.query.access_token === 'string') return req.query.access_token;
  return null;
}

/** Resolve the user (if a token is present) without rejecting anonymous requests. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = await loadAuthUser(token);
  } catch {
    // ignore invalid tokens for optional auth
  }
  next();
};

export async function loadAuthUser(token: string): Promise<AuthUser> {
  const payload = verifyAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      role: true,
      name: true,
      status: true,
      customer: { select: { id: true } },
      rider: { select: { id: true } },
      vendor: { select: { id: true } },
    },
  });
  if (!user) throw unauthorized('Account no longer exists');
  if (user.status === 'SUSPENDED') throw forbidden('Your account has been suspended. Contact support.');
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    customerId: user.customer?.id,
    riderId: user.rider?.id,
    vendorId: user.vendor?.id,
  };
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized();
    req.user = await loadAuthUser(token);
    next();
  } catch (err) {
    next(err);
  }
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden(`This endpoint requires role: ${roles.join(' or ')}`));
    next();
  };

export const requireAdmin: RequestHandler[] = [requireAuth, requireRole('ADMIN')];
export const requireCustomer: RequestHandler[] = [requireAuth, requireRole('CUSTOMER')];
export const requireRider: RequestHandler[] = [requireAuth, requireRole('RIDER')];
export const requireVendor: RequestHandler[] = [requireAuth, requireRole('VENDOR')];
