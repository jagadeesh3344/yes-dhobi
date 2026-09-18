import type { Prisma } from '@prisma/client';
import { maskAccount, toTitle } from '../../lib/utils.js';

/** Shapes matching the admin panel's `types.ts` so the React app can consume responses directly. */

export const customerInclude = {
  user: true,
  addresses: { where: { isDefault: true }, take: 1 },
  _count: { select: { orders: true } },
  orders: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { createdAt: true } },
} satisfies Prisma.CustomerInclude;

export function serializeCustomer(c: Prisma.CustomerGetPayload<{ include: typeof customerInclude }>) {
  const addr = c.addresses[0];
  return {
    id: c.id,
    userId: c.userId,
    name: c.user.name,
    phone: c.user.phone,
    email: c.user.email,
    avatarUrl: c.user.avatarUrl,
    totalOrders: c._count.orders,
    walletBalance: c.walletBalance,
    tier: c.tier,
    status: c.user.status === 'ACTIVE' ? (c.tier === 'VIP' ? 'VIP' : 'Active') : toTitle(c.user.status),
    accountStatus: c.user.status,
    address: addr ? [addr.line1, addr.line2, addr.landmark].filter(Boolean).join(', ') : '',
    city: addr?.city ?? c.city ?? '',
    pincode: addr?.pincode ?? null,
    referralCode: c.referralCode,
    registeredDate: c.createdAt,
    lastOrderDate: c.orders[0]?.createdAt ?? null,
  };
}

export const riderInclude = {
  user: true,
  zone: true,
  _count: { select: { pickupOrders: { where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } } }, deliveryOrders: { where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } } } } },
} satisfies Prisma.RiderInclude;

const VEHICLE_LABEL: Record<string, string> = { MOTORCYCLE: 'Motorcycle', SCOOTER: 'Scooter', BICYCLE: 'Bicycle', ELECTRIC_BIKE: 'Electric Bike', VAN: 'Van' };
const AVAIL_LABEL: Record<string, string> = { ONLINE: 'Online', OFFLINE: 'Offline', ON_DELIVERY: 'On Delivery' };

export function serializeRider(r: Prisma.RiderGetPayload<{ include: typeof riderInclude }>, extra: { weeklyEarnings?: number; activeOrderId?: string | null } = {}) {
  return {
    id: r.id,
    userId: r.userId,
    name: r.user.name,
    phone: r.user.phone,
    email: r.user.email,
    avatarUrl: r.user.avatarUrl,
    vehicle: VEHICLE_LABEL[r.vehicleType] ?? r.vehicleType,
    vehicleType: r.vehicleType,
    vehiclePlate: r.vehicleNumber,
    drivingLicenseNumber: r.drivingLicenseNumber,
    zone: r.zone?.name ?? '',
    zoneId: r.zoneId,
    status: AVAIL_LABEL[r.availability] ?? r.availability,
    availability: r.availability,
    accountStatus: r.user.status,
    onboardingStatus: r.onboardingStatus,
    totalDeliveries: r.totalDeliveries,
    rating: r.rating,
    weeklyEarnings: extra.weeklyEarnings ?? 0,
    currentLat: r.currentLat,
    currentLng: r.currentLng,
    lastLocationAt: r.lastLocationAt,
    activeOrders: r._count.pickupOrders + r._count.deliveryOrders,
    activeOrderId: extra.activeOrderId ?? null,
    bank: { bankName: r.bankName, account: maskAccount(r.bankAccountNumber), ifsc: r.ifscCode, upiId: r.upiId },
    documents: r.documents,
    joinedDate: r.createdAt,
  };
}

export const vendorInclude = {
  user: true,
  zones: { include: { zone: true } },
  services: { include: { serviceCategory: true } },
  equipments: { include: { equipment: true } },
  _count: { select: { orders: { where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } } } } },
} satisfies Prisma.VendorInclude;

const VENDOR_STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', PENDING_VERIFICATION: 'Pending Verification', SUSPENDED: 'Suspended', REJECTED: 'Rejected' };

export function serializeVendor(v: Prisma.VendorGetPayload<{ include: typeof vendorInclude }>, extra: { totalRevenue?: number } = {}) {
  return {
    id: v.id,
    userId: v.userId,
    name: v.shopName,
    owner: v.ownerName,
    phone: v.user.phone,
    email: v.user.email,
    whatsappNumber: v.whatsappNumber,
    location: [v.shopAddress, v.landmark, v.city].filter(Boolean).join(', '),
    shopAddress: v.shopAddress,
    city: v.city,
    state: v.state,
    pincode: v.pincode,
    latitude: v.latitude,
    longitude: v.longitude,
    zone: v.zones.map((z) => z.zone.name).join(', '),
    zoneIds: v.zones.map((z) => z.zoneId),
    capacityPerDay: v.dailyCapacityKg,
    activeOrders: v._count.orders,
    commissionRate: v.commissionRate,
    status: VENDOR_STATUS_LABEL[v.status] ?? v.status,
    vendorStatus: v.status,
    accountStatus: v.user.status,
    rating: v.rating,
    ratingCount: v.ratingCount,
    totalRevenue: extra.totalRevenue ?? 0,
    joinedDate: v.createdAt,
    workingHours: `${v.workingHoursFrom.slice(0, 5)} - ${v.workingHoursTo.slice(0, 5)}`,
    workingDays: v.workingDays,
    offersExpressDelivery: v.offersExpressDelivery,
    services: v.services.map((s) => ({ id: s.id, name: s.serviceCategory?.name ?? s.customName, price: s.price, unit: s.unit, isEnabled: s.isEnabled })),
    equipments: v.equipments.map((e) => ({ name: e.equipment.name, quantity: e.quantity })),
    business: { type: v.businessType, gst: v.gstNumber, pan: v.panNumber, workers: v.numberOfWorkers, machines: v.numberOfWashingMachines, experienceYears: v.yearsOfExperience },
    bank: { holder: v.bankAccountHolderName, bankName: v.bankName, account: maskAccount(v.bankAccountNumber), ifsc: v.bankIfscCode, type: v.bankAccountType },
    documents: v.documents,
  };
}

