import type { PartyType } from '@prisma/client';
import type { Tx } from '../lib/prisma.js';
import { prisma } from '../lib/prisma.js';

/** Record an earning for a vendor or rider (positive amount). */
export async function addEarning(
  tx: Tx,
  party: { type: PartyType; id: string },
  orderId: string,
  amount: number,
  description: string,
) {
  if (amount <= 0) return;
  await tx.ledgerEntry.create({
    data: {
      partyType: party.type,
      vendorId: party.type === 'VENDOR' ? party.id : undefined,
      riderId: party.type === 'RIDER' ? party.id : undefined,
      orderId,
      kind: 'ORDER_EARNING',
      amount,
      description,
    },
  });
}

export async function partyBalance(party: { type: PartyType; id: string }, client: Tx | typeof prisma = prisma) {
  const where = party.type === 'VENDOR' ? { vendorId: party.id } : { riderId: party.id };
  const [earned, paid, pending] = await Promise.all([
    client.ledgerEntry.aggregate({ where: { ...where, kind: 'ORDER_EARNING' }, _sum: { amount: true } }),
    client.ledgerEntry.aggregate({ where: { ...where, kind: 'PAYOUT' }, _sum: { amount: true } }),
    client.payout.aggregate({
      where: { ...(party.type === 'VENDOR' ? { vendorId: party.id } : { riderId: party.id }), status: 'PENDING' },
      _sum: { amount: true },
    }),
  ]);
  const totalEarned = Number(earned._sum.amount ?? 0);
  const totalPaid = -Number(paid._sum.amount ?? 0);
  const pendingPayout = Number(pending._sum.amount ?? 0);
  return {
    totalEarned,
    totalPaid,
    pendingPayout,
    /** withdrawable now */
    outstanding: Math.max(0, totalEarned - totalPaid - pendingPayout),
  };
}

export async function earningsSummary(party: { type: PartyType; id: string }) {
  const where = party.type === 'VENDOR' ? { vendorId: party.id } : { riderId: party.id };
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7)); // Monday
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const sum = async (gte: Date) =>
    Number(
      (
        await prisma.ledgerEntry.aggregate({
          where: { ...where, kind: 'ORDER_EARNING', createdAt: { gte } },
          _sum: { amount: true },
        })
      )._sum.amount ?? 0,
    );
  const count = async (gte: Date) =>
    prisma.ledgerEntry.count({ where: { ...where, kind: 'ORDER_EARNING', createdAt: { gte } } });

  const [today, week, month, todayCount, weekCount, monthCount] = await Promise.all([
    sum(startOfDay),
    sum(startOfWeek),
    sum(startOfMonth),
    count(startOfDay),
    count(startOfWeek),
    count(startOfMonth),
  ]);
  return {
    today: { amount: today, orders: todayCount },
    week: { amount: week, orders: weekCount },
    month: { amount: month, orders: monthCount },
  };
}
