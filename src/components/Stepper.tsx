import React from 'react';
import { Check } from 'lucide-react';
import { RegistrationStep } from '../types';

interface StepperProps {
  currentStep: RegistrationStep;
  onStepClick?: (step: number) => void;
}

const steps = [
  { id: 1, label: '1. Personal Details' },
  { id: 2, label: '2. Business Details' },
  { id: 3, label: '3. Service & Pricing' },
  { id: 4, label: '4. Location' },
  { id: 5, label: '5. Documents & Verification' }
];

export const Stepper: React.FC<StepperProps> = ({ currentStep, onStepClick }) => {
  if (currentStep === 'success') return null;

  const activeNum = typeof currentStep === 'number' ? currentStep : 5;

  return (
    <div className="w-full max-w-6xl mx-auto mb-8 px-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3 sm:p-4 overflow-x-auto scrollbar-none">
        <div className="flex items-center justify-between min-w-[720px] relative">
          {steps.map((step) => {
            const isCompleted = activeNum > step.id;
            const isActive = activeNum === step.id;

            return (
              <button
                key={step.id}
                onClick={() => isCompleted && onStepClick && onStepClick(step.id)}
                disabled={!isCompleted}
                className={`flex flex-col items-center flex-1 py-2 px-1 relative cursor-pointer transition-colors text-xs sm:text-sm font-semibold text-center ${
                  isActive
                    ? 'text-blue-700 font-bold'
                    : isCompleted
                    ? 'text-blue-600 hover:text-blue-800'
                    : 'text-slate-400 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-1.5 justify-center mb-1">
                  {isCompleted && (
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                      ✓
                    </span>
                  )}
                  <span>{step.label}</span>
                </div>
                {/* Active step bar indicator */}
                {isActive && (
                  <div className="absolute bottom-0 left-2 right-2 h-1 bg-blue-700 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
