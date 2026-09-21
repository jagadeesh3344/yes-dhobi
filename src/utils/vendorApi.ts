import { RegistrationFormData, ServiceItem } from '../types';

// Base URL of the Yes Dhobi API (see backend/README.md). Set VITE_API_URL at build time,
// e.g. VITE_API_URL=https://api.yesdhobi.com/api/v1
const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
export const PRIMARY_API_ENDPOINT = `${API_BASE}/vendors`;
export const PROXY_API_ENDPOINT = '/api/v1/vendors';

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

const ZONE_MAP: Record<string, number> = {
  'Lajpat Nagar': 1,
  'Saket': 2,
  'Hauz Khas': 3,
  'Karol Bagh': 4,
  'Dwarka': 5,
  'Rohini': 6,
  'Connaught Place': 7,
  'Janakpuri': 8,
  'Vasant Kunj': 9,
  'Greater Kailash': 10,
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

function formatIsoDate(dateStr: string): string {
  if (!dateStr) return '1990-01-01T00:00:00.000Z';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '1990-01-01T00:00:00.000Z';
    return d.toISOString();
  } catch {
    return '1990-01-01T00:00:00.000Z';
  }
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

function parseYearsExperience(val: string): number {
  if (!val) return 1;
  if (val.includes('1 - 2')) return 2;
  if (val.includes('3 - 5')) return 5;
  if (val.includes('5+')) return 5;
  if (val.includes('Under 1')) return 1;
  return parseNumber(val, 1);
}

function parseDailyCapacityKg(val: string): number {
  if (!val) return 50.0;
  if (val.includes('Under 50')) return 40.0;
  if (val.includes('50-100')) return 50.0;
  if (val.includes('100-200')) return 100.0;
  if (val.includes('200+')) return 200.0;
  return parseNumber(val, 50.0);
}

function formatMobileNumber(num: string): string {
  if (!num) return '+919876543210';
  const digits = num.replace(/\D/g, '');
  if (num.startsWith('+')) return num;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits || '919876543210'}`;
}

export function transformFormDataToApiPayload(formData: RegistrationFormData) {
  // 1. Personal details
  const personalDetails = {
    fullName: formData.fullName || 'John Doe',
    mobileNumber: formatMobileNumber(formData.mobileNumber),
    whatsappNumber: formData.whatsappNumber || formData.mobileNumber || '9876543210',
    emailAddress: formData.email || 'vendor@yesdhobi.com',
    dateOfBirth: formatIsoDate(formData.dob),
    gender: formData.gender || 'Male',
    personalPincode: formData.pincode || '110024',
    personalCity: formData.city || 'New Delhi',
    personalState: formData.state || 'Delhi',
    currentAddress: formData.currentAddress || '123 Main Street, Phase 1',
    aadhaarNumber: formData.aadhaarNumber || '123456781234',
    profilePhotoUrl: formData.profilePhoto || 'https://example.com/photo.jpg',
  };

  // 2. Business details
  const businessDetails = {
    shopName: formData.shopName || 'Super Clean Laundry',
    isExistingFranchise: formData.isExistingFranchise === 'Yes',
    franchiseName: formData.franchiseName || 'YesDhobi Partner',
    businessType: formData.businessType || 'Proprietorship',
    yearsOfExperience: parseYearsExperience(formData.yearsExperience),
    numberOfWorkers: parseNumber(formData.numberOfWorkers, 4),
    hasOwnShop: formData.hasOwnShop === 'Yes',
    shopAreaSqft: parseNumber(formData.shopAreaSqFt, 250.5),
    numberOfWashingMachines: parseNumber(formData.numberOfWashingMachines, 3),
    dailyCapacityKg: parseDailyCapacityKg(formData.dailyCapacity),
    gstNumber: formData.gstNumber || '22AAAAA0000A1Z5',
    panNumber: formData.panNumber || 'ABCDE1234F',
    standardDeliveryTime: formData.standardDeliveryTime || '48 Hours',
    offersExpressDelivery: Boolean(formData.offerExpressDelivery),
    expressDeliveryChargePercentage: parseNumber(formData.expressPriceMarkup, 15.0),
  };

  // 3. Location
  const location = {
    shopAddress: formData.pickupAddress || formData.currentAddress || 'Shop 12, Market Complex',
    landmark: formData.landmark || 'Near Metro Station',
    pincode: formData.locationPincode || formData.pincode || '110024',
    city: formData.locationCity || formData.city || 'New Delhi',
    state: formData.locationState || formData.state || 'Delhi',
    latitude: typeof formData.lat === 'number' ? formData.lat : 28.5678,
    longitude: typeof formData.lng === 'number' ? formData.lng : 77.2435,
    serviceRadiusKm: parseNumber(formData.serviceRadius, 5.0),
    workingHoursFrom: formatTimeString(formData.workingHoursFrom, '08:00:00'),
    workingHoursTo: formatTimeString(formData.workingHoursTo, '19:00:00'),
  };

  // 4. Documents
  const documents = {
    aadhaarFrontUrl: formData.aadhaarFront || 'https://example.com/aadhar-front.jpg',
    aadhaarBackUrl: formData.aadhaarBack || 'https://example.com/aadhar-back.jpg',
    panFrontUrl: formData.panFront || 'https://example.com/pan.jpg',
    shopPhotoUrl: formData.shopPhoto || 'https://example.com/shop.jpg',
    gstCertificateUrl: formData.gstCertificate || 'https://example.com/gst.jpg',
    tradeLicenseUrl: formData.tradeLicense || 'https://example.com/trade.jpg',
    labourLicenseUrl: formData.labourLicense || 'https://example.com/labour.jpg',
  };

  // 5. Bank Details
  const bankDetails = {
    bankAccountHolderName: formData.accountHolderName || formData.fullName || 'John Doe',
    bankName: formData.bankName || 'HDFC Bank',
    bankAccountNumber: formData.accountNumber || '50100234567890',
    bankIfscCode: formData.ifscCode || 'HDFC0001234',
    bankAccountType: formData.accountType || 'Current',
    cancelledChequePassbookUrl: formData.cancelledCheque || 'https://example.com/cheque.jpg',
  };

  // 6. Services
  const servicesList = Object.values(formData.services || {});
  let services = servicesList
    .filter((srv: ServiceItem) => srv.enabled)
    .map((srv: ServiceItem) => {
      const numericId = SERVICE_ID_MAP[srv.id] || parseInt(srv.id, 10) || 1;
      return {
        serviceId: numericId,
        price: typeof srv.price === 'number' ? srv.price : parseNumber(srv.price, 50.0),
        isEnabled: true,
      };
    });

  if (services.length === 0) {
    services = [
      {
        serviceId: 1,
        price: 50.0,
        isEnabled: true,
      },
    ];
  }

  // 7. Equipments
  const equipmentOwnedList = formData.equipmentOwned || [];
  const equipments = equipmentOwnedList.map((eqName) => {
    const eqId = EQUIPMENT_ID_MAP[eqName] || 1;
    const qty = eqName === 'Washing Machine' ? parseNumber(formData.numberOfWashingMachines, 2) : 1;
    return {
      equipmentId: eqId,
      quantity: qty || 1,
    };
  });

  if (equipments.length === 0) {
    equipments.push({ equipmentId: 1, quantity: 2 });
  }

  // 8. Service Areas
  const rawAreas = formData.serviceAreas || [];
  const serviceAreas = rawAreas.map((area) => {
    if (typeof area === 'number') return area;
    if (ZONE_MAP[area]) return ZONE_MAP[area];
    const parsed = parseInt(area, 10);
    return isNaN(parsed) ? 1 : parsed;
  });
  if (serviceAreas.length === 0) serviceAreas.push(1);

  // 9. Working Days
  const rawDays = formData.workingDays || [];
  const workingDays = rawDays.map((day) => {
    if (typeof day === 'number') return day;
    if (DAY_MAP[day]) return DAY_MAP[day];
    const parsed = parseInt(day, 10);
    return isNaN(parsed) ? 1 : parsed;
  });
  if (workingDays.length === 0) {
    workingDays.push(1, 2, 3, 4, 5, 6);
  }

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
  };
}

export async function submitVendorRegistration(formData: RegistrationFormData) {
  const payload = transformFormDataToApiPayload(formData);
  console.log('Submitting payload to YesDhobi API:', JSON.stringify(payload, null, 2));

  // First try direct API endpoint
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

    // Try fallback proxy if direct URL returned 4xx or 5xx
    return await submitToProxyEndpoint(payload, errorMsg);
  } catch (err: any) {
    console.warn('Direct fetch failed, trying proxy endpoint:', err);
    return await submitToProxyEndpoint(payload, err?.message || 'Network error');
  }
}

async function submitToProxyEndpoint(payload: ReturnType<typeof transformFormDataToApiPayload>, originalError: string) {
  try {
    const response = await fetch(PROXY_API_ENDPOINT, {
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
  } catch (proxyErr: any) {
    throw new Error(`Failed to submit registration: ${originalError || proxyErr?.message || 'Unknown error'}`);
  }
}