export const verificationInclude = {
  user: { select: { id: true, name: true, phone: true, email: true } },
  vendor: { select: { id: true, shopName: true, city: true } },
  rider: { select: { id: true, vehicleType: true, vehicleNumber: true, zone: { select: { name: true } } } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.VerificationInclude;

export function serializeVerification(v: Prisma.VerificationGetPayload<{ include: typeof verificationInclude }>) {
  const docs = (v.documents ?? {}) as Record<string, string>;
  return {
    id: v.id,
    name: v.type === 'VENDOR' ? `${v.vendor?.shopName ?? ''} (${v.user.name})` : v.user.name,
    type: v.type === 'VENDOR' ? 'Vendor' : 'Rider',
    partyType: v.type,
    vendorId: v.vendorId,
    riderId: v.riderId,
    userId: v.userId,
    phone: v.user.phone,
    email: v.user.email,
    submittedDate: v.submittedAt,
    docs: Object.keys(docs).map(toTitle),
    docUrls: docs,
    status: toTitle(v.status),
    verificationStatus: v.status,
    idNumber: v.idNumber,
    rejectionReason: v.rejectionReason,
    reviewedAt: v.reviewedAt,
    reviewedBy: v.reviewedBy?.name ?? null,
  };
}

export function serializePayout(p: Prisma.PayoutGetPayload<{ include: { vendor: { select: { shopName: true } }; rider: { select: { user: { select: { name: true } } } } } }>) {
  return {
    id: p.id,
    payoutNumber: p.payoutNumber,
    recipient: p.vendor?.shopName ?? p.rider?.user.name ?? '',
    type: p.partyType === 'VENDOR' ? 'Vendor' : 'Rider',
    partyType: p.partyType,
    vendorId: p.vendorId,
    riderId: p.riderId,
    amount: p.amount,
    status: toTitle(p.status),
    payoutStatus: p.status,
    date: p.processedAt ?? p.requestedAt,
    requestedAt: p.requestedAt,
    processedAt: p.processedAt,
    method: p.method,
    accountNumber: p.accountMasked,
    reference: p.reference,
    failureReason: p.failureReason,
  };
}

export function serializePromotion(p: { code: string; title: string; description: string | null; type: string; discountValue: unknown; minOrder: unknown; usedCount: number; maxUses: number | null; validFrom: Date; validUntil: Date; isActive: boolean; id: string; firstOrderOnly: boolean; perUserLimit: number; maxDiscount: unknown }) {
  const now = new Date();
  const status = !p.isActive ? 'Disabled' : p.validFrom > now ? 'Scheduled' : p.validUntil < now || (p.maxUses != null && p.usedCount >= p.maxUses) ? 'Expired' : 'Active';
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    description: p.description,
    type: p.type === 'PERCENTAGE' ? 'Percentage' : p.type === 'FLAT' ? 'Flat' : 'Free Delivery',
    promotionType: p.type,
    discountValue: p.discountValue,
    minOrder: p.minOrder,
    maxDiscount: p.maxDiscount,
    usedCount: p.usedCount,
    maxUses: p.maxUses ?? 'Unlimited',
    perUserLimit: p.perUserLimit,
    firstOrderOnly: p.firstOrderOnly,
    validFrom: p.validFrom,
    validUntil: p.validUntil,
    validity: p.validUntil,
    isActive: p.isActive,
    status,
  };
}

export function serializeSurcharge(r: { id: string; name: string; description: string; kind: string; value: unknown; condition: string; threshold: number | null; isActive: boolean }) {
  const v = Number(r.value);
  const modifier = r.kind === 'MULTIPLIER' ? `${v}x Multiplier` : r.kind === 'FLAT' ? `Flat ₹${v} Surcharge` : `${v}% Discount`;
  return { id: r.id, rule: r.name, name: r.name, trigger: r.description, description: r.description, modifier, kind: r.kind, value: r.value, condition: r.condition, threshold: r.threshold, status: r.isActive ? 'Active' : 'Inactive', isActive: r.isActive };
}

export function serializeService(s: { id: number; code: string; name: string; description: string; rateUnit: string; basePrice: unknown; leadTimeHours: number; iconName: string; isActive: boolean; sortOrder: number }) {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    description: s.description,
    ratePerKgOrItem: s.basePrice,
    basePrice: s.basePrice,
    rateUnit: s.rateUnit === 'KG' ? '/kg' : s.rateUnit === 'SPOT' ? '/spot' : '/item',
    unit: s.rateUnit,
    leadTimeHours: s.leadTimeHours,
    iconName: s.iconName,
    status: s.isActive ? 'Active' : 'Inactive',
    isActive: s.isActive,
    sortOrder: s.sortOrder,
  };
}
