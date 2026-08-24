import React from 'react';
import { RotateCw, ShieldCheck, Zap, Headphones, Briefcase } from 'lucide-react';

interface FooterProps {
  onStartRegistration?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onStartRegistration }) => {
  return (
    <footer className="w-full bg-[#060D20] text-slate-300 border-t border-slate-800 text-xs">
      {/* CTA Section */}
      <div className="bg-gradient-to-b from-[#0B1736] to-[#060D20] py-16 px-4 sm:px-6 lg:px-8 text-center border-b border-slate-800/80">
        <div className="max-w-4xl mx-auto space-y-6">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            Ready to Grow Your Laundry Business?
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
            Join thousands of partners already earning more with Yes Dhobi.
          </p>
          <div>
            <button
              onClick={onStartRegistration}
              className="bg-[#FFD600] hover:bg-yellow-400 text-slate-900 font-extrabold text-sm sm:text-base px-8 py-3.5 rounded-xl shadow-lg transition-all cursor-pointer transform hover:-translate-y-0.5"
            >
              Register as Partner
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-slate-300 font-medium pt-2">
            <span className="flex items-center gap-1.5"><span className="text-yellow-400 font-bold">✓</span> No Hidden Fees</span>
            <span className="flex items-center gap-1.5"><span className="text-yellow-400 font-bold">✓</span> Weekly Payouts</span>
            <span className="flex items-center gap-1.5"><span className="text-yellow-400 font-bold">✓</span> Partner Toolkit</span>
            <span className="flex items-center gap-1.5"><span className="text-yellow-400 font-bold">✓</span> 24/7 Support</span>
          </div>
        </div>
      </div>

      {/* Main Footer Links & Info */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Brand & Subtext */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center gap-3 text-white font-black text-xl">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
                <RotateCw className="w-5.5 h-5.5 stroke-[2.5]" />
              </div>
              <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Yes Dhobi
              </span>
            </div>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-lg">
              Connecting storefronts directly with thousands of household customers across your neighborhood daily.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-300 font-medium pt-1">
              <span className="flex items-center gap-1.5 bg-slate-950/40 px-3 py-1.5 rounded-lg border border-slate-800">
                <Zap className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                Secure Payouts
              </span>
              <span className="flex items-center gap-1.5 bg-slate-950/40 px-3 py-1.5 rounded-lg border border-slate-800">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                Verified Partner Network
              </span>
              <span className="flex items-center gap-1.5 bg-slate-950/40 px-3 py-1.5 rounded-lg border border-slate-800">
                <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
                24/7 Support
              </span>
              <span className="flex items-center gap-1.5 bg-slate-950/40 px-3 py-1.5 rounded-lg border border-slate-800">
                <Headphones className="w-3.5 h-3.5 text-purple-400" />
                Dedicated Onboarding
              </span>
            </div>
          </div>

          {/* Links columns */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-8 pt-2 lg:pt-0">
            <div>
              <h4 className="font-bold text-white text-sm mb-3">For Partners</h4>
              <ul className="space-y-2.5 text-xs text-slate-400">
                <li>
                  <button onClick={onStartRegistration} className="hover:text-white transition-colors cursor-pointer text-left">
                    Register
                  </button>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-white transition-colors">
                    Onboarding Guides
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white text-sm mb-3">Support</h4>
              <ul className="space-y-2.5 text-xs text-slate-400">
                <li>
                  <a href="#faq" className="hover:text-white transition-colors">
                    Help Center
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-white transition-colors">
                    Training Videos
                  </a>
                </li>
                <li>
                  <a href="#faq" className="hover:text-white transition-colors">
                    Contact Us
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Company Registration Details */}
        <div className="border-t border-slate-800/80 mt-10 pt-6 text-[11px] text-slate-400 space-y-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <span className="font-semibold text-slate-300">
              Vastra Solutions Private Limited
            </span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400">
              <span>CIN: <strong className="text-slate-300 font-medium">U96010TS2025PTC206837</strong></span>
              <span>GSTIN: <strong className="text-slate-300 font-medium">36AALCV6093Q1Z9</strong></span>
              <span>Contact: <a href="tel:+918501020205" className="text-slate-300 font-medium hover:text-yellow-400 transition-colors">+91 85010 20205</a></span>
            </div>
          </div>
          <p className="text-slate-400 text-[10px] leading-relaxed">
            Registered Office: H.No. 11-13-608/1, Road No. 17, Alkapuri Colony, Saroornagar, Ranga Reddy District, Hyderabad, Telangana - 500102.
          </p>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-slate-800/60 mt-4 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400">
          <div>
            © 2026 Yes Dhobi. All rights reserved by Vastra Solutions Private Limited.
          </div>
          <div className="flex items-center gap-6">
            <a href="#terms" className="hover:text-slate-200 transition-colors">Terms of Service</a>
            <a href="#privacy" className="hover:text-slate-200 transition-colors">Privacy Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
