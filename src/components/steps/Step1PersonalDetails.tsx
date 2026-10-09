import React, { useState } from 'react';
import { Calendar, Info, AlertCircle } from 'lucide-react';
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
  onNext,
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      errs.fullName = 'Full name is required';
    } else if (formData.fullName.trim().length < 2) {
      errs.fullName = 'Please enter a valid full name (min 2 characters)';
    }

    const cleanMobile = formData.mobileNumber.replace(/\D/g, '');
    if (!cleanMobile) {
      errs.mobileNumber = 'Mobile number is required';
    } else if (cleanMobile.length !== 10) {
      errs.mobileNumber = 'Mobile number must be exactly 10 digits';
    } else if (!/^[6-9]/.test(cleanMobile)) {
      errs.mobileNumber = 'Indian mobile number must start with 6, 7, 8, or 9';
    }

    const cleanWhatsapp = (formData.whatsappSameAsMobile ? cleanMobile : formData.whatsappNumber).replace(/\D/g, '');
    if (!cleanWhatsapp) {
      errs.whatsappNumber = 'WhatsApp number is required';
    } else if (cleanWhatsapp.length !== 10) {
      errs.whatsappNumber = 'WhatsApp number must be exactly 10 digits';
    } else if (!/^[6-9]/.test(cleanWhatsapp)) {
      errs.whatsappNumber = 'WhatsApp number must start with 6, 7, 8, or 9';
    }

    if (!formData.email.trim()) {
      errs.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errs.email = 'Enter a valid email address (e.g. name@example.com)';
    }

    if (!formData.dob) {
      errs.dob = 'Date of birth is required';
    } else {
      const birth = new Date(formData.dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      if (isNaN(birth.getTime()) || birth > today) {
        errs.dob = 'Please enter a valid date of birth';
      } else if (age < 18) {
        errs.dob = 'Partner must be at least 18 years old';
      }
    }

    if (!formData.gender) {
      errs.gender = 'Please select your gender';
    }

    const cleanPin = formData.pincode.replace(/\D/g, '');
    if (!cleanPin) {
      errs.pincode = 'Pin code is required';
    } else if (cleanPin.length !== 6) {
      errs.pincode = 'Pin code must be exactly 6 digits';
    }

    if (!formData.city.trim()) {
      errs.city = 'City is required';
    }

    if (!formData.state.trim()) {
      errs.state = 'State is required';
    }

    if (!formData.currentAddress.trim()) {
      errs.currentAddress = 'Current address is required';
    } else if (formData.currentAddress.trim().length < 5) {
      errs.currentAddress = 'Please enter a complete address';
    }

    const cleanAadhaar = formData.aadhaarNumber.replace(/\D/g, '');
    if (!cleanAadhaar) {
      errs.aadhaarNumber = 'Aadhaar number is required';
    } else if (cleanAadhaar.length !== 12) {
      errs.aadhaarNumber = 'Aadhaar number must be exactly 12 digits';
    }

    if (!formData.profilePhoto) {
      errs.profilePhoto = 'Please upload a clear profile photo';
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Personal Details</h2>
        <p className="text-xs text-slate-500 mt-1">
          Please provide your personal information. Fields marked * are required.
        </p>
      </div>

      {/* Global Error Banner if validation fails */}
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

      {/* Full Name */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Full Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={formData.fullName}
          onChange={(e) => {
            updateFormData({ fullName: e.target.value });
            if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: '' }));
          }}
          placeholder="Enter your full name"
          className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
            errors.fullName
              ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
              : 'border-slate-200 focus:ring-blue-600'
          }`}
        />
        {errors.fullName && <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.fullName}</p>}
      </div>

      {/* Mobile & WhatsApp */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Mobile Number <span className="text-red-500">*</span>
          </label>
          <div
            className={`flex rounded-xl border overflow-hidden focus-within:ring-2 transition-all ${
              errors.mobileNumber
                ? 'border-red-400 focus-within:ring-red-500 bg-red-50/20'
                : 'border-slate-200 focus-within:ring-blue-600'
            }`}
          >
            <span className="bg-slate-50 px-3.5 py-3 border-r border-slate-200 text-sm font-semibold text-slate-700 flex items-center">
              +91
            </span>
            <input
              type="tel"
              required
              maxLength={10}
              value={formData.mobileNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                updateFormData({
                  mobileNumber: val,
                  whatsappNumber: formData.whatsappSameAsMobile ? val : formData.whatsappNumber,
                });
                if (errors.mobileNumber) setErrors((prev) => ({ ...prev, mobileNumber: '' }));
              }}
              placeholder="10-digit number (e.g. 9876543210)"
              className="w-full px-4 py-3 text-sm focus:outline-none"
            />
          </div>
          {errors.mobileNumber ? (
            <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.mobileNumber}</p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1">10 digits starting with 6, 7, 8, or 9</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-800">
              WhatsApp Number <span className="text-red-500">*</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formData.whatsappSameAsMobile}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateFormData({
                    whatsappSameAsMobile: checked,
                    whatsappNumber: checked ? formData.mobileNumber : formData.whatsappNumber,
                  });
                  if (errors.whatsappNumber) setErrors((prev) => ({ ...prev, whatsappNumber: '' }));
                }}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Same as mobile number</span>
            </label>
          </div>
          <input
            type="tel"
            required
            maxLength={10}
            disabled={formData.whatsappSameAsMobile}
            value={formData.whatsappNumber}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
              updateFormData({ whatsappNumber: val });
              if (errors.whatsappNumber) setErrors((prev) => ({ ...prev, whatsappNumber: '' }));
            }}
            placeholder="10-digit number (e.g. 9876543210)"
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 transition-all ${
              errors.whatsappNumber
                ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                : 'border-slate-200 focus:ring-blue-600'
            }`}
          />
          {errors.whatsappNumber && (
            <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.whatsappNumber}</p>
          )}
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
            onChange={(e) => {
              updateFormData({ email: e.target.value });
              if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
            }}
            placeholder="yourname@email.com"
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
              errors.email
                ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                : 'border-slate-200 focus:ring-blue-600'
            }`}
          />
          {errors.email && <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.email}</p>}
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
              onChange={(e) => {
                updateFormData({ dob: e.target.value });
                if (errors.dob) setErrors((prev) => ({ ...prev, dob: '' }));
              }}
              className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 pr-10 transition-all ${
                errors.dob
                  ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                  : 'border-slate-200 focus:ring-blue-600'
              }`}
            />
            <Calendar className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          {errors.dob ? (
            <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.dob}</p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1">Must be 18 years or older for partner onboarding.</p>
          )}
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
                  onChange={() => {
                    updateFormData({ gender: g as any });
                    if (errors.gender) setErrors((prev) => ({ ...prev, gender: '' }));
                  }}
                  className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span>{g}</span>
              </label>
            ))}
          </div>
          {errors.gender && <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.gender}</p>}
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
              const code = e.target.value.replace(/\D/g, '').slice(0, 6);
              updateFormData({ pincode: code });
              if (errors.pincode) setErrors((prev) => ({ ...prev, pincode: '' }));

              if (code.length === 6) {
                if (code.startsWith('11')) updateFormData({ city: 'New Delhi', state: 'Delhi' });
                else if (code.startsWith('12') || code.startsWith('13')) updateFormData({ state: 'Haryana' });
                else if (code.startsWith('14') || code.startsWith('15') || code.startsWith('16')) updateFormData({ state: 'Punjab' });
                else if (code.startsWith('20') || code.startsWith('21') || code.startsWith('22') || code.startsWith('24') || code.startsWith('25') || code.startsWith('26') || code.startsWith('27') || code.startsWith('28')) updateFormData({ state: 'Uttar Pradesh' });
                else if (code.startsWith('30') || code.startsWith('31') || code.startsWith('32') || code.startsWith('33') || code.startsWith('34')) updateFormData({ state: 'Rajasthan' });
                else if (code.startsWith('36') || code.startsWith('37') || code.startsWith('38') || code.startsWith('39')) updateFormData({ state: 'Gujarat' });
                else if (code.startsWith('40') || code.startsWith('41') || code.startsWith('42') || code.startsWith('43') || code.startsWith('44')) updateFormData({ state: 'Maharashtra' });
                else if (code.startsWith('50') || code.startsWith('51') || code.startsWith('52') || code.startsWith('53')) updateFormData({ city: 'Hyderabad', state: 'Telangana' });
                else if (code.startsWith('56') || code.startsWith('57') || code.startsWith('58') || code.startsWith('59')) updateFormData({ city: 'Bengaluru', state: 'Karnataka' });
                else if (code.startsWith('60') || code.startsWith('61') || code.startsWith('62') || code.startsWith('63') || code.startsWith('64')) updateFormData({ city: 'Chennai', state: 'Tamil Nadu' });
                else if (code.startsWith('67') || code.startsWith('68') || code.startsWith('69')) updateFormData({ state: 'Kerala' });
                else if (code.startsWith('70') || code.startsWith('71') || code.startsWith('72') || code.startsWith('73') || code.startsWith('74')) updateFormData({ city: 'Kolkata', state: 'West Bengal' });
              }
            }}
            placeholder="6-digit PIN code (e.g. 500001)"
            className={`w-full px-4 py-3 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 transition-all ${
              errors.pincode
                ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                : 'border-slate-200 focus:ring-blue-600'
            }`}
          />
          {errors.pincode ? (
            <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.pincode}</p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1">Enter a valid 6-digit pin code.</p>
          )}
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
            onChange={(e) => {
              updateFormData({ city: e.target.value });
              if (errors.city) setErrors((prev) => ({ ...prev, city: '' }));
            }}
            placeholder="e.g. Hyderabad"
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
              errors.city
                ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                : 'border-slate-200 bg-slate-50 focus:ring-blue-600'
            }`}
          />
          {errors.city && <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.city}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            State <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.state}
            onChange={(e) => {
              updateFormData({ state: e.target.value });
              if (errors.state) setErrors((prev) => ({ ...prev, state: '' }));
            }}
            placeholder="e.g. Telangana"
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
              errors.state
                ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                : 'border-slate-200 bg-slate-50 focus:ring-blue-600'
            }`}
          />
          {errors.state ? (
            <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.state}</p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1">Auto-filled based on pin code.</p>
          )}
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
          onChange={(e) => {
            updateFormData({ currentAddress: e.target.value });
            if (errors.currentAddress) setErrors((prev) => ({ ...prev, currentAddress: '' }));
          }}
          placeholder="House no., street, locality, landmark..."
          className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
            errors.currentAddress
              ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
              : 'border-slate-200 focus:ring-blue-600'
          }`}
        />
        {errors.currentAddress && (
          <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.currentAddress}</p>
        )}
      </div>

      {/* Aadhaar Number */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-bold text-slate-800">
            Aadhaar Number <span className="text-red-500">*</span>
          </label>
          <span className="text-[11px] font-mono font-bold tracking-widest text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            XXXX XXXX XXXX
          </span>
        </div>
        <input
          type="text"
          required
          maxLength={14}
          value={formData.aadhaarNumber}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '').slice(0, 12);
            // Format into 4-digit groups: 1234 5678 9012
            const formatted = raw.replace(/(\d{4})(?=\d)/g, '$1 ');
            updateFormData({ aadhaarNumber: formatted });
            if (errors.aadhaarNumber) setErrors((prev) => ({ ...prev, aadhaarNumber: '' }));
          }}
          placeholder="XXXX XXXX XXXX"
          className={`w-full px-4 py-3 rounded-xl border text-sm font-mono tracking-wider focus:outline-none focus:ring-2 transition-all ${
            errors.aadhaarNumber
              ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
              : 'border-slate-200 focus:ring-blue-600'
          }`}
        />
        {errors.aadhaarNumber ? (
          <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.aadhaarNumber}</p>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Must be exactly 12 digits. Required for government partner verification.</span>
          </div>
        )}
      </div>

      {/* Profile Photo Upload */}
      <div>
        <FileUpload
          label="Profile Photo"
          subtext="Click to upload. JPG/PNG, max 5MB."
          value={formData.profilePhoto}
          onChange={(val) => {
            updateFormData({ profilePhoto: val });
            if (errors.profilePhoto) setErrors((prev) => ({ ...prev, profilePhoto: '' }));
          }}
          required
        />
        {errors.profilePhoto && (
          <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.profilePhoto}</p>
        )}
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
