import React from 'react';
import { Calendar, Info } from 'lucide-react';
import { RegistrationFormData } from '../../types';
import { FileUpload } from '../FileUpload';

interface Step1Props {
  formData: RegistrationFormData;
  updateFormData: (fields: Partial<RegistrationFormData>) => void;
  onNext: () => void;
}

export const Step1PersonalDetails: React.FC<Step1Props> = ({
  formData,
  updateFormData,
  onNext
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Personal Details</h2>
        <p className="text-xs text-slate-500 mt-1">
          Please provide your personal information. Fields marked * are required.
        </p>
      </div>

      {/* Full Name */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Full Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={formData.fullName}
          onChange={(e) => updateFormData({ fullName: e.target.value })}
          placeholder="Enter your full name"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
        />
      </div>

      {/* Mobile & WhatsApp */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Mobile Number <span className="text-red-500">*</span>
          </label>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-600">
            <span className="bg-slate-50 px-3.5 py-3 border-r border-slate-200 text-sm font-semibold text-slate-700 flex items-center">
              +91
            </span>
            <input
              type="tel"
              required
              value={formData.mobileNumber}
              onChange={(e) => {
                const val = e.target.value;
                updateFormData({
                  mobileNumber: val,
                  whatsappNumber: formData.whatsappSameAsMobile ? val : formData.whatsappNumber
                });
              }}
              placeholder="9876543210"
              className="w-full px-4 py-3 text-sm focus:outline-none"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-800">
              WhatsApp Number <span className="text-red-500">*</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.whatsappSameAsMobile}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateFormData({
                    whatsappSameAsMobile: checked,
                    whatsappNumber: checked ? formData.mobileNumber : formData.whatsappNumber
                  });
                }}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Same as mobile number</span>
            </label>
          </div>
          <input
            type="tel"
            required
            disabled={formData.whatsappSameAsMobile}
            value={formData.whatsappNumber}
            onChange={(e) => updateFormData({ whatsappNumber: e.target.value })}
            placeholder="9876543210"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>
      </div>

      {/* Email & Date of birth */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => updateFormData({ email: e.target.value })}
            placeholder="yourname@email.com"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Date of Birth <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="date"
              required
              value={formData.dob}
              onChange={(e) => updateFormData({ dob: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 pr-10"
            />
            <Calendar className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Used for verification and partner benefits.</p>
        </div>
      </div>

      {/* Gender & Pincode */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-2">
            Gender <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center space-x-6 py-2">
            {['Male', 'Female', 'Other'].map((g) => (
              <label key={g} className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                <input
                  type="radio"
                  name="gender"
                  checked={formData.gender === g}
                  onChange={() => updateFormData({ gender: g as any })}
                  className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span>{g}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Pin Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={6}
            value={formData.pincode}
            onChange={(e) => {
              const code = e.target.value;
              updateFormData({ pincode: code });
              if (code.length === 6) {
                if (code.startsWith('4')) updateFormData({ city: 'Mumbai', state: 'Maharashtra' });
                if (code.startsWith('1')) updateFormData({ city: 'New Delhi', state: 'Delhi' });
                if (code.startsWith('5')) updateFormData({ city: 'Hyderabad', state: 'Telangana' });
              }
            }}
            placeholder="400000"
            className="w-full px-4 py-3 rounded-xl border border-blue-600 bg-blue-50/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <p className="text-[11px] text-slate-400 mt-1">Enter a valid 6-digit pin code.</p>
        </div>
      </div>

      {/* City & State */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            City <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.city}
            onChange={(e) => updateFormData({ city: e.target.value })}
            placeholder="Mumbai"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            State <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.state}
            onChange={(e) => updateFormData({ state: e.target.value })}
            placeholder="Maharashtra"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none"
          />
          <p className="text-[11px] text-slate-400 mt-1">Auto-filled based on pin code.</p>
        </div>
      </div>

      {/* Current Address */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Current Address <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          rows={3}
          value={formData.currentAddress}
          onChange={(e) => updateFormData({ currentAddress: e.target.value })}
          placeholder="House no., street, locality, landmark..."
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
      </div>

      {/* Aadhaar Number */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Aadhaar Number <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={formData.aadhaarNumber}
          onChange={(e) => updateFormData({ aadhaarNumber: e.target.value })}
          placeholder="XXXX XXXX XXXX"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>Required for verification. We only store the last 4 digits.</span>
        </div>
      </div>

      {/* Profile Photo Upload */}
      <div>
        <FileUpload
          label="Profile Photo"
          subtext="click to upload. JPG/PNG, max 5MB."
          value={formData.profilePhoto}
          onChange={(val) => updateFormData({ profilePhoto: val })}
          required
        />
      </div>

      {/* Submit Action */}
      <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
        <div className="text-xs text-slate-500 flex items-center gap-1.5">
          🔒 <span>Your information is encrypted and secure</span>
        </div>
        <button
          type="submit"
          className="w-full sm:w-auto bg-[#FFD600] hover:bg-yellow-400 text-slate-900 font-bold px-8 py-3.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 text-sm"
        >
          <span>Next: Business Details</span>
          <span>→</span>
        </button>
      </div>
    </form>
  );
};
