import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { RegistrationStep } from '../types';
import { YesDhobiLogo } from './YesDhobiLogo';

interface SidebarInfoProps {
  currentStep: RegistrationStep;
}

export const SidebarInfo: React.FC<SidebarInfoProps> = ({ currentStep }) => {
  const getStepInfo = () => {
    switch (currentStep) {
      case 1:
        return {
          title: 'Join 5,000+ laundry partners across India',
          subtitle: 'Complete your profile in minutes. We\'ll verify your details and get you live on the platform.',
          stepBadge: '1. Personal Details',
          stepDesc: 'Tell us about yourself and your contact details.',
          type: 'illustration'
        };
      case 2:
        return {
          title: 'Set up your Business Details',
          subtitle: 'Tell us about your setup, machines, and capability. This helps us direct the right volume of orders to you.',
          stepBadge: '2. Business Details',
          stepDesc: 'Provide accurate details to ensure faster onboarding verification and approval.',
          type: 'photo'
        };
      case 3:
        return {
          title: 'Set up your Services & Pricing',
          subtitle: 'Select the services you offer and set competitive prices. You can always change these settings later from the Vendor App.',
          stepBadge: '3. Services & Pricing',
          stepDesc: 'Provide accurate details to ensure faster onboarding verification and approval.',
          type: 'photo'
        };
      case 4:
      case 5:
      default:
        return {
          title: 'Join 5,000+ laundry partners across India',
          subtitle: 'Almost there! Complete your location and verification details to start getting orders directly in your area.',
          stepBadge: `${currentStep}. ${currentStep === 4 ? 'Location' : 'Documents & Verification'}`,
          stepDesc: 'Provide accurate details to ensure faster onboarding verification and approval.',
          type: 'photo'
        };
    }
  };

  const info = getStepInfo();

  return (
    <div className="w-full lg:w-80 flex-shrink-0 bg-[#EEF5FF] border border-blue-100/80 rounded-2xl p-6 flex flex-col justify-between">
      <div>
        {/* Top Header Badge */}
        <div className="flex flex-col gap-1.5 mb-6">
          <div className="flex items-center">
            <YesDhobiLogo className="h-6.5 w-auto" />
          </div>
          <span className="text-[11px] font-medium text-slate-500">Vendor Registration</span>
        </div>

        {/* Title & Subtitle */}
        <h3 className="text-xl font-extrabold text-slate-900 tracking-tight mb-2 leading-snug">
          {info.title}
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed mb-6">
          {info.subtitle}
        </p>

        {/* Dynamic Graphic Container */}
        <div className="w-full rounded-xl overflow-hidden bg-white border border-blue-100 shadow-xs mb-6 relative">
          {info.type === 'illustration' ? (
            <div className="p-4 bg-[#F5F8FF] flex items-center justify-center">
              {/* Clean Vector illustration of worker at desk */}
              <svg className="w-full h-44" viewBox="0 0 300 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="300" height="180" rx="12" fill="#EEF4FF" />
                {/* Desk */}
                <rect x="50" y="110" width="200" height="10" rx="2" fill="#CBD5E1" />
                <rect x="70" y="120" width="8" height="40" fill="#94A3B8" />
                <rect x="220" y="120" width="8" height="40" fill="#94A3B8" />
                {/* Person */}
                <circle cx="170" cy="70" r="18" fill="#FDBA74" />
                <path d="M150 110C150 90 190 90 190 110" fill="#2563EB" />
                <rect x="180" y="80" width="50" height="30" rx="4" fill="#64748B" />
                <rect x="185" y="85" width="40" height="20" rx="2" fill="#60A5FA" />
                {/* Laundry basket */}
                <path d="M70 85L80 110H120L130 85H70Z" fill="#F87171" opacity="0.8" />
                <circle cx="95" cy="80" r="12" fill="#E2E8F0" />
                <circle cx="110" cy="78" r="14" fill="#93C5FD" />
              </svg>
            </div>
          ) : (
            <div className="relative h-44 bg-slate-800 overflow-hidden group">
              {/* Photo representation of modern laundry facility */}
              <svg className="w-full h-full object-cover" viewBox="0 0 400 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="400" height="200" fill="#1E293B" />
                {/* Washing machines row */}
                <g fill="#334155" stroke="#475569" strokeWidth="2">
                  <rect x="20" y="40" width="70" height="120" rx="6" />
                  <circle cx="55" cy="100" r="22" fill="#0F172A" stroke="#38BDF8" strokeWidth="3" />
                  <rect x="110" y="40" width="70" height="120" rx="6" />
                  <circle cx="145" cy="100" r="22" fill="#0F172A" stroke="#38BDF8" strokeWidth="3" />
                  <rect x="200" y="40" width="70" height="120" rx="6" />
                  <circle cx="235" cy="100" r="22" fill="#0F172A" stroke="#38BDF8" strokeWidth="3" />
                  <rect x="290" y="40" width="70" height="120" rx="6" />
                  <circle cx="325" cy="100" r="22" fill="#0F172A" stroke="#38BDF8" strokeWidth="3" />
                </g>
                <line x1="0" y1="170" x2="400" y2="170" stroke="#0EA5E9" strokeWidth="4" />
              </svg>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent flex items-end p-3">
                <span className="text-[11px] font-semibold text-white bg-slate-900/80 px-2.5 py-1 rounded-md backdrop-blur-xs">
                  Verified Facility Standard
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Step Badge Pill */}
        <div className="bg-white rounded-xl p-3.5 border border-blue-100 mb-4 shadow-2xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
              {typeof currentStep === 'number' ? currentStep : 5}
            </span>
            <span className="text-xs font-bold text-slate-900">{info.stepBadge}</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug pl-7">{info.stepDesc}</p>
        </div>
      </div>

      {/* Security Footer Badge */}
      <div className="bg-white/80 rounded-xl p-3 border border-blue-100 flex items-center gap-2.5">
        <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0" />
        <span className="text-[11px] font-semibold text-slate-600">
          Your information is encrypted and secure.
        </span>
      </div>
    </div>
  );
};
