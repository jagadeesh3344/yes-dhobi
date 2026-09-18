import crypto from 'node:crypto';
import { badRequest } from './errors.js';

/** Normalise Indian mobile numbers to E.164 (+91XXXXXXXXXX). Accepts other countries when a + prefix is given. */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) throw badRequest('Invalid phone number');
    return `+${digits}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  throw badRequest('Enter a valid 10-digit mobile number');
}

export function maskPhone(phone: string): string {
  return phone.replace(/(\+\d{2})(\d+)(\d{4})$/, (_m, cc, mid, last) => `${cc} ${'•'.repeat(Math.min(mid.length, 6))} ${last}`);
}

export function maskAccount(acc?: string | null): string | null {
  if (!acc) return null;
  if (acc.includes('@')) return acc; // UPI id
  const last4 = acc.slice(-4);
  return `•••• ${last4}`;
}

export function randomDigits(length: number): string {
  let out = '';
  while (out.length < length) {
    out += crypto.randomInt(0, 10).toString();
  }
  return out;
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0]!)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function referralCode(name: string): string {
  const base = name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
  return `${base}${randomDigits(4)}`;
}

/** Haversine distance in km. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

/** Remove undefined values so Prisma `update` ignores untouched fields. */
export function compact<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

export function toTitle(status: string): string {
  return status
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
