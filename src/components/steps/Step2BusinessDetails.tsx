import React, { useState } from 'react';
import { RegistrationFormData } from '../../types';
import { AlertCircle } from 'lucide-react';

interface Step2Props {
  formData: RegistrationFormData;
  updateFormData: (fields: Partial<RegistrationFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const equipmentOptions = [
  'Washing Machine',
  'Industrial Dryer',
  'Steam Iron',
  'Dry cleaning machine',
  'Wet Cleaning machine',
  'Shoe cleaning',
  'Spotting machine',
  'Rolling machine',
  'Dry Iron'
];

export const Step2BusinessDetails: React.FC<Step2Props> = ({
  formData,
  updateFormData,
  onNext,
  onBack
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!formData.shopName?.trim()) {
      errs.shopName = 'Business/Shop name is required';
    } else if (formData.shopName.trim().length < 2) {
      errs.shopName = 'Please enter a valid shop name (min 2 characters)';
    }

    if (!formData.isExistingFranchise) {
      errs.isExistingFranchise = 'Please specify if you are an existing franchise';
    } else if (formData.isExistingFranchise === 'Yes') {
      if (!formData.franchiseName?.trim()) {
        errs.franchiseName = 'Franchise name is required';
      } else if (formData.franchiseName.trim().length < 2) {
        errs.franchiseName = 'Enter a valid franchise name';
      }
    }

    if (!formData.businessType) {
      errs.businessType = 'Please select your business type';
    }

    if (!formData.yearsExperience) {
      errs.yearsExperience = 'Please select years of experience';
    }

    const workers = parseInt(formData.numberOfWorkers, 10);
    if (!formData.numberOfWorkers || isNaN(workers) || workers < 1) {
      errs.numberOfWorkers = 'Please enter a valid number of workers (minimum 1)';
    }

    if (!formData.hasOwnShop) {
      errs.hasOwnShop = 'Please specify if you have your own shop';
    }

    const area = parseFloat(formData.shopAreaSqFt);
    if (!formData.shopAreaSqFt || isNaN(area) || area < 10) {
      errs.shopAreaSqFt = 'Please enter valid shop area in sq ft (minimum 10 sq ft)';
    }

    if (!formData.equipmentOwned || formData.equipmentOwned.length === 0) {
      errs.equipmentOwned = 'Please select at least one equipment owned';
    }

    if (!formData.dailyCapacity) {
      errs.dailyCapacity = 'Please select your daily capacity';
    }

    const cleanPan = (formData.panNumber || '').trim().toUpperCase();
    if (!cleanPan) {
      errs.panNumber = 'PAN number is required';
    } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
      errs.panNumber = 'Invalid PAN format. Must be 10 characters (e.g. ABCDE1234F)';
    }

    const cleanGst = (formData.gstNumber || '').trim().toUpperCase();
    if (cleanGst && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleanGst)) {
      errs.gstNumber = 'Invalid GSTIN format (e.g. 27AAAAA1111A1Z1)';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onNext();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const toggleEquipment = (eq: string) => {
    const current = formData.equipmentOwned || [];
    let updated: string[];
    if (current.includes(eq)) {
      updated = current.filter((item) => item !== eq);
    } else {
      updated = [...current, eq];
    }
    updateFormData({ equipmentOwned: updated });
    if (errors.equipmentOwned && updated.length > 0) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.equipmentOwned;
        return next;
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Business & Operations Setup
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Help us understand your infrastructure. Mandatory fields are marked *
        </p>
      </div>

      {/* Global Error Summary Banner */}
      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-800 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">Please correct the highlighted errors before continuing:</span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-red-700">
              {Object.values(errors).slice(0, 3).map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
              {Object.keys(errors).length > 3 && (
                <li>...and {Object.keys(errors).length - 3} other required field(s)</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Shop / Enterprise Name */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Shop/Enterprise/Business Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.shopName}
          onChange={(e) => {
            updateFormData({ shopName: e.target.value });
            if (errors.shopName) setErrors((prev) => ({ ...prev, shopName: '' }));
          }}
          placeholder="e.g. Sharma Laundry & Dry Clean"
          className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none transition-colors ${
            errors.shopName
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
              : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
          }`}
        />
        {errors.shopName && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.shopName}</p>}
      </div>

      {/* Existing Franchise */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Are you an Existing Franchise ? <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center space-x-6 py-1">
          {['Yes', 'No'].map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
              <input
                type="radio"
                name="isExistingFranchise"
                checked={formData.isExistingFranchise === opt}
                onChange={() => {
                  updateFormData({ isExistingFranchise: opt as any });
                  if (errors.isExistingFranchise) setErrors((prev) => ({ ...prev, isExistingFranchise: '' }));
                }}
                className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
        {errors.isExistingFranchise && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.isExistingFranchise}</p>}
      </div>

      {/* Franchise Name */}
      {formData.isExistingFranchise === 'Yes' && (
        <div className="animate-in fade-in">
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Name of the Franchise <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.franchiseName}
            onChange={(e) => {
              updateFormData({ franchiseName: e.target.value });
              if (errors.franchiseName) setErrors((prev) => ({ ...prev, franchiseName: '' }));
            }}
            placeholder="e.g. UClean, Tumbledry, etc."
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none transition-colors ${
              errors.franchiseName
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          />
          {errors.franchiseName && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.franchiseName}</p>}
        </div>
      )}

      {/* Business Type */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Business Type <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.businessType}
          onChange={(e) => {
            updateFormData({ businessType: e.target.value });
            if (errors.businessType) setErrors((prev) => ({ ...prev, businessType: '' }));
          }}
          className={`w-full px-4 py-3 rounded-xl border text-sm bg-white focus:outline-none transition-colors ${
            errors.businessType
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
              : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
          }`}
        >
          <option value="">Select Business Type</option>
          <option value="Individual">Individual</option>
          <option value="Partnership">Partnership</option>
          <option value="Proprietorship">Proprietorship</option>
          <option value="Private Limited">Private Limited</option>
        </select>
        {errors.businessType && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.businessType}</p>}
      </div>

      {/* Experience & Workers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Years of Experience <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.yearsExperience}
            onChange={(e) => {
              updateFormData({ yearsExperience: e.target.value });
              if (errors.yearsExperience) setErrors((prev) => ({ ...prev, yearsExperience: '' }));
            }}
            className={`w-full px-4 py-3 rounded-xl border text-sm bg-white focus:outline-none transition-colors ${
              errors.yearsExperience
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          >
            <option value="">Select Experience</option>
            <option value="Under 1 Year">Under 1 Year</option>
            <option value="1 - 2 Years">1 - 2 Years</option>
            <option value="3 - 5 Years">3 - 5 Years</option>
            <option value="5+ Years">5+ Years</option>
          </select>
          {errors.yearsExperience && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.yearsExperience}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Number of Workers <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={formData.numberOfWorkers}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 4);
              updateFormData({ numberOfWorkers: val });
              if (errors.numberOfWorkers) setErrors((prev) => ({ ...prev, numberOfWorkers: '' }));
            }}
            placeholder="e.g. 4"
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none transition-colors ${
              errors.numberOfWorkers
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          />
          {errors.numberOfWorkers && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.numberOfWorkers}</p>}
        </div>
      </div>

      {/* Own Shop Radio */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Do you have your own shop? <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center space-x-6 py-1">
          {['Yes', 'No'].map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
              <input
                type="radio"
                name="hasOwnShop"
                checked={formData.hasOwnShop === opt}
                onChange={() => {
                  updateFormData({ hasOwnShop: opt as any });
                  if (errors.hasOwnShop) setErrors((prev) => ({ ...prev, hasOwnShop: '' }));
                }}
                className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
        {errors.hasOwnShop && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.hasOwnShop}</p>}
      </div>

      {/* Shop Area */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Shop Area in sq ft <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={formData.shopAreaSqFt}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
            updateFormData({ shopAreaSqFt: val });
            if (errors.shopAreaSqFt) setErrors((prev) => ({ ...prev, shopAreaSqFt: '' }));
          }}
          placeholder="e.g. 250"
          className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none transition-colors ${
            errors.shopAreaSqFt
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
              : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
          }`}
        />
        {errors.shopAreaSqFt && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.shopAreaSqFt}</p>}
      </div>

      {/* Equipment Owned */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-2">
          Equipment Owned <span className="text-red-500">*</span>
        </label>
        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl border ${
          errors.equipmentOwned ? 'border-red-300 bg-red-50/10' : 'border-slate-200 bg-slate-50/40'
        }`}>
          {equipmentOptions.map((eq) => {
            const isChecked = (formData.equipmentOwned || []).includes(eq);
            return (
              <label
                key={eq}
                className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-700 select-none hover:text-slate-900"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleEquipment(eq)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{eq}</span>
              </label>
            );
          })}
        </div>
        {errors.equipmentOwned && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.equipmentOwned}</p>}
      </div>

