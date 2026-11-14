import { RegistrationFormData, ServiceItem } from '../types';
import { fetchZones, resolveZoneIds, Zone } from './zonesApi';

export const PRIMARY_API_ENDPOINT = '/api/v1/vendors';
export const DIRECT_ALB_ENDPOINT = 'http://yesdhobi-alb-648458477.ap-southeast-2.elb.amazonaws.com/api/v1/vendors';

const SERVICE_ID_MAP: Record<string, number> = {
  wash_fold: 1,
  wash_iron: 2,
  steam_iron: 3,
  dry_iron: 4,
  dry_cleaning: 5,
  shoe_cleaning: 6,
  stain_removal: 7,
  households: 8,
  wet_cleaning: 9,
};

const EQUIPMENT_ID_MAP: Record<string, number> = {
  'Washing Machine': 1,
  'Industrial Dryer': 2,
  'Steam Iron': 3,
  'Dry cleaning machine': 4,
  'Wet Cleaning machine': 5,
  'Shoe cleaning': 6,
  'Spotting machine': 7,
  'Rolling machine': 8,
  'Dry Iron': 9,
};

const DAY_MAP: Record<string, number> = {
  Mon: 1,
  Monday: 1,
  Tue: 2,
  Tuesday: 2,
  Wed: 3,
  Wednesday: 3,
  Thu: 4,
  Thursday: 4,
  Fri: 5,
  Friday: 5,
  Sat: 6,
  Saturday: 6,
  Sun: 7,
  Sunday: 7,
};

/**
 * Trimmed value, or undefined when the vendor left the field blank.
 *
 * Every optional field goes through this instead of a stand-in value. The
 * payload builder used to fall back to demo data (a made-up Aadhaar number, a
 * made-up GSTIN, example.com document links, "John Doe" as the account
 * holder), which meant a blank field reached the backend as a real-looking
 * answer and an admin approved KYC against data nobody had entered.
 */
