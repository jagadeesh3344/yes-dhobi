import React from 'react';
import { RegistrationFormData } from '../../types';
import { FileUpload } from '../FileUpload';
import confetti from 'canvas-confetti';

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
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Fire confetti effect
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
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Documents & Verification
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Please upload valid government IDs, business proof, and bank details for secure payouts.
        </p>
      </div>

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
            <FileUpload
              label="Aadhaar Front"
              subtext="Click to upload or drag & drop. JPG, PNG or PDF, max 5MB"
              value={formData.aadhaarFront}
              onChange={(val) => updateFormData({ aadhaarFront: val })}
              required
            />
            <FileUpload
              label="Aadhaar Back"
              subtext="Click to upload or drag & drop. JPG, PNG or PDF, max 5MB"
              value={formData.aadhaarBack}
              onChange={(val) => updateFormData({ aadhaarBack: val })}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-2">
            PAN Card <span className="text-red-500">*</span>
          </label>
          <FileUpload
            label="PAN Card Front"
            subtext="Upload card front for faster verification"
            value={formData.panFront}
            onChange={(val) => updateFormData({ panFront: val })}
            required
          />
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
            subtext="Ensure shop name board is visible. JPG/PNG, max 5MB"
            value={formData.shopPhoto}
            onChange={(val) => updateFormData({ shopPhoto: val })}
            required
          />
          <p className="text-[11px] text-slate-400 mt-1">Upload a clear photo of the front signage and workspace layout.</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-slate-800">GST Certificate</label>
            <span className="text-[11px] text-slate-400">Have to upload if GST entered in business details</span>
          </div>
          <FileUpload
            label="GSTIN Certificate"
            subtext="Upload official PDF"
            value={formData.gstCertificate}
            onChange={(val) => updateFormData({ gstCertificate: val })}
          />
          <p className="text-[11px] text-slate-400 mt-1">Upload a clear photo of the front signage and workspace layout.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Trade License <span className="text-red-500">*</span>
            </label>
            <FileUpload
              label="Trade Licence image"
              subtext="Upload license copy"
              value={formData.tradeLicense}
              onChange={(val) => updateFormData({ tradeLicense: val })}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Labour License <span className="text-red-500">*</span>
            </label>
            <FileUpload
              label="labour License image"
              subtext="Upload official PDF"
              value={formData.labourLicense}
              onChange={(val) => updateFormData({ labourLicense: val })}
              required
            />
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
            required
            value={formData.accountHolderName}
            onChange={(e) => updateFormData({ accountHolderName: e.target.value })}
            placeholder="Name as registered in bank account and given in personal details"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Bank Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.bankName}
            onChange={(e) => updateFormData({ bankName: e.target.value })}
            placeholder="SBI / HDFC / ICICI / PNB / Axis / Kotak / Other"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Account Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.accountNumber}
              onChange={(e) => updateFormData({ accountNumber: e.target.value })}
              placeholder="Enter account number"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Confirm Account Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.confirmAccountNumber}
              onChange={(e) => updateFormData({ confirmAccountNumber: e.target.value })}
              placeholder="Re-enter account number"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            IFSC Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.ifscCode}
            onChange={(e) => updateFormData({ ifscCode: e.target.value })}
            placeholder="e.g. SBIN0001234"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 uppercase"
          />
          <p className="text-[11px] text-slate-400 mt-1">Find on your cheque leaf or bank passbook front page.</p>
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
                  onChange={() => updateFormData({ accountType: type as any })}
                  className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span>{type}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1">
            Cancelled Cheque or Passbook Photo <span className="text-red-500">*</span>
          </label>
          <FileUpload
            label="Upload Cancelled Cheque / Passbook Copy"
            subtext="Must clearly show Name, Account No and IFSC"
            value={formData.cancelledCheque}
            onChange={(val) => updateFormData({ cancelledCheque: val })}
            required
          />
          <p className="text-[11px] text-slate-400 mt-1">Required for electronic bank validation.</p>
        </div>
      </div>

      {/* 4. TERMS & AGREEMENT */}
      <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">
          4. TERMS & AGREEMENT
        </h3>
        <label className="flex items-start gap-2.5 cursor-pointer text-xs font-medium text-slate-700 select-none">
          <input
            type="checkbox"
            required
            checked={formData.agreeTerms}
            onChange={(e) => updateFormData({ agreeTerms: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
          />
          <span>I agree to Partner Terms & Conditions</span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer text-xs font-medium text-slate-700 select-none">
          <input
            type="checkbox"
            required
            checked={formData.agreeCommission}
            onChange={(e) => updateFormData({ agreeCommission: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
          />
          <span>I agree to Payment Terms and commission structure</span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer text-xs font-medium text-slate-700 select-none">
          <input
            type="checkbox"
            required
            checked={formData.consentBackgroundCheck}
            onChange={(e) => updateFormData({ consentBackgroundCheck: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
          />
          <span>I consent to background verification</span>
        </label>
        <p className="text-[11px] text-slate-500 leading-relaxed pt-2">
          By submitting, you confirm all information is accurate and authentic. Misrepresentation may lead to permanent onboarding suspension.
        </p>
      </div>

      {/* Buttons */}
      <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onBack}
          className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          ← Back
        </button>
        <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
          <button
            type="submit"
            className="w-full sm:w-auto bg-[#FFD600] hover:bg-yellow-400 text-slate-900 font-extrabold px-8 py-3.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 text-sm"
          >
            <span>Submit Registration ✓</span>
          </button>
          <span className="text-[10px] text-slate-400">🔒 Your documents are encrypted and stored securely</span>
        </div>
      </div>
    </form>
  );
};
