import React from 'react';
import { RegistrationFormData } from '../../types';

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
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  const toggleEquipment = (eq: string) => {
    const current = formData.equipmentOwned || [];
    if (current.includes(eq)) {
      updateFormData({ equipmentOwned: current.filter((item) => item !== eq) });
    } else {
      updateFormData({ equipmentOwned: [...current, eq] });
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

      {/* Shop / Enterprise Name */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Shop/Enterprise/Business Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={formData.shopName}
          onChange={(e) => updateFormData({ shopName: e.target.value })}
          placeholder="e.g. Sharma Laundry & Dry Clean"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
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
                onChange={() => updateFormData({ isExistingFranchise: opt as any })}
                className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Franchise Name */}
      {formData.isExistingFranchise === 'Yes' && (
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Name of the Franchise <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.franchiseName}
            onChange={(e) => updateFormData({ franchiseName: e.target.value })}
            placeholder="e.g. Only in the case of yes"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      )}

      {/* Business Type */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Business Type <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.businessType}
          onChange={(e) => updateFormData({ businessType: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          <option value="">Select Business Type</option>
          <option value="Individual">Individual</option>
          <option value="Partnership">Partnership</option>
          <option value="Proprietorship">Proprietorship</option>
          <option value="Private Limited">Private Limited</option>
        </select>
      </div>

      {/* Experience & Workers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Years of Experience <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.yearsExperience}
            onChange={(e) => updateFormData({ yearsExperience: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">Select Experience</option>
            <option value="Under 1 Year">Under 1 Year</option>
            <option value="1 - 2 Years">1 - 2 Years</option>
            <option value="3 - 5 Years">3 - 5 Years</option>
            <option value="5+ Years">5+ Years</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Number of Workers <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            required
            value={formData.numberOfWorkers}
            onChange={(e) => updateFormData({ numberOfWorkers: e.target.value })}
            placeholder="e.g. 4"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
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
                onChange={() => updateFormData({ hasOwnShop: opt as any })}
                className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Shop Area */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Shop Area in sq ft <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={formData.shopAreaSqFt}
          onChange={(e) => updateFormData({ shopAreaSqFt: e.target.value })}
          placeholder="Approximate area in square feet"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
      </div>

      {/* Equipment Owned */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-2">
          Equipment Owned <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {equipmentOptions.map((eq) => {
            const isChecked = (formData.equipmentOwned || []).includes(eq);
            return (
              <label
                key={eq}
                className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-700 select-none"
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
      </div>

      {/* Number of Washing Machines & Capacity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Number of Washing Machines
          </label>
          <input
            type="number"
            value={formData.numberOfWashingMachines}
            onChange={(e) => updateFormData({ numberOfWashingMachines: e.target.value })}
            placeholder="3"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Daily Capacity <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.dailyCapacity}
            onChange={(e) => updateFormData({ dailyCapacity: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">Select Daily Capacity</option>
            <option value="Under 50 kg">Under 50 kg</option>
            <option value="50-100 kg">50-100 kg</option>
            <option value="100-200 kg">100-200 kg</option>
            <option value="200+ kg">200+ kg</option>
          </select>
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
            value={formData.gstNumber}
            onChange={(e) => updateFormData({ gstNumber: e.target.value })}
            placeholder="e.g. 27AAAAA1111A1Z1"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            PAN Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.panNumber}
            onChange={(e) => updateFormData({ panNumber: e.target.value })}
            placeholder="e.g. ABCDE1234F"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
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
