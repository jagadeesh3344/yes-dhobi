import React, { useState, useEffect } from 'react';
import { RegistrationFormData } from '../../types';
import { InteractiveMap } from '../InteractiveMap';
import { AlertCircle } from 'lucide-react';

interface Step4Props {
  formData: RegistrationFormData;
  updateFormData: (fields: Partial<RegistrationFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export const Step4Location: React.FC<Step4Props> = ({
  formData,
  updateFormData,
  onNext,
  onBack
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-sync address/pincode from Step 1 if not already filled in Step 4
  useEffect(() => {
    const updates: Partial<RegistrationFormData> = {};
    if (!formData.pickupAddress && formData.currentAddress) {
      updates.pickupAddress = formData.currentAddress;
    }
    if (!formData.locationPincode && formData.pincode) {
      updates.locationPincode = formData.pincode;
    }
    if (!formData.locationCity && formData.city) {
      updates.locationCity = formData.city;
    }
    if (!formData.locationState && formData.state) {
      updates.locationState = formData.state;
    }
    if (Object.keys(updates).length > 0) {
      updateFormData(updates);
    }
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!formData.pickupAddress?.trim()) {
      errs.pickupAddress = 'Shop / Pickup address is required';
    } else if (formData.pickupAddress.trim().length < 5) {
      errs.pickupAddress = 'Please enter a complete address (min 5 characters)';
    }

    if (!formData.landmark?.trim()) {
      errs.landmark = 'Nearby landmark is required';
    }

    const cleanPin = (formData.locationPincode || '').replace(/\D/g, '');
    if (!cleanPin) {
      errs.locationPincode = 'Pin code is required';
    } else if (cleanPin.length !== 6) {
      errs.locationPincode = 'Pin code must be exactly 6 digits';
    }

    if (!formData.locationCity?.trim()) {
      errs.locationCity = 'City is required';
    }

    if (!formData.locationState?.trim()) {
      errs.locationState = 'State is required';
    }

    if (!formData.workingDays || formData.workingDays.length === 0) {
      errs.workingDays = 'Please select at least one operational working day';
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

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Location Details</h2>
        <p className="text-xs text-slate-500 mt-1">
          Set up your business presence and operational range. All fields marked * are required.
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
                <li>...and {Object.keys(errors).length - 3} other issue(s)</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <InteractiveMap
        pickupAddress={formData.pickupAddress}
        landmark={formData.landmark}
        pincode={formData.locationPincode}
        city={formData.locationCity}
        state={formData.locationState}
        serviceRadius={formData.serviceRadius}
        serviceAreas={formData.serviceAreas || []}
        workingDays={formData.workingDays || []}
        workingHoursFrom={formData.workingHoursFrom}
        workingHoursTo={formData.workingHoursTo}
        errors={errors}
        onAddressChange={(val) => {
          updateFormData({ pickupAddress: val });
          clearError('pickupAddress');
        }}
        onLandmarkChange={(val) => {
          updateFormData({ landmark: val });
          clearError('landmark');
        }}
        onPincodeChange={(val) => {
          updateFormData({ locationPincode: val });
          clearError('locationPincode');
        }}
        onCityChange={(val) => {
          updateFormData({ locationCity: val });
          clearError('locationCity');
        }}
        onStateChange={(val) => {
          updateFormData({ locationState: val });
          clearError('locationState');
        }}
        onRadiusChange={(val) => updateFormData({ serviceRadius: val })}
        onAreasChange={(areas) => updateFormData({ serviceAreas: areas })}
        onDaysChange={(days) => {
          updateFormData({ workingDays: days });
          clearError('workingDays');
        }}
        onHoursFromChange={(val) => updateFormData({ workingHoursFrom: val })}
        onHoursToChange={(val) => updateFormData({ workingHoursTo: val })}
      />

      {/* Buttons */}
      <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onBack}
          className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          ← Back
        </button>
        <button
          type="submit"
          className="w-full sm:w-auto bg-[#FFD600] hover:bg-yellow-400 text-slate-900 font-bold px-8 py-3.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 text-sm"
        >
          <span>Next: Documents & Verification</span>
          <span>→</span>
        </button>
      </div>
    </form>
  );
};
