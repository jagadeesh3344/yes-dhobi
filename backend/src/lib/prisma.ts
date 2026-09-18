import { Prisma, PrismaClient } from '@prisma/client';
import { isProd } from '../config/env.js';

// Serialise Decimal columns as plain JSON numbers so every client
// (Flutter, React) receives `amount: 240` instead of `amount: "240"`.
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function toJSON(
  this: Prisma.Decimal,
) {
  return this.toNumber();
};

export const prisma = new PrismaClient({
  log: isProd ? ['error'] : ['warn', 'error'],
});

export type Tx = Prisma.TransactionClient;
export { Prisma };
