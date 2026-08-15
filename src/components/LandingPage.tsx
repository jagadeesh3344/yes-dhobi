import React, { useState } from 'react';
import {
  Users,
  Wallet,
  Package,
  BookOpen,
  UserPlus,
  ShieldCheck,
  Smartphone,
  CreditCard,
  ChevronDown,
  Star,
  Play,
  CheckCircle2,
  Lock,
  Receipt,
  Headphones
} from 'lucide-react';
import { Header } from './Header';
import { Footer } from './Footer';
import heroLaundromatImg from '../assets/images/hero_commercial_laundromat_1786765792468.jpg';

interface LandingPageProps {
  onStartRegistration: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStartRegistration }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showDemoModal, setShowDemoModal] = useState(false);

  const faqs = [
    {
      q: 'How much can I earn?',
      a: 'Earnings depend on your capacity, location, and service quality. Most partners earn ₹40,000–₹80,000 monthly.'
    },
    {
      q: 'Is there any joining fee?',
      a: 'No, joining Yes Dhobi is 100% free with zero upfront fees or hidden charges.'
    },
    {
      q: 'How do I receive payments?',
      a: 'All earnings are directly deposited into your linked bank account every Monday via NEFT/UPI.'
    },
    {
      q: 'What if I don\'t have a shop?',
      a: 'You can still partner as a home-based Dhobi or independent ironing provider if you meet quality standards.'
    },
    {
      q: 'Do you provide training?',
      a: 'Yes, we provide free onboarding training, customer handling guides, and free detergent samples.'
    }
  ];

  return (
    <div className="w-full min-h-screen bg-white text-slate-900 flex flex-col font-sans">
      <Header onNavigateRegister={onStartRegistration} />

      {/* Hero Section */}
      <section className="w-full bg-[#0A1838] text-white py-16 sm:py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column Content */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 bg-[#1E293B] border border-slate-700/80 px-4 py-1.5 rounded-full shadow-inner">
              <span className="text-yellow-400 font-bold text-xs tracking-wide">#1 Platform for Indian Laundry Services</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1]">
              Get Daily Laundry Orders Without Searching for Customers
            </h1>

            <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
              Join 5,000+ laundry partners across India earning ₹40,000–₹80,000 monthly with guaranteed weekly payouts.
            </p>

            <div className="pt-2 flex flex-col items-start gap-4">
              <button
                onClick={onStartRegistration}
                className="bg-[#FFD600] hover:bg-yellow-400 text-slate-900 font-extrabold text-base sm:text-lg px-8 sm:px-10 py-4 sm:py-4.5 rounded-xl shadow-lg transition-all cursor-pointer transform hover:-translate-y-0.5"
              >
                Register as Partner
              </button>
              <button
                onClick={() => setShowDemoModal(true)}
                className="flex items-center gap-2.5 text-slate-200 hover:text-white font-medium text-sm pt-1 transition-colors cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-300 group-hover:border-slate-400 group-hover:bg-slate-700 transition-colors">
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                </div>
                <span>Watch 2-minute Demo</span>
              </button>
            </div>
          </div>

          {/* Right Column Commercial Laundromat Graphic Frame */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end items-center">
            <div className="w-full max-w-md lg:max-w-lg rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden bg-slate-900 relative aspect-[4/3] sm:aspect-[1/1] lg:aspect-[4/3]">
              <img
                src={heroLaundromatImg}
                alt="Modern commercial laundry washing machines and laundromat facility"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* Statistics Bar */}
      <section className="w-full bg-white border-b border-slate-200 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">30+</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">LAUNDRY PARTNERS</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">01</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">CITIES ACROSS INDIA</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">10K+</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">ORDERS PROCESSED</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">₹30 Lakhs+</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">PAID TO PARTNERS</div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="w-full py-20 bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">WHY JOIN YES DHOBI</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-1">
              Benefits that grow your business
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center mb-5">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 mb-2">
                Receive 15-30 New Orders Every Week
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                We connect you with your awaiting orders.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center mb-5">
                <Wallet className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 mb-2">
                Guaranteed Weekly Payouts
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                No chasing payments. Money hits your bank every Monday.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center mb-5">
                <Package className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 mb-2">
                We Deliver Premium Detergents to Your Shop Every Month
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Supplies that goes good on the fabrics and light on your pockets
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center mb-5">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 mb-2">
                Free Business Training & Support
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Learn pricing, customer service, and grow your business.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works / Easy Onboarding */}
      <section id="how-it-works" className="w-full py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">EASY ONBOARDING</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-1">
              How to Start Earning in 4 Simple Steps
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-[#F8FAFC] p-6 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-400">01</span>
              </div>
              <h4 className="text-base font-extrabold text-slate-900 mb-2">Register</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Fill your personal and shop details online.
              </p>
            </div>

            <div className="bg-[#F8FAFC] p-6 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-400">02</span>
              </div>
              <h4 className="text-base font-extrabold text-slate-900 mb-2">Get Verified</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Easy physical Aadhaar & shop check in 24 hours.
              </p>
            </div>

            <div className="bg-[#F8FAFC] p-6 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-400">03</span>
              </div>
              <h4 className="text-base font-extrabold text-slate-900 mb-2">Receive Orders</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Get automated pickup alerts near your location.
              </p>
            </div>

            <div className="bg-[#F8FAFC] p-6 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-400">04</span>
              </div>
              <h4 className="text-base font-extrabold text-slate-900 mb-2">Earn Weekly</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Deliver clean clothes and get direct bank payouts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Success Stories */}
      <section id="success-stories" className="w-full py-20 bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">PARTNER SUCCESS STORIES</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-1">
              Empowering Laundry Partners Across India to Earn 3x More
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div>
                <p className="text-sm text-slate-700 italic leading-relaxed mb-6">
                  "Before Yes Dhobi, I relied only on local street walk-ins. Now I have regular contracts with 3 major luxury residential complexes. My monthly income has tripled!"
                </p>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm">
                    RK
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-slate-900">Ramesh Kumar</h5>
                    <span className="text-xs text-slate-500">Mumbai Partner</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-amber-400 mb-6">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400" />
                  ))}
                </div>
              </div>
              <div className="bg-[#DCFCE7] text-[#166534] px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2">
                <span>Before Joining: ₹18,000/month</span>
                <span>↗</span>
                <span>After Joining: ₹54,000/month</span>
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div>
                <p className="text-sm text-slate-700 italic leading-relaxed mb-6">
                  "The digital order system is so simple. My son manages the app, and I focus on high-quality ironing. Payouts are perfectly on time every single Tuesday."
                </p>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm">
                    HP
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-slate-900">Harishchandra Prasad</h5>
                    <span className="text-xs text-slate-500">Delhi NCR Partner</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-amber-400 mb-6">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400" />
                  ))}
                </div>
              </div>
              <div className="bg-[#DCFCE7] text-[#166534] px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2">
                <span>Before Joining: ₹22,000/month</span>
                <span>↗</span>
                <span>After Joining: ₹68,000/month</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="w-full py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">FAQ</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-1">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="border border-slate-200 rounded-xl overflow-hidden bg-[#F8FAFC] transition-all"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between font-bold text-sm sm:text-base text-slate-900 hover:bg-slate-100/50 cursor-pointer"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-200/60 bg-white">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Footer onStartRegistration={onStartRegistration} />

      {/* Demo Video Modal */}
      {showDemoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-xl w-full text-white space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base">Yes Dhobi Partner Onboarding Walkthrough</h3>
              <button
                onClick={() => setShowDemoModal(false)}
                className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video bg-slate-950 rounded-xl flex items-center justify-center border border-slate-800 relative">
              <div className="text-center p-6 space-y-3">
                <div className="w-14 h-14 rounded-full bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 flex items-center justify-center mx-auto animate-pulse">
                  <Play className="w-6 h-6 fill-current ml-1" />
                </div>
                <h4 className="font-bold text-sm text-slate-200">2-Minute Partner Onboarding Overview</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Learn how simple it is to register your shop, upload document IDs, configure service pricing, and receive weekly payouts.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowDemoModal(false);
                onStartRegistration();
              }}
              className="w-full bg-[#FFD600] text-slate-900 font-extrabold py-3.5 rounded-xl hover:bg-yellow-400 text-sm cursor-pointer"
            >
              Proceed to Registration
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
