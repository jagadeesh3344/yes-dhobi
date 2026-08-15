import React from 'react';
import { RegistrationFormData } from '../../types';
import { InteractiveMap } from '../InteractiveMap';

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
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Location Details</h2>
        <p className="text-xs text-slate-500 mt-1">
          Set up your business presence and operational range.
        </p>
      </div>

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
        onAddressChange={(val) => updateFormData({ pickupAddress: val })}
        onLandmarkChange={(val) => updateFormData({ landmark: val })}
        onPincodeChange={(val) => updateFormData({ locationPincode: val })}
        onCityChange={(val) => updateFormData({ locationCity: val })}
        onStateChange={(val) => updateFormData({ locationState: val })}
        onRadiusChange={(val) => updateFormData({ serviceRadius: val })}
        onAreasChange={(areas) => updateFormData({ serviceAreas: areas })}
        onDaysChange={(days) => updateFormData({ workingDays: days })}
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
          <span>Next: Documents</span>
          <span>→</span>
        </button>
      </div>
    </form>
  );
};