function opt(val: string | undefined | null): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatIsoDate(dateStr: string): string | undefined {
  const raw = opt(dateStr);
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function formatTimeString(timeStr: string, defaultTime: string): string {
  if (!timeStr) return defaultTime;
  if (/^\d{2}:\d{2}$/.test(timeStr)) {
    return `${timeStr}:00`;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr;
  }
  return defaultTime;
}

function parseNumber(val: string | number | undefined | null, fallback = 0): number {
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  if (!val) return fallback;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? fallback : parsed;
}

function parseOptionalNumber(val: string | number | undefined | null): number | undefined {
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  if (!opt(val as string)) return undefined;
  const parsed = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(parsed) ? undefined : parsed;
}

function parseYearsExperience(val: string): number | undefined {
  if (!opt(val)) return undefined;
  if (val.includes('1 - 2')) return 2;
  if (val.includes('3 - 5')) return 5;
  if (val.includes('5+')) return 5;
  if (val.includes('Under 1')) return 1;
  return parseOptionalNumber(val);
}

function parseDailyCapacityKg(val: string): number | undefined {
  if (!opt(val)) return undefined;
  if (val.includes('Under 50')) return 40.0;
  if (val.includes('50-100')) return 50.0;
  if (val.includes('100-200')) return 100.0;
  if (val.includes('200+')) return 200.0;
  return parseOptionalNumber(val);
}

/** Normalises to +91XXXXXXXXXX, or undefined when nothing usable was entered. */
function formatMobileNumber(num: string): string | undefined {
  const raw = opt(num);
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return raw;
  if (!digits) return undefined;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/** Drops every key whose value is undefined so blanks are omitted, not faked. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

export function transformFormDataToApiPayload(formData: RegistrationFormData, zones: Zone[] = []) {
  // 1. Personal details
  const personalDetails = compact({
    fullName: opt(formData.fullName),
    mobileNumber: formatMobileNumber(formData.mobileNumber),
    whatsappNumber: formData.whatsappSameAsMobile
      ? formatMobileNumber(formData.mobileNumber)
      : formatMobileNumber(formData.whatsappNumber),
    emailAddress: opt(formData.email),
    dateOfBirth: formatIsoDate(formData.dob),
    gender: opt(formData.gender),
    personalPincode: opt(formData.pincode),
    personalCity: opt(formData.city),
    personalState: opt(formData.state),
    currentAddress: opt(formData.currentAddress),
    aadhaarNumber: opt(formData.aadhaarNumber),
    profilePhotoUrl: opt(formData.profilePhoto as string | undefined),
  });

  // 2. Business details
  const isFranchise = formData.isExistingFranchise === 'Yes';
  const businessDetails = compact({
    shopName: opt(formData.shopName),
    isExistingFranchise: isFranchise,
    // Only meaningful when they said they already run a franchise.
    franchiseName: isFranchise ? opt(formData.franchiseName) : undefined,
    businessType: opt(formData.businessType),
    yearsOfExperience: parseYearsExperience(formData.yearsExperience),
    numberOfWorkers: parseOptionalNumber(formData.numberOfWorkers),
    hasOwnShop: formData.hasOwnShop ? formData.hasOwnShop === 'Yes' : undefined,
    shopAreaSqft: parseOptionalNumber(formData.shopAreaSqFt),
    numberOfWashingMachines: parseOptionalNumber(formData.numberOfWashingMachines),
    dailyCapacityKg: parseDailyCapacityKg(formData.dailyCapacity),
    // GST is genuinely optional for small shops; a blank one must stay blank.
    gstNumber: opt(formData.gstNumber)?.toUpperCase(),
    panNumber: opt(formData.panNumber)?.toUpperCase(),
    standardDeliveryTime: opt(formData.standardDeliveryTime),
    offersExpressDelivery: Boolean(formData.offerExpressDelivery),
    expressDeliveryChargePercentage: formData.offerExpressDelivery
      ? parseOptionalNumber(formData.expressPriceMarkup)
      : undefined,
  });

  // 3. Location
  const location = compact({
    shopAddress: opt(formData.pickupAddress) || opt(formData.exactShopLocation) || opt(formData.currentAddress),
    landmark: opt(formData.landmark),
    pincode: opt(formData.locationPincode) || opt(formData.pincode),
    city: opt(formData.locationCity) || opt(formData.city),
    state: opt(formData.locationState) || opt(formData.state),
    latitude: typeof formData.lat === 'number' && !isNaN(formData.lat) ? formData.lat : undefined,
    longitude: typeof formData.lng === 'number' && !isNaN(formData.lng) ? formData.lng : undefined,
    serviceRadiusKm: parseNumber(formData.serviceRadius, 5.0),
    workingHoursFrom: formatTimeString(formData.workingHoursFrom, '08:00:00'),
    workingHoursTo: formatTimeString(formData.workingHoursTo, '19:00:00'),
  });

  // 4. Documents — only the ones actually uploaded.
  const documents = compact({
    aadhaarFrontUrl: opt(formData.aadhaarFront as string | undefined),
    aadhaarBackUrl: opt(formData.aadhaarBack as string | undefined),
    panFrontUrl: opt(formData.panFront as string | undefined),
    shopPhotoUrl: opt(formData.shopPhoto as string | undefined),
    gstCertificateUrl: opt(formData.gstCertificate as string | undefined),
    tradeLicenseUrl: opt(formData.tradeLicense as string | undefined),
    labourLicenseUrl: opt(formData.labourLicense as string | undefined),
  });

  // 5. Bank details
  const bankDetails = compact({
    bankAccountHolderName: opt(formData.accountHolderName),
    bankName: opt(formData.bankName),
    bankAccountNumber: opt(formData.accountNumber),
    bankIfscCode: opt(formData.ifscCode)?.toUpperCase(),
    bankAccountType: opt(formData.accountType),
    cancelledChequePassbookUrl: opt(formData.cancelledCheque as string | undefined),
  });

  // 6. Services — exactly what they enabled and priced.
  const servicesList = Object.values(formData.services || {});
  const services = servicesList
    .filter((srv: ServiceItem) => srv.enabled)
    .map((srv: ServiceItem) => {
      const numericId = SERVICE_ID_MAP[srv.id] || parseInt(srv.id, 10);
      return {
        serviceId: Number.isInteger(numericId) && numericId > 0 ? numericId : srv.id,
        price: typeof srv.price === 'number' ? srv.price : parseNumber(srv.price, 0),
        isEnabled: true,
      };
    })
    .filter((srv) => srv.price > 0);

  // 7. Equipment
  const equipments = (formData.equipmentOwned || [])
    .map((eqName) => {
      const eqId = EQUIPMENT_ID_MAP[eqName];
      if (!eqId) return null;
      const qty = eqName === 'Washing Machine' ? parseNumber(formData.numberOfWashingMachines, 1) : 1;
      return { equipmentId: eqId, quantity: Math.max(1, Math.round(qty)) };
    })
    .filter((e): e is { equipmentId: number; quantity: number } => e !== null);

  // 8. Service areas — resolved against the zones the backend reported.
  const serviceAreas = resolveZoneIds(formData.serviceAreas || [], zones);

  // 9. Working days
  const workingDays = (formData.workingDays || [])
    .map((day) => (typeof day === 'number' ? day : DAY_MAP[day] ?? parseInt(day, 10)))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);

  return {
    personalDetails,
    businessDetails,
    location,
    documents,
    bankDetails,
    services,
    equipments,
    serviceAreas,
    workingDays,
    agreedToPartnerTerms: Boolean(formData.agreeTerms),
    agreedToPaymentTerms: Boolean(formData.agreeCommission),
    consentedToBackgroundVerification: Boolean(formData.consentBackgroundCheck),
    ...(formData.password && formData.password.trim().length >= 6 ? { password: formData.password.trim() } : {}),
  };
}

export async function submitVendorRegistration(formData: RegistrationFormData) {
  // Zone ids are resolved from the API so a selected area maps to the zone the
  // vendor actually picked.
  const zones = await fetchZones().catch(() => [] as Zone[]);
  const payload = transformFormDataToApiPayload(formData, zones);

  // The payload carries Aadhaar and bank account numbers plus base64 document
  // scans, so it is never written to the browser console.

  // First try the same-origin API path (proxied to the backend).
  try {
    const response = await fetch(PRIMARY_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return await response.json();
    }

    let errorMsg = `API Error (${response.status} ${response.statusText})`;
    try {
      const errData = await response.json();
      if (errData?.message) errorMsg = errData.message;
      else if (errData?.error) errorMsg = typeof errData.error === 'string' ? errData.error : JSON.stringify(errData.error);
    } catch {
      // JSON parse error
    }

    // Try fallback direct ALB endpoint if relative URL failed
    return await submitToFallbackEndpoint(payload, errorMsg);
  } catch (err: any) {
    console.warn('Primary vendor registration request failed, trying fallback endpoint');
    return await submitToFallbackEndpoint(payload, err?.message || 'Network error');
  }
}

async function submitToFallbackEndpoint(payload: ReturnType<typeof transformFormDataToApiPayload>, originalError: string) {
  try {
    const response = await fetch(DIRECT_ALB_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return await response.json();
    }

    let errorMsg = `Server error (${response.status} ${response.statusText})`;
    try {
      const errData = await response.json();
      if (errData?.message) errorMsg = errData.message;
      else if (errData?.error) errorMsg = typeof errData.error === 'string' ? errData.error : JSON.stringify(errData.error);
    } catch {
      // JSON parse error
    }
    throw new Error(errorMsg);
  } catch (fallbackErr: any) {
    throw new Error(`Failed to submit registration: ${originalError || fallbackErr?.message || 'Unknown error'}`);
  }
}
