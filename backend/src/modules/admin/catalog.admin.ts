import { Router } from 'express';
import { z } from 'zod';
import type { RateUnit } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, parseBody } from '../../lib/http.js';
import { conflict, notFound } from '../../lib/errors.js';
import { compact } from '../../lib/utils.js';
import { serializePromotion, serializeService, serializeSurcharge } from './serializers.js';

/** Admin: service categories, catalog items, zones, promotions, surcharges. */
export const adminCatalogRouter = Router();

// ---- Service categories -----------------------------------------------------

const UNIT_IN: Record<string, RateUnit> = { '/kg': 'KG', kg: 'KG', '/item': 'ITEM', item: 'ITEM', piece: 'ITEM', '/pair': 'PAIR', pair: 'PAIR', '/spot': 'SPOT', spot: 'SPOT' };
const unitIn = z.string().transform((v) => UNIT_IN[v.toLowerCase()] ?? (v.toUpperCase() as RateUnit));

const serviceBody = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/).optional(),
  name: z.string().min(2),
  description: z.string().default(''),
  ratePerKgOrItem: z.number().nonnegative().optional(),
  basePrice: z.number().nonnegative().optional(),
  rateUnit: unitIn.default('/item'),
  leadTimeHours: z.number().int().positive().default(24),
  iconName: z.string().default('Shirt'),
  status: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

adminCatalogRouter.get(
  '/services',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.serviceCategory.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { items: true, vendorServices: true } } } });
    res.json({ data: rows.map((s) => ({ ...serializeService(s), itemCount: s._count.items, vendorCount: s._count.vendorServices })) });
  }),
);

adminCatalogRouter.post(
  '/services',
  asyncHandler(async (req, res) => {
    const b = parseBody(serviceBody, req.body);
    const code = b.code ?? b.name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (await prisma.serviceCategory.findUnique({ where: { code } })) throw conflict(`Service code ${code} already exists`);
    const row = await prisma.serviceCategory.create({
      data: {
        code,
        name: b.name,
        description: b.description,
        basePrice: b.basePrice ?? b.ratePerKgOrItem ?? 0,
        rateUnit: b.rateUnit,
        leadTimeHours: b.leadTimeHours,
        iconName: b.iconName,
        isActive: b.isActive ?? (b.status ? b.status.toLowerCase() === 'active' : true),
        sortOrder: b.sortOrder ?? (await prisma.serviceCategory.count()) + 1,
      },
    });
    res.status(201).json(serializeService(row));
  }),
);

adminCatalogRouter.patch(
  '/services/:id',
  asyncHandler(async (req, res) => {
    const b = parseBody(serviceBody.partial(), req.body);
    const id = Number(req.params.id);
    if (!(await prisma.serviceCategory.findUnique({ where: { id } }))) throw notFound('Service');
    const row = await prisma.serviceCategory.update({
      where: { id },
      data: compact({
        name: b.name,
        description: b.description,
        basePrice: b.basePrice ?? b.ratePerKgOrItem,
        rateUnit: b.rateUnit,
        leadTimeHours: b.leadTimeHours,
        iconName: b.iconName,
        isActive: b.isActive ?? (b.status ? b.status.toLowerCase() === 'active' : undefined),
        sortOrder: b.sortOrder,
      }),
    });
    res.json(serializeService(row));
  }),
);

adminCatalogRouter.post(
  '/services/:id/toggle',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const s = await prisma.serviceCategory.findUnique({ where: { id } });
    if (!s) throw notFound('Service');
    res.json(serializeService(await prisma.serviceCategory.update({ where: { id }, data: { isActive: !s.isActive } })));
  }),
);

adminCatalogRouter.delete(
  '/services/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const used = await prisma.orderItem.count({ where: { catalogItem: { serviceCategoryId: id } } });
    if (used > 0) {
      await prisma.serviceCategory.update({ where: { id }, data: { isActive: false } });
      res.json({ message: 'Service is referenced by orders; it has been deactivated instead of deleted' });
      return;
    }
    await prisma.serviceCategory.delete({ where: { id } });
    res.json({ message: 'Service deleted' });
  }),
);

// ---- Catalog items ----------------------------------------------------------

const itemBody = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/).optional(),
  serviceCategoryId: z.number().int(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  unit: z.string().default('pc'),
  iconKey: z.string().default('shirt'),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
});

adminCatalogRouter.get(
  '/items',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.catalogItem.findMany({ orderBy: [{ serviceCategoryId: 'asc' }, { sortOrder: 'asc' }], include: { serviceCategory: { select: { code: true, name: true } } } }) });
  }),
);

