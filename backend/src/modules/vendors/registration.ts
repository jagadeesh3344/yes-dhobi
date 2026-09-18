import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { conflict, unprocessable } from '../../lib/errors.js';
import { normalizePhone, randomDigits } from '../../lib/utils.js';
import { materializeDocuments } from '../../services/storage.js';
import { notifyAdmins } from '../../services/notifications.js';
import { sms } from '../../services/sms.js';
import { getSettings } from '../../services/settings.js';

/**
 * Payload posted by the vendor web registration form
 * (frontends/web/src/utils/vendorApi.ts -> POST /api/v1/vendors).
 */
const str = z.string().trim();
const optStr = str.optional().nullable();
const num = z.coerce.number();

export const vendorRegistrationSchema = z.object({
  personalDetails: z.object({
    fullName: str.min(2),
    mobileNumber: str.min(10),
    whatsappNumber: optStr,
    emailAddress: str.email().optional().nullable(),
    dateOfBirth: z.coerce.date().optional().nullable(),
    gender: optStr,
    personalPincode: optStr,
    personalCity: optStr,
    personalState: optStr,
    currentAddress: optStr,
    aadhaarNumber: optStr,
    profilePhotoUrl: optStr,
  }),
  businessDetails: z.object({
    shopName: str.min(2),
    isExistingFranchise: z.boolean().default(false),
    franchiseName: optStr,
    businessType: optStr,
    yearsOfExperience: num.optional().nullable(),
    numberOfWorkers: num.optional().nullable(),
    hasOwnShop: z.boolean().optional().nullable(),
    shopAreaSqft: num.optional().nullable(),
    numberOfWashingMachines: num.optional().nullable(),
    dailyCapacityKg: num.default(50),
    gstNumber: optStr,
    panNumber: optStr,
    standardDeliveryTime: optStr,
    offersExpressDelivery: z.boolean().default(false),
    expressDeliveryChargePercentage: num.optional().nullable(),
  }),
  location: z.object({
    shopAddress: str.min(3),
    landmark: optStr,
    pincode: optStr,
    city: str.min(2),
    state: optStr,
    latitude: num.optional().nullable(),
    longitude: num.optional().nullable(),
    serviceRadiusKm: num.default(5),
    workingHoursFrom: str.default('08:00:00'),
    workingHoursTo: str.default('19:00:00'),
  }),
  documents: z.record(z.string(), z.string().nullable()).default({}),
  bankDetails: z
    .object({
      bankAccountHolderName: optStr,
      bankName: optStr,
      bankAccountNumber: optStr,
      bankIfscCode: optStr,
      bankAccountType: optStr,
      cancelledChequePassbookUrl: optStr,
    })
    .default({}),
  services: z.array(z.object({ serviceId: z.union([num, str]), price: num.nonnegative(), isEnabled: z.boolean().default(true) })).default([]),
  equipments: z.array(z.object({ equipmentId: num.int(), quantity: num.int().min(1).default(1) })).default([]),
  serviceAreas: z.array(num.int()).default([]),
  workingDays: z.array(num.int().min(1).max(7)).default([1, 2, 3, 4, 5, 6]),
  agreedToPartnerTerms: z.boolean().default(false),
  agreedToPaymentTerms: z.boolean().default(false),
  consentedToBackgroundVerification: z.boolean().default(false),
  /** optional: lets a vendor pick a login password at registration */
  password: z.string().min(6).max(72).optional(),
});

export type VendorRegistration = z.infer<typeof vendorRegistrationSchema>;

