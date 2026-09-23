import { useState, useEffect } from 'react';
import { RegistrationFormData, RegistrationStep } from '../types';

const STORAGE_KEY = 'yes_dhobi_partner_registration_v3';
const STEP_KEY = 'yes_dhobi_partner_step_v3';

export const initialServicesData = {
  wash_fold: {
    id: 'wash_fold',
    name: 'Wash & Fold',
    description: 'Standard machine washing, tumble drying, and neat folding.',
    enabled: false,
    price: 40,
    unit: 'Price per kg (₹)'
  },
  wash_iron: {
    id: 'wash_iron',
    name: 'Wash & Iron',
    description: 'Machine wash and dry followed by high-quality ironing.',
    enabled: false,
    price: 60,
    unit: 'Per kg (₹)'
  },
  steam_iron: {
    id: 'steam_iron',
    name: 'Steam Iron',
    description: 'Professional steam pressing for wrinkle-free crisp garments.',
    enabled: false,
    price: 10,
    unit: 'Per piece (₹)'
  },
  dry_iron: {
    id: 'dry_iron',
    name: 'Dry Iron',
    description: 'Professional steam pressing for wrinkle-free crisp garments.',
    enabled: false,
    price: 10,
    unit: 'Per piece (₹)'
  },
  dry_cleaning: {
    id: 'dry_cleaning',
    name: 'Dry Cleaning',
    description: 'Chemical solvent cleaning for delicate and luxury fabrics.',
    enabled: false,
    price: 150,
    unit: 'Per piece (₹)'
  },
  shoe_cleaning: {
    id: 'shoe_cleaning',
    name: 'Shoe Cleaning',
    description: 'Professional shoe cleaning services without harming fabric',
    enabled: false,
    price: 250,
    unit: 'Per pair (₹)'
  },
  stain_removal: {
    id: 'stain_removal',
    name: 'Stain Removal',
    description: 'Targeted chemical treatment for tough, stubborn fabric spots.',
    enabled: false,
    price: 80,
    unit: 'Per garment (₹)'
  },
  households: {
    id: 'households',
    name: 'Households',
    description: 'Special heavy-duty wash for sheets, drapes, and thick blankets.',
    enabled: false,
    price: 120,
    unit: 'Per item (₹)'
  },
  wet_cleaning: {
    id: 'wet_cleaning',
    name: 'Wet Cleaning',
    description: 'Special heavy-duty wash for sheets, drapes, and thick blankets.',
    enabled: false,
    price: 90,
    unit: 'Per piece (₹)'
  }
};

export const initialFormData: RegistrationFormData = {
  fullName: '',
  mobileNumber: '',
  whatsappSameAsMobile: false,
  whatsappNumber: '',
  email: '',
  dob: '',
  gender: '',
  pincode: '',
  city: '',
  state: '',
  currentAddress: '',
  aadhaarNumber: '',
  profilePhoto: null,

  shopName: '',
  isExistingFranchise: '',
  franchiseName: '',
  businessType: '',
  yearsExperience: '',
  numberOfWorkers: '',
  hasOwnShop: '',
  shopAreaSqFt: '',
  equipmentOwned: [],
  numberOfWashingMachines: '',
  dailyCapacity: '',
  gstNumber: '',
  panNumber: '',

  services: initialServicesData,
  standardDeliveryTime: '',
  offerExpressDelivery: false,
  expressPriceMarkup: '',

  pickupAddress: '',
  landmark: '',
  locationPincode: '',
  locationCity: '',
  locationState: '',
  lat: 28.5672,
  lng: 77.2400,
  serviceRadius: '',
  serviceAreas: [],
  workingDays: [],
  workingHoursFrom: '',
  workingHoursTo: '',

  aadhaarFront: null,
  aadhaarBack: null,
  panFront: null,
  shopPhoto: null,
  gstCertificate: null,
  tradeLicense: null,
  labourLicense: null,
  accountHolderName: '',
  bankName: '',
  accountNumber: '',
  confirmAccountNumber: '',
  ifscCode: '',
  accountType: '',
  cancelledCheque: null,
  agreeTerms: false,
  agreeCommission: false,
  consentBackgroundCheck: false,

  registrationId: '',
  submittedAt: ''
};

export function useRegistrationStore() {
  const [currentStep, setCurrentStep] = useState<RegistrationStep>(() => {
    try {
      const savedStep = localStorage.getItem(STEP_KEY);
      if (savedStep) {
        if (savedStep === 'success') return 'success';
        const parsed = parseInt(savedStep, 10);
        if (parsed >= 1 && parsed <= 5) return parsed as RegistrationStep;
      }
    } catch (e) {
      console.warn('Failed to read step from localStorage', e);
    }
    return 1;
  });

  const [formData, setFormData] = useState<RegistrationFormData>(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        return { ...initialFormData, ...JSON.parse(savedData) };
      }
    } catch (e) {
      console.warn('Failed to parse saved registration data', e);
    }
    return initialFormData;
  });

  useEffect(() => {
    try {
      // Exclude large binary/base64 file strings from localStorage to avoid QuotaExceededError
      const {
        profilePhoto,
        aadhaarFront,
        aadhaarBack,
        panFront,
        shopPhoto,
        gstCertificate,
        tradeLicense,
        labourLicense,
        cancelledCheque,
        ...persistableData
      } = formData;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableData));
    } catch (err) {
      console.warn('Unable to persist registration form to localStorage (quota exceeded or disabled):', err);
    }
  }, [formData]);

  useEffect(() => {
    try {
      localStorage.setItem(STEP_KEY, String(currentStep));
    } catch (err) {
      console.warn('Unable to persist step to localStorage:', err);
    }
  }, [currentStep]);

  const updateFormData = (fields: Partial<RegistrationFormData>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  const updateServicePrice = (serviceId: string, price: number) => {
    setFormData((prev) => ({
      ...prev,
      services: {
        ...prev.services,
        [serviceId]: {
          ...prev.services[serviceId],
          price
        }
      }
    }));
  };

  const toggleService = (serviceId: string) => {
    setFormData((prev) => ({
      ...prev,
      services: {
        ...prev.services,
        [serviceId]: {
          ...prev.services[serviceId],
          enabled: !prev.services[serviceId].enabled
        }
      }
    }));
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setCurrentStep(1);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STEP_KEY);
  };

  return {
    currentStep,
    setCurrentStep,
    formData,
    updateFormData,
    updateServicePrice,
    toggleService,
    resetForm
  };
}
