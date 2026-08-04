import React from 'react';
import { Shirt, Sparkles, Flame, Shield, Footprints, Droplets, Layers, Zap } from 'lucide-react';
import { RegistrationFormData, ServiceItem } from '../../types';

interface Step3Props {
  formData: RegistrationFormData;
  toggleService: (serviceId: string) => void;
  updateServicePrice: (serviceId: string, price: number) => void;
  updateFormData: (fields: Partial<RegistrationFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const getServiceIcon = (id: string) => {
  switch (id) {
    case 'wash_fold':
      return <Shirt className="w-5 h-5 text-blue-600" />;
    case 'wash_iron':
      return <Zap className="w-5 h-5 text-blue-600" />;
    case 'steam_iron':
      return <Flame className="w-5 h-5 text-blue-600" />;
    case 'dry_iron':
      return <Flame className="w-5 h-5 text-blue-600" />;
    case 'dry_cleaning':
      return <Sparkles className="w-5 h-5 text-blue-600" />;
    case 'shoe_cleaning':
      return <Footprints className="w-5 h-5 text-blue-600" />;
    case 'stain_removal':
      return <Shield className="w-5 h-5 text-slate-500" />;
    case 'households':
    case 'wet_cleaning':
      return <Droplets className="w-5 h-5 text-slate-500" />;
    default:
      return <Layers className="w-5 h-5 text-blue-600" />;
  }
};

export const Step3ServicePricing: React.FC<Step3Props> = ({
  formData,
  toggleService,
  updateServicePrice,
  updateFormData,
  onNext,
  onBack
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  const servicesList = Object.values(formData.services || {}) as ServiceItem[];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Select Services You Offer
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Toggle on services and set your pricing parameters. Only toggled ON services will be assigned.
        </p>
      </div>

      {/* Services List */}
      <div className="space-y-4">
        {servicesList.map((service) => {
          const isEnabled = service.enabled;
          return (
            <div
              key={service.id}
              className={`rounded-2xl border p-5 transition-all ${
                isEnabled
                  ? 'border-blue-600 bg-white shadow-xs ring-1 ring-blue-600/20'
                  : 'border-slate-200 bg-slate-50/50 opacity-80'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isEnabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {getServiceIcon(service.id)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{service.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{service.description}</p>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  onClick={() => toggleService(service.id)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 focus:outline-none cursor-pointer ${
                    isEnabled ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5 transition-transform ${
                      isEnabled ? 'left-6.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Price Field (when enabled) */}
              {isEnabled && (
                <div className="mt-4 pt-4 border-t border-slate-100 max-w-sm">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    {service.unit} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={service.price}
                    onChange={(e) => updateServicePrice(service.id, parseFloat(e.target.value) || 0)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 font-semibold"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Turnaround & Delivery Times Box */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h4 className="text-xs font-bold text-slate-900 mb-3">Turnaround & Delivery Times</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Standard Delivery Time <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.standardDeliveryTime}
              onChange={(e) => updateFormData({ standardDeliveryTime: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">Select Delivery Time</option>
              <option value="24 Hours">24 Hours</option>
              <option value="48 Hours">48 Hours</option>
              <option value="72 Hours">72 Hours</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-800">
                Offer Express Delivery?
              </label>
              <button
                type="button"
                onClick={() => updateFormData({ offerExpressDelivery: !formData.offerExpressDelivery })}
                className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                  formData.offerExpressDelivery ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full bg-white shadow-md absolute top-0.5 transition-transform ${
                    formData.offerExpressDelivery ? 'left-5.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            <input
              type="text"
              disabled={!formData.offerExpressDelivery}
              value={formData.expressPriceMarkup}
              onChange={(e) => updateFormData({ expressPriceMarkup: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </div>
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
        <button
          type="submit"
          className="w-full sm:w-auto bg-[#FFD600] hover:bg-yellow-400 text-slate-900 font-bold px-8 py-3.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 text-sm"
        >
          <span>Next: Location Details</span>
          <span>→</span>
        </button>
      </div>
    </form>
  );
};
