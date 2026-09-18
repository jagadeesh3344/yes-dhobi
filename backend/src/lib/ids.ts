import type { Tx } from './prisma.js';
import { prisma } from './prisma.js';

/**
 * Human friendly sequential identifiers, e.g. YD-100245, PAY-10023, TKT-1001.
 * Uses a Postgres sequence per prefix so numbers are gap-free under concurrency.
 */
const SEQUENCES: Record<string, { seq: string; start: number }> = {
  YD: { seq: 'order_number_seq', start: 100001 },
  PAY: { seq: 'payout_number_seq', start: 10001 },
  TKT: { seq: 'ticket_number_seq', start: 1001 },
};

let ensured = false;
export async function ensureSequences(client: Tx | typeof prisma = prisma) {
  if (ensured) return;
  for (const { seq, start } of Object.values(SEQUENCES)) {
    await client.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS ${seq} START WITH ${start}`);
  }
  ensured = true;
}

export async function nextId(prefix: keyof typeof SEQUENCES, client: Tx | typeof prisma = prisma): Promise<string> {
  await ensureSequences(client);
  const { seq } = SEQUENCES[prefix]!;
  const rows = await client.$queryRawUnsafe<{ nextval: bigint }[]>(`SELECT nextval('${seq}')`);
  return `${prefix}-${rows[0]!.nextval.toString()}`;
}
