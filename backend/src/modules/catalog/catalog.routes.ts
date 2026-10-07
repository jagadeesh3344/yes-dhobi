import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/http.js';
import { getSettings } from '../../services/settings.js';

/** Public, read-only reference data used by all clients. */
export const catalogRouter = Router();

catalogRouter.get(
  '/services',
  asyncHandler(async (_req, res) => {
    const services = await prisma.serviceCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { items: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });
    res.json({
      data: services.map((s) => ({
        ...s,
        fromPrice: s.items.length ? Math.min(...s.items.map((i) => Number(i.price))) : Number(s.basePrice),
      })),
    });
  }),
);

catalogRouter.get(
  '/items',
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const items = await prisma.catalogItem.findMany({
      where: {
        isActive: true,
        ...(category ? { serviceCategory: { code: category } } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { serviceCategory: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
      },
      orderBy: [{ serviceCategoryId: 'asc' }, { sortOrder: 'asc' }],
      include: { serviceCategory: { select: { id: true, code: true, name: true } } },
    });
    res.json({ data: items });
  }),
);

/**
 * One search box over the whole catalogue, for the customer app's home-screen
 * search bar. Matches service names, item names and service descriptions, and
 * returns both levels so the app can show "Services" and "Items" sections and
 * deep-link straight into a service.
 */
catalogRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) {
      res.json({ query: q, services: [], items: [], total: 0 });
      return;
    }
    const like = { contains: q, mode: 'insensitive' as const };
    const [services, items] = await Promise.all([
      prisma.serviceCategory.findMany({
        where: { isActive: true, OR: [{ name: like }, { description: like }, { code: like }] },
        orderBy: { sortOrder: 'asc' },
        include: { items: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
        take: 10,
      }),
      prisma.catalogItem.findMany({
        where: { isActive: true, OR: [{ name: like }, { serviceCategory: { name: like } }] },
        orderBy: [{ serviceCategoryId: 'asc' }, { sortOrder: 'asc' }],
        include: { serviceCategory: { select: { id: true, code: true, name: true } } },
        take: 30,
      }),
    ]);

    res.json({
      query: q,
      services: services.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        description: s.description,
        iconName: s.iconName,
        rateUnit: s.rateUnit,
        fromPrice: s.items.length ? Math.min(...s.items.map((i) => Number(i.price))) : Number(s.basePrice),
        itemCount: s.items.length,
      })),
      items: items.map((i) => ({
        id: i.id,
        code: i.code,
        name: i.name,
        price: i.price,
        unit: i.unit,
        service: i.serviceCategory,
      })),
      total: services.length + items.length,
    });
  }),
);

/** Active coupons shown on the customer home screen ("Available Coupons"). */
catalogRouter.get(
  '/promotions',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const promos = await prisma.promotion.findMany({
      where: { isActive: true, validFrom: { lte: now }, validUntil: { gte: now } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, title: true, description: true, type: true, discountValue: true, minOrder: true, maxDiscount: true, firstOrderOnly: true, validUntil: true },
    });
    res.json({ data: promos });
  }),
);

catalogRouter.get(
  '/zones',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.zone.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } }) });
  }),
);

catalogRouter.get(
  '/equipments',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.equipment.findMany({ orderBy: { id: 'asc' } }) });
  }),
);

catalogRouter.get(
  '/slots',
  asyncHandler(async (_req, res) => {
    // Pickup slots offered by the customer app. Kept server-side so ops can tune them.
    res.json({
      data: [
        { id: '8-10', label: '8-10 AM', from: '08:00', to: '10:00' },
        { id: '10-12', label: '10-12 PM', from: '10:00', to: '12:00' },
        { id: '12-2', label: '12-2 PM', from: '12:00', to: '14:00' },
        { id: '2-4', label: '2-4 PM', from: '14:00', to: '16:00' },
        { id: '4-6', label: '4-6 PM', from: '16:00', to: '18:00' },
        { id: '6-8', label: '6-8 PM', from: '18:00', to: '20:00' },
      ],
    });
  }),
);

catalogRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    res.json({
      brandName: s.brandName,
      supportEmail: s.supportEmail,
      supportPhone: s.supportPhone,
      operatingHours: s.operatingHours,
      minOrderForFreePickup: s.minOrderForFreePickup,
      deliveryFee: s.deliveryFee,
      referralBonus: s.referralBonus,
      maintenanceMode: s.maintenanceMode,
    });
  }),
);
