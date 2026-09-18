import type { PartyType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { nextId } from '../../lib/ids.js';
import { maskAccount } from '../../lib/utils.js';
import { partyBalance } from '../../services/ledger.js';
import { notifyAdmins, notifyUser } from '../../services/notifications.js';

const MIN_PAYOUT = 100;

/** Vendor/rider requests a withdrawal of (part of) their outstanding balance. */
export async function requestPayout(party: { type: PartyType; id: string }, amount?: number) {
  const balance = await partyBalance(party);
  const requested = amount ?? balance.outstanding;
  if (requested < MIN_PAYOUT) throw unprocessable(`Minimum payout is ₹${MIN_PAYOUT}. Outstanding: ₹${balance.outstanding}`);
  if (requested > balance.outstanding) throw unprocessable(`Requested ₹${requested} exceeds outstanding ₹${balance.outstanding}`);

  const [account, name, userId] =
    party.type === 'VENDOR'
      ? await prisma.vendor.findUnique({ where: { id: party.id }, include: { user: true } }).then((v) => [v?.bankAccountNumber, v?.shopName, v?.userId] as const)
      : await prisma.rider.findUnique({ where: { id: party.id }, include: { user: true } }).then((r) => [r?.upiId ?? r?.bankAccountNumber, r?.user.name, r?.userId] as const);

  const payout = await prisma.payout.create({
    data: {
      payoutNumber: await nextId('PAY'),
      partyType: party.type,
      vendorId: party.type === 'VENDOR' ? party.id : undefined,
      riderId: party.type === 'RIDER' ? party.id : undefined,
      amount: requested,
      method: account?.includes('@') ? 'UPI Instant' : 'IMPS Direct',
      accountMasked: maskAccount(account),
    },
  });
  await notifyAdmins({ title: 'Payout requested', message: `${name} requested a payout of ₹${requested}`, type: 'SYSTEM', data: { payoutId: payout.id } });
  if (userId) await notifyUser(userId, { title: 'Payout request received', message: `₹${requested} will be transferred within 2 business days.`, type: 'SYSTEM' });
  return payout;
}

/** Admin marks a payout as processed (money sent) or failed. */
export async function settlePayout(payoutId: string, outcome: 'PROCESSED' | 'FAILED', opts: { reference?: string; failureReason?: string } = {}) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId }, include: { vendor: true, rider: true } });
  if (!payout) throw notFound('Payout');
  if (payout.status !== 'PENDING') throw unprocessable(`Payout is already ${payout.status.toLowerCase()}`);

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payout.update({
      where: { id: payoutId },
      data: { status: outcome, processedAt: new Date(), reference: opts.reference, failureReason: opts.failureReason },
    });
    if (outcome === 'PROCESSED') {
      await tx.ledgerEntry.create({
        data: {
          partyType: payout.partyType,
          vendorId: payout.vendorId,
          riderId: payout.riderId,
          payoutId: payout.id,
          kind: 'PAYOUT',
          amount: -Number(payout.amount),
          description: `Payout ${payout.payoutNumber}`,
        },
      });
    }
    return p;
  });

  const userId = payout.vendor?.userId ?? payout.rider?.userId;
  if (userId) {
    await notifyUser(userId, {
      title: outcome === 'PROCESSED' ? 'Payout transferred' : 'Payout failed',
      message: outcome === 'PROCESSED' ? `₹${Number(payout.amount)} has been transferred to your account.` : `Payout of ₹${Number(payout.amount)} failed: ${opts.failureReason ?? 'contact support'}`,
      type: 'SYSTEM',
      data: { payoutId },
    });
  }
  return updated;
}

/** Admin-initiated payout (from the Revenue page "create payout"). */
export async function createPayoutByAdmin(party: { type: PartyType; id: string }, amount: number, method?: string) {
  const balance = await partyBalance(party);
  if (amount > balance.outstanding) throw unprocessable(`Amount exceeds outstanding balance of ₹${balance.outstanding}`);
  const account =
    party.type === 'VENDOR'
      ? (await prisma.vendor.findUnique({ where: { id: party.id } }))?.bankAccountNumber
      : (await prisma.rider.findUnique({ where: { id: party.id } }))?.upiId;
  return prisma.payout.create({
    data: {
      payoutNumber: await nextId('PAY'),
      partyType: party.type,
      vendorId: party.type === 'VENDOR' ? party.id : undefined,
      riderId: party.type === 'RIDER' ? party.id : undefined,
      amount,
      method: method ?? 'IMPS Direct',
      accountMasked: maskAccount(account),
    },
  });
}
