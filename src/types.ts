export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  price: number;
  unit: string;
  icon?: string;
}

export interface RegistrationFormData {
  // Step 1: Personal Details
  fullName: string;
  mobileNumber: string;
  whatsappSameAsMobile: boolean;
  whatsappNumber: string;
  email: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other' | '';
  pincode: string;
  city: string;
  state: string;
  currentAddress: string;
  aadhaarNumber: string;
  profilePhoto: string | null;

  // Step 2: Business Details
  shopName: string;
  isExistingFranchise: 'Yes' | 'No' | '';
  franchiseName: string;
  businessType: string;
  yearsExperience: string;
  numberOfWorkers: string;
  hasOwnShop: 'Yes' | 'No' | '';
  shopAreaSqFt: string;
  equipmentOwned: string[];
  numberOfWashingMachines: string;
  dailyCapacity: string;
  gstNumber: string;
  panNumber: string;

  // Step 3: Service & Pricing
  services: Record<string, ServiceItem>;
  standardDeliveryTime: string;
  offerExpressDelivery: boolean;
  expressPriceMarkup: string;

  // Step 4: Location
  pickupAddress: string;
  landmark: string;
  locationPincode: string;
  locationCity: string;
  locationState: string;
  lat: number;
  lng: number;
  serviceRadius: string;
  serviceAreas: string[];
  workingDays: string[];
  workingHoursFrom: string;
  workingHoursTo: string;

  // Step 5: Documents & Verification
  aadhaarFront: string | null;
  aadhaarBack: string | null;
  panFront: string | null;
  shopPhoto: string | null;
  gstCertificate: string | null;
  tradeLicense: string | null;
  labourLicense: string | null;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  accountType: 'Savings' | 'Current' | '';
  cancelledCheque: string | null;
  agreeTerms: boolean;
  agreeCommission: boolean;
  consentBackgroundCheck: boolean;

  // Registration Metadata
  registrationId?: string;
  submittedAt?: string;
}

export type RegistrationStep = 1 | 2 | 3 | 4 | 5 | 'success';
