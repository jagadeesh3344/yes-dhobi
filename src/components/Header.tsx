import React from 'react';
import { RotateCw, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  onNavigateHome?: () => void;
  onNavigateRegister?: () => void;
  currentStep?: number | 'success' | null;
}

export const Header: React.FC<HeaderProps> = ({
  onNavigateHome,
  onNavigateRegister,
  currentStep
}) => {
  return (
    <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-3 text-left focus:outline-none cursor-pointer group"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:bg-blue-700 transition-colors">
            <RotateCw className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Yes Dhobi
            </span>
          </div>
        </button>

        {/* Center Nav Links (only on Home view) */}
        {!currentStep && (
          <nav className="hidden md:flex items-center space-x-8 text-sm font-semibold text-slate-600">
            <a href="#how-it-works" className="hover:text-blue-600 transition-colors">
              How It Works
            </a>
            <a href="#benefits" className="hover:text-blue-600 transition-colors">
              Benefits
            </a>
            <a href="#success-stories" className="hover:text-blue-600 transition-colors">
              Success Stories
            </a>
            <a href="#faq" className="hover:text-blue-600 transition-colors">
              FAQ
            </a>
          </nav>
        )}

        {/* Right Action Button */}
        <div className="flex items-center gap-3">
          {currentStep ? (
            <button
              onClick={onNavigateHome}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              ← Back to Home
            </button>
          ) : (
            <button
              onClick={onNavigateRegister}
              className="bg-[#1D4ED8] hover:bg-blue-800 text-white font-bold text-sm sm:text-base px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-2"
            >
              Register as Partner
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
