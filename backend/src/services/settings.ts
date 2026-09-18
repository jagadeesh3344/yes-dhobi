import type { PlatformSettings } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

let cache: { value: PlatformSettings; at: number } | null = null;
const TTL_MS = 30_000;

export async function getSettings(force = false): Promise<PlatformSettings> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await prisma.platformSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateSettings() {
  cache = null;
}
