import React, { useState, useEffect } from 'react';
import { RegistrationFormData } from '../../types';
import { FileUpload } from '../FileUpload';
import confetti from 'canvas-confetti';
import { submitVendorRegistration } from '../../utils/vendorApi';
import { Loader2, AlertCircle, Eye, EyeOff, Lock, CheckCircle2 } from 'lucide-react';

interface Step5Props {
  formData: RegistrationFormData;
  updateFormData: (fields: Partial<RegistrationFormData>) => void;
  onSubmitSuccess: () => void;
  onBack: () => void;
}

export const Step5DocumentsVerification: React.FC<Step5Props> = ({
  formData,
  updateFormData,
  onSubmitSuccess,
  onBack
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Auto-fill account holder name from personal details full name if blank
  useEffect(() => {
    if (!formData.accountHolderName && formData.fullName) {
      updateFormData({ accountHolderName: formData.fullName });
    }
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    // 1. Identity Documents
    if (!formData.aadhaarFront) {
      errs.aadhaarFront = 'Please upload Aadhaar Front image';
    }
    if (!formData.aadhaarBack) {
      errs.aadhaarBack = 'Please upload Aadhaar Back image';
    }
    if (!formData.panFront) {
      errs.panFront = 'Please upload PAN Card Front image';
    }

    // 2. Business Proof
    if (!formData.shopPhoto) {
      errs.shopPhoto = 'Please upload a photo of your shop / workshop';
    }
    if (formData.gstNumber?.trim() && !formData.gstCertificate) {
      errs.gstCertificate = 'GST certificate upload is required when GST number is provided';
    }
    if (!formData.tradeLicense) {
      errs.tradeLicense = 'Please upload Trade License copy';
    }
    if (!formData.labourLicense) {
      errs.labourLicense = 'Please upload Labour License copy';
    }

    // 3. Bank Details
    if (!formData.accountHolderName?.trim()) {
      errs.accountHolderName = 'Account holder name is required';
    } else if (formData.accountHolderName.trim().length < 2) {
      errs.accountHolderName = 'Please enter a valid account holder name';
    }

    if (!formData.bankName?.trim()) {
      errs.bankName = 'Bank name is required';
    }

    const cleanAcc = (formData.accountNumber || '').replace(/\D/g, '');
    if (!cleanAcc) {
      errs.accountNumber = 'Bank account number is required';
    } else if (cleanAcc.length < 9 || cleanAcc.length > 18) {
      errs.accountNumber = 'Account number must be between 9 and 18 digits';
    }

    const cleanConfirm = (formData.confirmAccountNumber || '').replace(/\D/g, '');
    if (!cleanConfirm) {
      errs.confirmAccountNumber = 'Please re-enter your account number to confirm';
    } else if (cleanConfirm !== cleanAcc) {
      errs.confirmAccountNumber = 'Account numbers do not match';
    }

    const cleanIfsc = (formData.ifscCode || '').trim().toUpperCase();
    if (!cleanIfsc) {
      errs.ifscCode = 'Bank IFSC code is required';
    } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      errs.ifscCode = 'Invalid IFSC code. Format: 4 letters, 0, then 6 characters (e.g. SBIN0001234)';
    }

    if (!formData.accountType) {
      errs.accountType = 'Please select account type (Savings / Current)';
    }

    if (!formData.cancelledCheque) {
      errs.cancelledCheque = 'Please upload cancelled cheque or passbook copy';
    }

    // 4. Optional Password
    if (formData.password && formData.password.length > 0) {
      if (formData.password.length < 6) {
        errs.password = 'Partner password must be at least 6 characters';
      } else if (formData.password !== formData.confirmPassword) {
        errs.confirmPassword = 'Passwords do not match';
      }
    }

    // 5. Terms & Agreements
    if (!formData.agreeTerms) {
      errs.agreeTerms = 'You must agree to Partner Terms & Conditions';
    }
    if (!formData.agreeCommission) {
      errs.agreeCommission = 'You must agree to Payment Terms and commission structure';
    }
    if (!formData.consentBackgroundCheck) {
      errs.consentBackgroundCheck = 'Consent to background verification is required';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitVendorRegistration(formData);
      console.log('Vendor registration API success:', result);

      if (result && (result.registrationId || result.vendorId || result.id || result.data?.id)) {
        const newRegId = result.registrationId || result.vendorId || result.id || result.data?.id;
        const tempPassword = result.temporaryPassword ?? result.data?.temporaryPassword;
        updateFormData({
          registrationId: String(newRegId),
          ...(tempPassword ? { temporaryPassword: String(tempPassword) } : {}),
          submittedAt: new Date().toISOString(),
        });
      }

      // Fire celebratory confetti effect
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch (err) {
        console.log('Confetti triggered', err);
      }

      onSubmitSuccess();
    } catch (err: any) {
      console.error('Failed to submit vendor registration:', err);
      setError(err?.message || 'Failed to submit registration. Please verify details and try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
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
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Documents & Verification
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Please upload valid government IDs, business proof, and bank details for secure partner payouts.
        </p>
      </div>

      {/* Global Validation Error Summary Banner */}
      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-800 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">Please correct the highlighted errors before submitting:</span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-red-700">
              {Object.values(errors).slice(0, 4).map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
              {Object.keys(errors).length > 4 && (
                <li>...and {Object.keys(errors).length - 4} other required document(s) or field(s)</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* API Submission Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-800 text-xs font-medium animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold block text-sm mb-0.5">Submission Error</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* 1. IDENTITY VERIFICATION */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider border-b border-slate-100 pb-2">
          1. IDENTITY VERIFICATION
        </h3>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-2">
            Aadhaar Card <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FileUpload
                label="Aadhaar Front"
                subtext="Upload clear front side of Aadhaar. JPG, PNG or PDF, max 10MB"
                value={formData.aadhaarFront}
                onChange={(val) => {
                  updateFormData({ aadhaarFront: val });
                  clearError('aadhaarFront');
                }}
                required
              />
              {errors.aadhaarFront && (
                <p className="text-[11px] text-red-600 font-medium mt-1">{errors.aadhaarFront}</p>
              )}
            </div>
            <div>
              <FileUpload
                label="Aadhaar Back"
                subtext="Upload clear back side of Aadhaar showing address. Max 10MB"
                value={formData.aadhaarBack}
                onChange={(val) => {
                  updateFormData({ aadhaarBack: val });
                  clearError('aadhaarBack');
                }}
                required
              />
              {errors.aadhaarBack && (
                <p className="text-[11px] text-red-600 font-medium mt-1">{errors.aadhaarBack}</p>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-2">
            PAN Card <span className="text-red-500">*</span>
          </label>
          <FileUpload
            label="PAN Card Front"
            subtext="Upload clear photo of PAN card front for identity verification"
            value={formData.panFront}
            onChange={(val) => {
              updateFormData({ panFront: val });
              clearError('panFront');
            }}
            required
          />
          {errors.panFront && (
            <p className="text-[11px] text-red-600 font-medium mt-1">{errors.panFront}</p>
          )}
        </div>
      </div>

      {/* 2. BUSINESS PROOF */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider border-b border-slate-100 pb-2">
          2. BUSINESS PROOF
        </h3>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1">
            Shop Photo <span className="text-red-500">*</span>
          </label>
          <FileUpload
            label="Upload Shop Photo"
            subtext="Ensure shop name board and premises are visible. JPG/PNG, max 10MB"
            value={formData.shopPhoto}
            onChange={(val) => {
              updateFormData({ shopPhoto: val });
              clearError('shopPhoto');
            }}
            required
          />
          {errors.shopPhoto && (
            <p className="text-[11px] text-red-600 font-medium mt-1">{errors.shopPhoto}</p>
          )}
          <p className="text-[11px] text-slate-400 mt-1">Upload a clear photo of front signage and workspace layout.</p>
        </div>

        {formData.gstNumber?.trim() ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-800">
                GST Certificate <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-blue-600 font-medium">Required since GSTIN was provided</span>
            </div>
            <FileUpload
              label="GSTIN Certificate"
              subtext="Upload official GST Registration Certificate (PDF/Image)"
              value={formData.gstCertificate}
              onChange={(val) => {
                updateFormData({ gstCertificate: val });
                clearError('gstCertificate');
              }}
              required
            />
            {errors.gstCertificate && (
              <p className="text-[11px] text-red-600 font-medium mt-1">{errors.gstCertificate}</p>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-800">GST Certificate (Optional)</label>
              <span className="text-[11px] text-slate-400">Optional for non-GST registered businesses</span>
            </div>
            <FileUpload
              label="GSTIN Certificate"
              subtext="Upload official certificate if applicable"
              value={formData.gstCertificate}
              onChange={(val) => updateFormData({ gstCertificate: val })}
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Trade License <span className="text-red-500">*</span>
            </label>
            <FileUpload
              label="Trade License Image"
              subtext="Upload municipal / local trade license copy"
              value={formData.tradeLicense}
              onChange={(val) => {
                updateFormData({ tradeLicense: val });
                clearError('tradeLicense');
              }}
              required
            />
            {errors.tradeLicense && (
              <p className="text-[11px] text-red-600 font-medium mt-1">{errors.tradeLicense}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Labour License <span className="text-red-500">*</span>
            </label>
            <FileUpload
              label="Labour License Copy"
              subtext="Upload labour department certificate / shop act copy"
              value={formData.labourLicense}
              onChange={(val) => {
                updateFormData({ labourLicense: val });
                clearError('labourLicense');
              }}
              required
            />
            {errors.labourLicense && (
              <p className="text-[11px] text-red-600 font-medium mt-1">{errors.labourLicense}</p>
            )}
          </div>
        </div>
      </div>

      {/* 3. BANK DETAILS FOR PAYOUTS */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider border-b border-slate-100 pb-2">
          3. BANK DETAILS FOR PAYOUTS
        </h3>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Account Holder Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.accountHolderName}
            onChange={(e) => {
              updateFormData({ accountHolderName: e.target.value });
              clearError('accountHolderName');
            }}
            placeholder="Name as registered with your bank"
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none transition-colors ${
              errors.accountHolderName
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          />
          {errors.accountHolderName && (
            <p className="text-[11px] text-red-600 font-medium mt-1">{errors.accountHolderName}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Bank Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.bankName}
            onChange={(e) => {
              updateFormData({ bankName: e.target.value });
              clearError('bankName');
            }}
            placeholder="SBI / HDFC / ICICI / Axis / Kotak / Other"
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none transition-colors ${
              errors.bankName
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          />
          {errors.bankName && (
            <p className="text-[11px] text-red-600 font-medium mt-1">{errors.bankName}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Account Number <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] font-mono font-bold tracking-widest text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                XXXX XXXX XXXX
              </span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={18}
              value={formData.accountNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 18);
                updateFormData({ accountNumber: val });
                clearError('accountNumber');
              }}
              placeholder="XXXX XXXX XXXX"
              className={`w-full px-4 py-3 rounded-xl border text-sm font-mono focus:outline-none transition-colors ${
                errors.accountNumber
                  ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                  : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
              }`}
            />
            {errors.accountNumber && (
              <p className="text-[11px] text-red-600 font-medium mt-1">{errors.accountNumber}</p>
            )}
            <p className="text-[11px] text-slate-400 mt-1">9 to 18 numeric digits.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Confirm Account Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={18}
              value={formData.confirmAccountNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 18);
                updateFormData({ confirmAccountNumber: val });
                clearError('confirmAccountNumber');
              }}
              placeholder="XXXX XXXX XXXX"
              className={`w-full px-4 py-3 rounded-xl border text-sm font-mono focus:outline-none transition-colors ${
                errors.confirmAccountNumber
                  ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                  : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
              }`}
            />
            {errors.confirmAccountNumber && (
              <p className="text-[11px] text-red-600 font-medium mt-1">{errors.confirmAccountNumber}</p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-800">
              IFSC Code <span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] font-mono font-bold tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              AAAA 0 000000
            </span>
          </div>
          <input
            type="text"
            maxLength={11}
            value={formData.ifscCode}
            onChange={(e) => {
              const val = e.target.value.toUpperCase().slice(0, 11);
              updateFormData({ ifscCode: val });
              clearError('ifscCode');
            }}
            placeholder="AAAA0000000 (e.g. SBIN0001234)"
            className={`w-full px-4 py-3 rounded-xl border text-sm font-mono uppercase focus:outline-none transition-colors ${
              errors.ifscCode
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          />
          {errors.ifscCode && (
            <p className="text-[11px] text-red-600 font-medium mt-1">{errors.ifscCode}</p>
          )}
          <p className="text-[11px] text-slate-400 mt-1">11 alphanumeric characters found on cheque leaf or bank passbook.</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Account Type <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center space-x-6 py-1">
            {['Savings', 'Current'].map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                <input
                  type="radio"
                  name="accountType"
                  checked={formData.accountType === type}
                  onChange={() => {
                    updateFormData({ accountType: type as any });
                    clearError('accountType');
                  }}
                  className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span>{type}</span>
              </label>
            ))}
          </div>
          {errors.accountType && (
            <p className="text-[11px] text-red-600 font-medium mt-1">{errors.accountType}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1">
            Cancelled Cheque or Passbook Photo <span className="text-red-500">*</span>
          </label>
          <FileUpload
            label="Upload Cancelled Cheque / Passbook Copy"
            subtext="Must clearly show Account Holder Name, Account No, and IFSC"
            value={formData.cancelledCheque}
            onChange={(val) => {
              updateFormData({ cancelledCheque: val });
              clearError('cancelledCheque');
            }}
            required
          />
          {errors.cancelledCheque && (
            <p className="text-[11px] text-red-600 font-medium mt-1">{errors.cancelledCheque}</p>
          )}
          <p className="text-[11px] text-slate-400 mt-1">Required for electronic bank payout verification.</p>
        </div>
      </div>

      {/* 4. OPTIONAL PARTNER APP LOGIN PASSWORD */}
      <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Partner App Password (Optional)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Set a password to log into the Yes Dhobi Partner App directly. If left blank, a secure temporary password will be generated for you on the next screen.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Create Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password || ''}
                onChange={(e) => {
                  updateFormData({ password: e.target.value });
                  clearError('password');
                }}
                placeholder="Min 6 characters (Optional)"
                className={`w-full px-4 py-2.5 pr-10 rounded-xl border text-sm bg-white focus:outline-none transition-colors ${
                  errors.password
                    ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                    : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-[11px] text-red-600 font-medium mt-1">{errors.password}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword || ''}
                onChange={(e) => {
                  updateFormData({ confirmPassword: e.target.value });
                  clearError('confirmPassword');
                }}
                placeholder="Re-enter password"
                disabled={!formData.password}
                className={`w-full px-4 py-2.5 pr-10 rounded-xl border text-sm bg-white focus:outline-none disabled:bg-slate-100 transition-colors ${
                  errors.confirmPassword
                    ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                    : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={!formData.password}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 disabled:opacity-40"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-[11px] text-red-600 font-medium mt-1">{errors.confirmPassword}</p>
            )}
          </div>
        </div>
      </div>

      {/* 5. TERMS & AGREEMENT */}
      <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">
          5. TERMS & AGREEMENT
        </h3>
        <div>
          <label className="flex items-start gap-2.5 cursor-pointer text-xs font-medium text-slate-700 select-none">
            <input
              type="checkbox"
              checked={formData.agreeTerms}
              onChange={(e) => {
                updateFormData({ agreeTerms: e.target.checked });
                clearError('agreeTerms');
              }}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
            />
            <span>I agree to Partner Terms & Conditions <span className="text-red-500">*</span></span>
          </label>
          {errors.agreeTerms && (
            <p className="text-[11px] text-red-600 font-medium mt-1 ml-6">{errors.agreeTerms}</p>
          )}
        </div>

        <div>
          <label className="flex items-start gap-2.5 cursor-pointer text-xs font-medium text-slate-700 select-none">
            <input
              type="checkbox"
              checked={formData.agreeCommission}
              onChange={(e) => {
                updateFormData({ agreeCommission: e.target.checked });
                clearError('agreeCommission');
              }}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
            />
            <span>I agree to Payment Terms and commission structure <span className="text-red-500">*</span></span>
          </label>
          {errors.agreeCommission && (
            <p className="text-[11px] text-red-600 font-medium mt-1 ml-6">{errors.agreeCommission}</p>
          )}
        </div>

        <div>
          <label className="flex items-start gap-2.5 cursor-pointer text-xs font-medium text-slate-700 select-none">
            <input
              type="checkbox"
              checked={formData.consentBackgroundCheck}
              onChange={(e) => {
                updateFormData({ consentBackgroundCheck: e.target.checked });
                clearError('consentBackgroundCheck');
              }}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
            />
            <span>I consent to background verification <span className="text-red-500">*</span></span>
          </label>
          {errors.consentBackgroundCheck && (
            <p className="text-[11px] text-red-600 font-medium mt-1 ml-6">{errors.consentBackgroundCheck}</p>
          )}
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed pt-2">
          By submitting, you confirm all information is accurate and authentic. Misrepresentation may lead to permanent onboarding suspension.
        </p>
      </div>

      {/* Buttons */}
      <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onBack}
          className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          ← Back to Location
        </button>
        <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto bg-[#FFD600] hover:bg-yellow-400 disabled:bg-yellow-200 text-slate-900 font-extrabold px-8 py-3.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 text-sm disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Submitting to API...</span>
              </>
            ) : (
              <span>Submit Registration ✓</span>
            )}
          </button>
          <span className="text-[10px] text-slate-400">🔒 Your documents are encrypted and stored securely</span>
        </div>
      </div>
    </form>
  );
};
