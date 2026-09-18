import dayjs from 'dayjs';
import type { Promotion, SurchargeRule } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { badRequest, unprocessable } from '../lib/errors.js';
import { round2 } from '../lib/utils.js';
import { getSettings } from './settings.js';

export interface QuoteItemInput {
  /** catalog item code (e.g. wf_1) or id */
  code: string;
  quantity: number;
}

export interface QuoteInput {
  items: QuoteItemInput[];
  isExpress?: boolean;
  pickupDate: Date;
  promoCode?: string | null;
  customerId?: string;
}

export interface QuoteLine {
  catalogItemId: string;
  code: string;
  name: string;
  serviceName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export interface Quote {
  items: QuoteLine[];
  itemsCount: number;
  itemsDescription: string;
  serviceSummary: string;
  estimatedWeightKg: number;
  subtotal: number;
  surcharge: number;
  surchargeBreakdown: { rule: string; amount: number }[];
  deliveryFee: number;
  discount: number;
  tax: number;
  total: number;
  promo: { id: string; code: string; title: string } | null;
  promoError: string | null;
}

const KG_PER_ITEM = 0.35;

function applySurcharge(rule: SurchargeRule, subtotal: number): number {
  const v = Number(rule.value);
  switch (rule.kind) {
    case 'MULTIPLIER':
      return round2(subtotal * (v - 1));
    case 'FLAT':
      return round2(v);
    case 'PERCENT_DISCOUNT':
      return round2(-(subtotal * v) / 100);
  }
}

function surchargeApplies(rule: SurchargeRule, ctx: { isExpress: boolean; pickupDate: Date; weightKg: number }): boolean {
  switch (rule.condition) {
    case 'EXPRESS_SELECTED':
      return ctx.isExpress;
    case 'SUNDAY_PICKUP':
      return dayjs(ctx.pickupDate).day() === 0;
    case 'WEIGHT_OVER':
      return rule.threshold != null && ctx.weightKg > rule.threshold;
    case 'HOLIDAY':
      return false; // hook a holiday calendar here
    case 'ALWAYS':
      return true;
  }
}

export async function validatePromotion(
  code: string,
  ctx: { subtotal: number; deliveryFee: number; customerId?: string },
): Promise<{ promo: Promotion; discount: number } | { error: string }> {
  const promo = await prisma.promotion.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!promo || !promo.isActive) return { error: 'Invalid coupon code' };
  const now = new Date();
  if (promo.validFrom > now) return { error: 'This coupon is not active yet' };
  if (promo.validUntil < now) return { error: 'This coupon has expired' };
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) return { error: 'This coupon has been fully redeemed' };
  if (ctx.subtotal < Number(promo.minOrder)) return { error: `Minimum order of ₹${Number(promo.minOrder)} required` };

  if (ctx.customerId) {
    const [uses, orders] = await Promise.all([
      prisma.promotionRedemption.count({ where: { promotionId: promo.id, customerId: ctx.customerId } }),
      promo.firstOrderOnly
        ? prisma.order.count({ where: { customerId: ctx.customerId, status: { not: 'CANCELLED' } } })
        : Promise.resolve(0),
    ]);
    if (uses >= promo.perUserLimit) return { error: 'You have already used this coupon' };
    if (promo.firstOrderOnly && orders > 0) return { error: 'This coupon is only valid on your first order' };
  }

  let discount = 0;
  switch (promo.type) {
    case 'PERCENTAGE':
      discount = (ctx.subtotal * Number(promo.discountValue)) / 100;
      if (promo.maxDiscount != null) discount = Math.min(discount, Number(promo.maxDiscount));
      break;
    case 'FLAT':
      discount = Number(promo.discountValue);
      break;
    case 'FREE_DELIVERY':
      discount = ctx.deliveryFee;
      break;
  }
  return { promo, discount: round2(Math.min(discount, ctx.subtotal + ctx.deliveryFee)) };
}

export async function buildQuote(input: QuoteInput): Promise<Quote> {
  if (!input.items.length) throw badRequest('Add at least one item');
  const codes = input.items.map((i) => i.code);
  const catalog = await prisma.catalogItem.findMany({
    where: { OR: [{ code: { in: codes } }, { id: { in: codes } }], isActive: true },
    include: { serviceCategory: true },
  });
  const byKey = new Map<string, (typeof catalog)[number]>();
  for (const c of catalog) {
    byKey.set(c.code, c);
    byKey.set(c.id, c);
  }

  const lines: QuoteLine[] = [];
  for (const it of input.items) {
    const c = byKey.get(it.code);
    if (!c) throw unprocessable(`Unknown catalog item: ${it.code}`);
    if (!(it.quantity > 0)) continue;
    const unitPrice = Number(c.price);
    lines.push({
      catalogItemId: c.id,
      code: c.code,
      name: c.name,
      serviceName: c.serviceCategory.name,
      quantity: it.quantity,
      unit: c.unit,
      unitPrice,
      lineTotal: round2(unitPrice * it.quantity),
    });
  }
  if (!lines.length) throw badRequest('Add at least one item');

  const settings = await getSettings();
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const itemsCount = lines.reduce((s, l) => s + l.quantity, 0);
  const weightKg = round2(
    lines.reduce((s, l) => s + (l.unit === 'kg' ? l.quantity : l.quantity * KG_PER_ITEM), 0),
  );
  const isExpress = Boolean(input.isExpress);

  const rules = await prisma.surchargeRule.findMany({ where: { isActive: true } });
  const surchargeBreakdown: { rule: string; amount: number }[] = [];
  for (const rule of rules) {
    if (surchargeApplies(rule, { isExpress, pickupDate: input.pickupDate, weightKg })) {
      const amount = applySurcharge(rule, subtotal);
      if (amount !== 0) surchargeBreakdown.push({ rule: rule.name, amount });
    }
  }
  const surcharge = round2(surchargeBreakdown.reduce((s, b) => s + b.amount, 0));
  const deliveryFee = subtotal >= settings.minOrderForFreePickup ? 0 : round2(settings.deliveryFee);

  let discount = 0;
  let promo: Quote['promo'] = null;
  let promoError: string | null = null;
  if (input.promoCode) {
    const result = await validatePromotion(input.promoCode, { subtotal, deliveryFee, customerId: input.customerId });
    if ('error' in result) promoError = result.error;
    else {
      discount = result.discount;
      promo = { id: result.promo.id, code: result.promo.code, title: result.promo.title };
    }
  }

  const taxable = Math.max(0, subtotal + surcharge + deliveryFee - discount);
  const tax = round2((taxable * settings.taxPercent) / 100);
  const total = round2(taxable + tax);

  const services = [...new Set(lines.map((l) => l.serviceName))];
  const itemsDescription = lines.map((l) => `${l.quantity} ${l.name}`).join(', ');

  return {
    items: lines,
    itemsCount,
    itemsDescription,
    serviceSummary: services.length === 1 ? services[0]! : `${services[0]} +${services.length - 1}`,
    estimatedWeightKg: weightKg,
    subtotal,
    surcharge,
    surchargeBreakdown,
    deliveryFee,
    discount,
    tax,
    total,
    promo,
    promoError,
  };
}

/** Rider payout for one leg. */
export async function riderLegPayout(distanceKm: number | null | undefined): Promise<number> {
  const s = await getSettings();
  return round2(s.riderBaseFee + s.riderPerKmRate * (distanceKm ?? 3));
}