adminCatalogRouter.post(
  '/items',
  asyncHandler(async (req, res) => {
    const b = parseBody(itemBody, req.body);
    const cat = await prisma.serviceCategory.findUnique({ where: { id: b.serviceCategoryId } });
    if (!cat) throw notFound('Service category');
    const code = b.code ?? `${cat.code}_${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    res.status(201).json(await prisma.catalogItem.create({ data: { ...b, code, sortOrder: b.sortOrder ?? (await prisma.catalogItem.count({ where: { serviceCategoryId: cat.id } })) + 1 } }));
  }),
);

adminCatalogRouter.patch(
  '/items/:id',
  asyncHandler(async (req, res) => {
    const b = parseBody(itemBody.partial(), req.body);
    res.json(await prisma.catalogItem.update({ where: { id: req.params.id }, data: compact(b) }));
  }),
);

adminCatalogRouter.delete(
  '/items/:id',
  asyncHandler(async (req, res) => {
    const used = await prisma.orderItem.count({ where: { catalogItemId: req.params.id } });
    if (used > 0) {
      await prisma.catalogItem.update({ where: { id: req.params.id }, data: { isActive: false } });
      res.json({ message: 'Item is referenced by orders; deactivated instead of deleted' });
      return;
    }
    await prisma.catalogItem.delete({ where: { id: req.params.id } });
    res.json({ message: 'Item deleted' });
  }),
);

// ---- Zones & equipment ------------------------------------------------------

const zoneFields = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  state: z.string().optional(),
  centerLat: z.number().optional(),
  centerLng: z.number().optional(),
  radiusKm: z.number().positive().optional(),
  isActive: z.boolean().optional(),
  /** admin panel ZoneModal sends Operational | Paused */
  status: z.enum(['Operational', 'Paused']).optional(),
});
const zoneStatus = <T extends { status?: 'Operational' | 'Paused'; isActive?: boolean }>({ status, ...rest }: T) => ({ ...rest, isActive: rest.isActive ?? (status ? status === 'Operational' : undefined) });
const zoneBody = zoneFields.transform((z) => ({ ...zoneStatus(z), isActive: zoneStatus(z).isActive ?? true }));
const zonePatch = zoneFields.partial().transform(zoneStatus);

adminCatalogRouter.get('/zones', asyncHandler(async (_req, res) => res.json({ data: await prisma.zone.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { riders: true, vendors: true } } } }) })));
adminCatalogRouter.post('/zones', asyncHandler(async (req, res) => res.status(201).json(await prisma.zone.create({ data: parseBody(zoneBody, req.body) }))));
adminCatalogRouter.patch('/zones/:id', asyncHandler(async (req, res) => res.json(await prisma.zone.update({ where: { id: Number(req.params.id) }, data: compact(parseBody(zonePatch, req.body)) }))));
adminCatalogRouter.delete(
  '/zones/:id',
  asyncHandler(async (req, res) => {
    await prisma.zone.update({ where: { id: Number(req.params.id) }, data: { isActive: false } });
    res.json({ message: 'Zone deactivated' });
  }),
);
adminCatalogRouter.get('/equipments', asyncHandler(async (_req, res) => res.json({ data: await prisma.equipment.findMany({ orderBy: { id: 'asc' } }) })));
adminCatalogRouter.post('/equipments', asyncHandler(async (req, res) => res.status(201).json(await prisma.equipment.create({ data: parseBody(z.object({ name: z.string().min(2) }), req.body) }))));

// ---- Promotions -------------------------------------------------------------

const PROMO_TYPE: Record<string, 'PERCENTAGE' | 'FLAT' | 'FREE_DELIVERY'> = { percentage: 'PERCENTAGE', flat: 'FLAT', 'free delivery': 'FREE_DELIVERY', free_delivery: 'FREE_DELIVERY' };
const promoBody = z.object({
  code: z.string().min(2).max(20).transform((c) => c.toUpperCase().trim()),
  title: z.string().min(2),
  description: z.string().optional(),
  type: z.string().transform((t) => PROMO_TYPE[t.toLowerCase()] ?? (t.toUpperCase() as 'PERCENTAGE')),
  discountValue: z.number().nonnegative().default(0),
  minOrder: z.number().nonnegative().default(0),
  maxDiscount: z.number().positive().nullable().optional(),
  maxUses: z.union([z.number().int().positive(), z.literal('Unlimited'), z.null()]).optional().transform((v) => (v === 'Unlimited' ? null : v ?? null)),
  perUserLimit: z.number().int().positive().default(1),
  firstOrderOnly: z.boolean().default(false),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  validity: z.coerce.date().optional(),
  isActive: z.boolean().default(true),
});

adminCatalogRouter.get(
  '/promotions',
  asyncHandler(async (_req, res) => {
    res.json({ data: (await prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } })).map(serializePromotion) });
  }),
);

adminCatalogRouter.post(
  '/promotions',
  asyncHandler(async (req, res) => {
    const b = parseBody(promoBody, req.body);
    if (await prisma.promotion.findUnique({ where: { code: b.code } })) throw conflict(`Coupon ${b.code} already exists`);
    const row = await prisma.promotion.create({
      data: { ...b, validity: undefined, validFrom: b.validFrom ?? new Date(), validUntil: b.validUntil ?? b.validity ?? new Date(Date.now() + 30 * 86400_000) } as never,
    });
    res.status(201).json(serializePromotion(row));
  }),
);

async function promoByKey(key: string) {
  const p = await prisma.promotion.findFirst({ where: { OR: [{ id: key }, { code: key.toUpperCase() }] } });
  if (!p) throw notFound('Promotion');
  return p;
}

adminCatalogRouter.patch(
  '/promotions/:key',
  asyncHandler(async (req, res) => {
    const b = parseBody(promoBody.partial(), req.body);
    const p = await promoByKey(req.params.key!);
    const row = await prisma.promotion.update({ where: { id: p.id }, data: compact({ ...b, validity: undefined, validUntil: b.validUntil ?? b.validity }) as never });
    res.json(serializePromotion(row));
  }),
);

adminCatalogRouter.post(
  '/promotions/:key/toggle',
  asyncHandler(async (req, res) => {
    const p = await promoByKey(req.params.key!);
    res.json(serializePromotion(await prisma.promotion.update({ where: { id: p.id }, data: { isActive: !p.isActive } })));
  }),
);

adminCatalogRouter.delete(
  '/promotions/:key',
  asyncHandler(async (req, res) => {
    const p = await promoByKey(req.params.key!);
    if (p.usedCount > 0) {
      await prisma.promotion.update({ where: { id: p.id }, data: { isActive: false } });
      res.json({ message: 'Promotion has redemptions; disabled instead of deleted' });
      return;
    }
    await prisma.promotion.delete({ where: { id: p.id } });
    res.json({ message: 'Promotion deleted' });
  }),
);

// ---- Surcharge rules ----------------------------------------------------------

const surchargeBody = z.object({
  name: z.string().min(2).optional(),
  rule: z.string().min(2).optional(),
  description: z.string().optional(),
  trigger: z.string().optional(),
  kind: z.enum(['MULTIPLIER', 'FLAT', 'PERCENT_DISCOUNT']),
  value: z.number().nonnegative(),
  condition: z.enum(['EXPRESS_SELECTED', 'SUNDAY_PICKUP', 'WEIGHT_OVER', 'HOLIDAY', 'ALWAYS']),
  threshold: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  status: z.string().optional(),
});

adminCatalogRouter.get('/surcharges', asyncHandler(async (_req, res) => res.json({ data: (await prisma.surchargeRule.findMany({ orderBy: { createdAt: 'asc' } })).map(serializeSurcharge) })));

adminCatalogRouter.post(
  '/surcharges',
  asyncHandler(async (req, res) => {
    const b = parseBody(surchargeBody, req.body);
    const name = b.name ?? b.rule;
    if (!name) throw notFound('Rule name');
    const row = await prisma.surchargeRule.create({
      data: { name, description: b.description ?? b.trigger ?? '', kind: b.kind, value: b.value, condition: b.condition, threshold: b.threshold ?? undefined, isActive: b.isActive ?? (b.status ? b.status.toLowerCase() === 'active' : true) },
    });
    res.status(201).json(serializeSurcharge(row));
  }),
);

adminCatalogRouter.patch(
  '/surcharges/:id',
  asyncHandler(async (req, res) => {
    const b = parseBody(surchargeBody.partial(), req.body);
    const row = await prisma.surchargeRule.update({
      where: { id: req.params.id },
      data: compact({ name: b.name ?? b.rule, description: b.description ?? b.trigger, kind: b.kind, value: b.value, condition: b.condition, threshold: b.threshold, isActive: b.isActive ?? (b.status ? b.status.toLowerCase() === 'active' : undefined) }),
    });
    res.json(serializeSurcharge(row));
  }),
);

adminCatalogRouter.post(
  '/surcharges/:id/toggle',
  asyncHandler(async (req, res) => {
    const r = await prisma.surchargeRule.findUnique({ where: { id: req.params.id } });
    if (!r) throw notFound('Rule');
    res.json(serializeSurcharge(await prisma.surchargeRule.update({ where: { id: r.id }, data: { isActive: !r.isActive } })));
  }),
);

adminCatalogRouter.delete(
  '/surcharges/:id',
  asyncHandler(async (req, res) => {
    await prisma.surchargeRule.delete({ where: { id: req.params.id } });
    res.json({ message: 'Rule deleted' });
  }),
);