      {/* Number of Washing Machines & Capacity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Number of Washing Machines
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={3}
            value={formData.numberOfWashingMachines}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 3);
              updateFormData({ numberOfWashingMachines: val });
            }}
            placeholder="e.g. 3"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Daily Capacity <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.dailyCapacity}
            onChange={(e) => {
              updateFormData({ dailyCapacity: e.target.value });
              if (errors.dailyCapacity) setErrors((prev) => ({ ...prev, dailyCapacity: '' }));
            }}
            className={`w-full px-4 py-3 rounded-xl border text-sm bg-white focus:outline-none transition-colors ${
              errors.dailyCapacity
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          >
            <option value="">Select Daily Capacity</option>
            <option value="Under 50 kg">Under 50 kg</option>
            <option value="50-100 kg">50-100 kg</option>
            <option value="100-200 kg">100-200 kg</option>
            <option value="200+ kg">200+ kg</option>
          </select>
          {errors.dailyCapacity && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.dailyCapacity}</p>}
        </div>
      </div>

      {/* GST & PAN */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            GST Number (Optional)
          </label>
          <input
            type="text"
            maxLength={15}
            value={formData.gstNumber}
            onChange={(e) => {
              const val = e.target.value.toUpperCase().slice(0, 15);
              updateFormData({ gstNumber: val });
              if (errors.gstNumber) setErrors((prev) => ({ ...prev, gstNumber: '' }));
            }}
            placeholder="e.g. 27AAAAA1111A1Z1"
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none uppercase font-mono transition-colors ${
              errors.gstNumber
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          />
          {errors.gstNumber && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.gstNumber}</p>}
          <p className="text-[11px] text-slate-400 mt-1">15-digit GSTIN if registered.</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-800">
              PAN Number <span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] font-mono font-bold tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              ABCDE1234F
            </span>
          </div>
          <input
            type="text"
            maxLength={10}
            value={formData.panNumber}
            onChange={(e) => {
              const val = e.target.value.toUpperCase().slice(0, 10);
              updateFormData({ panNumber: val });
              if (errors.panNumber) setErrors((prev) => ({ ...prev, panNumber: '' }));
            }}
            placeholder="ABCDE1234F"
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none uppercase font-mono transition-colors ${
              errors.panNumber
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          />
          {errors.panNumber && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.panNumber}</p>}
          <p className="text-[11px] text-slate-400 mt-1">10-character Permanent Account Number.</p>
        </div>
      </div>

      {/* Buttons */}
      <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onBack}
          className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          ← Back to Personal Details
        </button>
        <button
          type="submit"
          className="w-full sm:w-auto bg-[#FFD600] hover:bg-yellow-400 text-slate-900 font-bold px-8 py-3.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 text-sm"
        >
          <span>Next: Services & Pricing</span>
          <span>→</span>
        </button>
      </div>
    </form>
  );
};
