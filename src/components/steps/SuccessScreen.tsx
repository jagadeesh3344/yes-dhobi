import React, { useState } from 'react';
import { ShieldCheck, Copy, Check, Phone, Mail, Clock, Download, QrCode, Play, Apple } from 'lucide-react';
import { RegistrationFormData } from '../../types';

interface SuccessScreenProps {
  formData: RegistrationFormData;
  onReset: () => void;
}

export const SuccessScreen: React.FC<SuccessScreenProps> = ({ formData, onReset }) => {
  const [copied, setCopied] = useState(false);

  const regId = formData.registrationId || 'YD-2024-89472';
  const mobile = formData.mobileNumber ? `+91 ${formData.mobileNumber}` : '+91 98765 43210';

  const handleCopy = () => {
    navigator.clipboard.writeText(regId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-8 px-4">
      {/* Centered Main Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8 sm:p-12 text-center">
        {/* Yellow Shield Icon */}
        <div className="w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-6">
          <div className="w-14 h-14 rounded-full bg-yellow-400 flex items-center justify-center text-slate-900 shadow-md">
            <ShieldCheck className="w-9 h-9 stroke-[2.5]" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-3xl sm:text-4xl font-black text-[#1E3A8A] tracking-tight mb-2">
          Registration Successful! 🎉
        </h1>
        <p className="text-sm font-medium text-slate-500 mb-8">
          Welcome to the Yes Dhobi Partner Network
        </p>

        {/* Blue Info Alert Box */}
        <div className="bg-[#EEF4FF] border border-blue-100 rounded-2xl p-5 text-left mb-8">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-bold text-[#1E3A8A] leading-relaxed">
              Your application is under review. You will receive a verification call within 24 hours.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-xl p-3 border border-blue-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Registration ID
                </span>
                <span className="text-sm font-extrabold text-slate-900 font-mono">{regId}</span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
                title="Copy Registration ID"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="bg-white rounded-xl p-3 border border-blue-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Registered Mobile
                </span>
                <span className="text-sm font-extrabold text-slate-900">{mobile}</span>
              </div>
            </div>
          </div>
        </div>

        {/* What Happens Next? Timeline */}
        <div className="text-left mb-10">
          <h3 className="text-base font-extrabold text-slate-900 mb-4">What Happens Next?</h3>
          <div className="space-y-3.5">
            {[
              { step: 1, text: 'Registration Complete', completed: true },
              { step: 2, text: 'Verification Call (Within 24 hours)', active: true },
              { step: 3, text: 'Document Verification (1-2 business days)' },
              { step: 4, text: 'Account Activation' },
              { step: 5, text: 'Start Receiving Orders! 🚀' }
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    item.completed
                      ? 'bg-blue-600 text-white'
                      : item.active
                      ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-600/30'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {item.step}
                </span>
                <span
                  className={`text-xs font-medium ${
                    item.completed || item.active ? 'text-slate-900 font-bold' : 'text-slate-500'
                  }`}
                >
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Download App Yellow Bordered Box */}
        <div className="border-2 border-yellow-400 rounded-3xl p-6 sm:p-8 text-left bg-white relative shadow-sm">
          <span className="bg-yellow-400 text-slate-900 font-extrabold text-[10px] tracking-wider uppercase px-3 py-1 rounded-md inline-block mb-3">
            NEXT STEP ESSENTIAL
          </span>
          <h3 className="text-xl font-extrabold text-slate-900 mb-1">Download Yes Dhobi Business App</h3>
          <p className="text-xs text-slate-600 leading-relaxed mb-6 max-w-md">
            Login with your registered mobile number to start receiving orders immediately after verification.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            {/* App store buttons container */}
            <div className="space-y-3">
              <a
                href="#download-google-play"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl p-3 flex items-center gap-3 transition-colors shadow-sm"
              >
                <div className="w-7 h-7 flex items-center justify-center">
                  <Play className="w-6 h-6 fill-white text-white" />
                </div>
                <div className="text-left">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-medium">
                    GET IT ON
                  </span>
                  <span className="text-sm font-bold leading-tight block">Google Play</span>
                </div>
              </a>

              <a
                href="#download-app-store"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl p-3 flex items-center gap-3 transition-colors shadow-sm"
              >
                <div className="w-7 h-7 flex items-center justify-center">
                  <Apple className="w-6 h-6 fill-white text-white" />
                </div>
                <div className="text-left">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-medium">
                    DOWNLOAD ON THE
                  </span>
                  <span className="text-sm font-bold leading-tight block">App Store</span>
                </div>
              </a>
            </div>

            {/* QR Code Graphic Container */}
            <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
              <div className="w-24 h-24 bg-blue-50 border border-blue-200 rounded-2xl p-2 flex items-center justify-center flex-shrink-0">
                {/* SVG rendered realistic QR code */}
                <svg className="w-full h-full text-blue-900" viewBox="0 0 100 100" fill="currentColor">
                  <path d="M0 0h30v30H0zM10 10h10v10H10zM70 0h30v30H70zM80 10h10v10H80zM0 70h30v30H0zM10 80h10v10H10z" />
                  <path d="M40 0h10v10H40zM50 20h10v10H50zM40 40h20v20H40zM70 40h10v10H70zM90 50h10v20H90zM0 40h20v10H0zM70 70h10v20H70zM80 90h20v10H80z" />
                </svg>
              </div>
              <div>
                <h5 className="text-xs font-bold text-slate-900">Scan to download</h5>
                <span className="text-[11px] text-slate-500">Available on iOS & Android</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Support Subtext */}
      <div className="mt-8 text-center space-y-2">
        <p className="text-xs text-slate-600">
          Need help? Call us at <strong className="text-slate-900 font-bold">1800-123-9090</strong> (Toll Free)
        </p>
        <a
          href="mailto:support@yesdhobi.com"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
        >
          <Mail className="w-3.5 h-3.5" />
          <span>support@yesdhobi.com</span>
        </a>
      </div>

      {/* Reset/Restart Button for testing */}
      <div className="mt-6 text-center">
        <button
          onClick={onReset}
          className="text-xs text-slate-400 hover:text-slate-600 underline cursor-pointer"
        >
          Reset form & start new application
        </button>
      </div>
    </div>
  );
};