export async function registerVendor(input: VendorRegistration) {
  const phone = normalizePhone(input.personalDetails.mobileNumber);
  const existing = await prisma.user.findUnique({ where: { phone_role: { phone, role: 'VENDOR' } } });
  if (existing) throw conflict('A partner account already exists for this mobile number');
  if (!input.agreedToPartnerTerms || !input.agreedToPaymentTerms) throw unprocessable('You must accept the partner and payment terms');

  // resolve services (numeric ids or codes) and zones
  const categories = await prisma.serviceCategory.findMany();
  const serviceRows = input.services
    .map((s) => {
      const cat = categories.find((c) => (typeof s.serviceId === 'number' ? c.id === s.serviceId : c.code === s.serviceId || String(c.id) === s.serviceId));
      return cat ? { serviceCategoryId: cat.id, price: s.price, unit: cat.rateUnit === 'KG' ? 'kg' : cat.rateUnit === 'PAIR' ? 'pair' : 'piece', isEnabled: s.isEnabled } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const zoneIds = (await prisma.zone.findMany({ where: { id: { in: input.serviceAreas } }, select: { id: true } })).map((z) => z.id);
  const equipmentIds = new Set((await prisma.equipment.findMany({ select: { id: true } })).map((e) => e.id));

  // temporary password so the vendor can log in immediately; sent by SMS. They can reset via OTP any time.
  const tempPassword = input.password ?? randomDigits(6);
  const settings = await getSettings();

  const vendor = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        role: 'VENDOR',
        phone,
        email: input.personalDetails.emailAddress?.toLowerCase() ?? undefined,
        name: input.personalDetails.fullName,
        passwordHash: await bcrypt.hash(tempPassword, 10),
        status: 'ACTIVE',
      },
    });
    const v = await tx.vendor.create({
      data: {
        userId: user.id,
        shopName: input.businessDetails.shopName,
        ownerName: input.personalDetails.fullName,
        whatsappNumber: input.personalDetails.whatsappNumber ?? undefined,
        dateOfBirth: input.personalDetails.dateOfBirth ?? undefined,
        gender: input.personalDetails.gender ?? undefined,
        aadhaarNumber: input.personalDetails.aadhaarNumber ?? undefined,
        personalAddress: input.personalDetails.currentAddress ?? undefined,
        personalCity: input.personalDetails.personalCity ?? undefined,
        personalState: input.personalDetails.personalState ?? undefined,
        personalPincode: input.personalDetails.personalPincode ?? undefined,
        businessType: input.businessDetails.businessType ?? undefined,
        isExistingFranchise: input.businessDetails.isExistingFranchise,
        franchiseName: input.businessDetails.franchiseName ?? undefined,
        yearsOfExperience: input.businessDetails.yearsOfExperience != null ? Math.round(input.businessDetails.yearsOfExperience) : undefined,
        numberOfWorkers: input.businessDetails.numberOfWorkers != null ? Math.round(input.businessDetails.numberOfWorkers) : undefined,
        hasOwnShop: input.businessDetails.hasOwnShop ?? undefined,
        shopAreaSqft: input.businessDetails.shopAreaSqft ?? undefined,
        numberOfWashingMachines: input.businessDetails.numberOfWashingMachines != null ? Math.round(input.businessDetails.numberOfWashingMachines) : undefined,
        dailyCapacityKg: input.businessDetails.dailyCapacityKg,
        gstNumber: input.businessDetails.gstNumber ?? undefined,
        panNumber: input.businessDetails.panNumber ?? undefined,
        standardDeliveryTime: input.businessDetails.standardDeliveryTime ?? undefined,
        offersExpressDelivery: input.businessDetails.offersExpressDelivery,
        expressChargePercent: input.businessDetails.expressDeliveryChargePercentage ?? undefined,
        shopAddress: input.location.shopAddress,
        landmark: input.location.landmark ?? undefined,
        pincode: input.location.pincode ?? undefined,
        city: input.location.city,
        state: input.location.state ?? undefined,
        latitude: input.location.latitude ?? undefined,
        longitude: input.location.longitude ?? undefined,
        serviceRadiusKm: input.location.serviceRadiusKm,
        workingHoursFrom: input.location.workingHoursFrom,
        workingHoursTo: input.location.workingHoursTo,
        workingDays: [...new Set(input.workingDays)].sort(),
        bankAccountHolderName: input.bankDetails.bankAccountHolderName ?? undefined,
        bankName: input.bankDetails.bankName ?? undefined,
        bankAccountNumber: input.bankDetails.bankAccountNumber ?? undefined,
        bankIfscCode: input.bankDetails.bankIfscCode ?? undefined,
        bankAccountType: input.bankDetails.bankAccountType ?? undefined,
        commissionRate: settings.vendorCommissionRate,
        status: 'PENDING_VERIFICATION',
        agreedToPartnerTerms: input.agreedToPartnerTerms,
        agreedToPaymentTerms: input.agreedToPaymentTerms,
        consentedToBackgroundCheck: input.consentedToBackgroundVerification,
        registrationPayload: JSON.parse(JSON.stringify({ ...input, documents: Object.keys(input.documents), password: undefined })),
        zones: { create: zoneIds.map((zoneId) => ({ zoneId })) },
        equipments: { create: input.equipments.filter((e) => equipmentIds.has(e.equipmentId)).map((e) => ({ equipmentId: e.equipmentId, quantity: e.quantity })) },
        services: { create: serviceRows },
      },
    });
    return v;
  });

  // store documents after the row exists so the folder is keyed by vendor id
  const documents = await materializeDocuments(
    {
      ...input.documents,
      cancelledCheque: input.bankDetails.cancelledChequePassbookUrl ?? undefined,
      profilePhoto: input.personalDetails.profilePhotoUrl ?? undefined,
    },
    `vendors/${vendor.id}`,
  );
  // keys arrive as e.g. aadhaarFrontUrl -> normalise to aadhaarFront
  const normalizedDocs = Object.fromEntries(Object.entries(documents).map(([k, v]) => [k.replace(/Url$/, ''), v]));

  await prisma.$transaction([
    prisma.vendor.update({ where: { id: vendor.id }, data: { documents: normalizedDocs } }),
    prisma.user.update({ where: { id: vendor.userId }, data: { avatarUrl: normalizedDocs.profilePhoto } }),
    prisma.verification.create({
      data: {
        type: 'VENDOR',
        userId: vendor.userId,
        vendorId: vendor.id,
        idNumber: input.personalDetails.aadhaarNumber ?? input.businessDetails.panNumber ?? undefined,
        documents: normalizedDocs,
      },
    }),
  ]);

  await notifyAdmins({
    title: 'New Vendor Registration',
    message: `${input.businessDetails.shopName} (${input.personalDetails.fullName}) submitted a partner application`,
    type: 'VENDOR',
    data: { vendorId: vendor.id },
  });
  await sms.send(
    phone,
    input.password
      ? `Welcome to Yes Dhobi Partners! Your application for ${input.businessDetails.shopName} is under review.`
      : `Welcome to Yes Dhobi Partners! Your application for ${input.businessDetails.shopName} is under review. Partner app login: ${phone.replace('+91', '')} / temporary password ${tempPassword}`,
  );

  return {
    registrationId: vendor.id,
    vendorId: vendor.id,
    id: vendor.id,
    status: 'PENDING_VERIFICATION',
    message: 'Registration received. Our team will verify your documents within 48 hours.',
  };
}
