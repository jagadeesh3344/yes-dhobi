import React, { useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';

interface InteractiveMapProps {
  pickupAddress: string;
  landmark: string;
  pincode: string;
  city: string;
  state: string;
  serviceRadius: string;
  serviceAreas: string[];
  workingDays: string[];
  workingHoursFrom: string;
  workingHoursTo: string;
  errors?: Record<string, string>;
  onAddressChange: (val: string) => void;
  onLandmarkChange: (val: string) => void;
  onPincodeChange: (val: string) => void;
  onCityChange: (val: string) => void;
  onStateChange: (val: string) => void;
  onRadiusChange: (val: string) => void;
  onAreasChange: (areas: string[]) => void;
  onDaysChange: (days: string[]) => void;
  onHoursFromChange: (val: string) => void;
  onHoursToChange: (val: string) => void;
}

const availableZones = [
  'Lajpat Nagar',
  'Saket',
  'Hauz Khas',
  'Karol Bagh',
  'Dwarka',
  'Rohini',
  'Connaught Place',
  'Janakpuri',
  'Vasant Kunj',
  'Greater Kailash'
];

const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const postalMap: Record<string, { city: string; state: string }> = {
  '11': { city: 'New Delhi', state: 'Delhi' },
  '12': { city: 'Faridabad / Gurgaon', state: 'Haryana' },
  '13': { city: 'Ambala', state: 'Haryana' },
  '14': { city: 'Ludhiana', state: 'Punjab' },
  '16': { city: 'Chandigarh', state: 'Punjab / Chandigarh' },
  '18': { city: 'Jammu', state: 'Jammu & Kashmir' },
  '19': { city: 'Srinagar', state: 'Jammu & Kashmir' },
  '20': { city: 'Noida / Ghaziabad', state: 'Uttar Pradesh' },
  '22': { city: 'Lucknow', state: 'Uttar Pradesh' },
  '24': { city: 'Dehradun', state: 'Uttarakhand' },
  '30': { city: 'Jaipur', state: 'Rajasthan' },
  '38': { city: 'Ahmedabad', state: 'Gujarat' },
  '39': { city: 'Surat', state: 'Gujarat' },
  '40': { city: 'Mumbai', state: 'Maharashtra' },
  '41': { city: 'Pune', state: 'Maharashtra' },
  '50': { city: 'Hyderabad', state: 'Telangana' },
  '51': { city: 'Tirupati', state: 'Andhra Pradesh' },
  '52': { city: 'Vijayawada', state: 'Andhra Pradesh' },
  '53': { city: 'Visakhapatnam', state: 'Andhra Pradesh' },
  '56': { city: 'Bengaluru', state: 'Karnataka' },
  '60': { city: 'Chennai', state: 'Tamil Nadu' },
  '68': { city: 'Kochi', state: 'Kerala' },
  '69': { city: 'Thiruvananthapuram', state: 'Kerala' },
  '70': { city: 'Kolkata', state: 'West Bengal' },
  '78': { city: 'Guwahati', state: 'Assam' },
  '80': { city: 'Patna', state: 'Bihar' },
  '83': { city: 'Ranchi', state: 'Jharkhand' },
  '46': { city: 'Bhopal', state: 'Madhya Pradesh' },
  '45': { city: 'Indore', state: 'Madhya Pradesh' },
  '75': { city: 'Bhubaneswar', state: 'Odisha' },
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  pickupAddress,
  landmark,
  pincode,
  city,
  state,
  serviceRadius,
  serviceAreas,
  workingDays,
  workingHoursFrom,
  workingHoursTo,
  errors = {},
  onAddressChange,
  onLandmarkChange,
  onPincodeChange,
  onCityChange,
  onStateChange,
  onRadiusChange,
  onAreasChange,
  onDaysChange,
  onHoursFromChange,
  onHoursToChange
}) => {
  const [pinPos, setPinPos] = useState({ x: 50, y: 50 });

  const toggleZone = (zone: string) => {
    if (serviceAreas.includes(zone)) {
      onAreasChange(serviceAreas.filter((z) => z !== zone));
    } else {
      onAreasChange([...serviceAreas, zone]);
    }
  };

  const toggleDay = (day: string) => {
    if (workingDays.includes(day)) {
      onDaysChange(workingDays.filter((d) => d !== day));
    } else {
      onDaysChange([...workingDays, day]);
    }
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPinPos({ x: Math.max(10, Math.min(90, x)), y: Math.max(15, Math.min(85, y)) });
  };

  const handlePincodeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 6);
    onPincodeChange(raw);

    if (raw.length >= 2) {
      const prefix = raw.slice(0, 2);
      if (postalMap[prefix]) {
        if (!city) onCityChange(postalMap[prefix].city);
        if (!state) onStateChange(postalMap[prefix].state);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Address & Landmark */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Shop / Pickup Address <span className="text-red-500">*</span>
        </label>
        <textarea
          value={pickupAddress}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="Full address where customers drop off or rider collects"
          rows={3}
          className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none transition-colors ${
            errors.pickupAddress
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
              : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
          }`}
        />
        {errors.pickupAddress && (
          <p className="text-[11px] text-red-600 font-medium mt-1">{errors.pickupAddress}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Landmark <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={landmark}
          onChange={(e) => onLandmarkChange(e.target.value)}
          placeholder="Near metro station, temple, market, etc."
          className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none transition-colors ${
            errors.landmark
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
              : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
          }`}
        />
        {errors.landmark && (
          <p className="text-[11px] text-red-600 font-medium mt-1">{errors.landmark}</p>
        )}
      </div>

      {/* Pin code, City, State Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Pin Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={pincode}
            onChange={handlePincodeInput}
            placeholder="e.g. 500001"
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none transition-colors ${
              errors.locationPincode
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          />
          {errors.locationPincode && (
            <p className="text-[11px] text-red-600 font-medium mt-1">{errors.locationPincode}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            City <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            placeholder="e.g. Hyderabad"
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none transition-colors ${
              errors.locationCity
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          />
          {errors.locationCity && (
            <p className="text-[11px] text-red-600 font-medium mt-1">{errors.locationCity}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            State <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={state}
            onChange={(e) => onStateChange(e.target.value)}
            placeholder="e.g. Telangana"
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none transition-colors ${
              errors.locationState
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                : 'border-slate-200 focus:ring-2 focus:ring-blue-600'
            }`}
          />
          {errors.locationState && (
            <p className="text-[11px] text-red-600 font-medium mt-1">{errors.locationState}</p>
          )}
        </div>
      </div>

      {/* Interactive Pin Location Map */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Exact Pin Location <span className="text-red-500">*</span>
        </label>
        <div
          onClick={handleMapClick}
          className="relative w-full h-64 bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden cursor-crosshair select-none group shadow-inner"
        >
          {/* Simulated Google Map Canvas styling */}
          <div className="absolute inset-0 bg-[#E5E3DF] opacity-90">
            {/* Map Roads & Blocks Vector pattern */}
            <svg className="w-full h-full opacity-60" viewBox="0 0 600 300">
              <rect x="0" y="0" width="600" height="300" fill="#E5E3DF" />
              <path d="M0 100 Q150 120 300 80 T600 150" stroke="#FFFFFF" strokeWidth="24" fill="none" />
              <path d="M100 0 V300" stroke="#FFFFFF" strokeWidth="18" fill="none" />
              <path d="M400 0 V300" stroke="#FFFFFF" strokeWidth="14" fill="none" />
              <path d="M250 0 L250 300" stroke="#FDE68A" strokeWidth="10" fill="none" />
              <circle cx="300" cy="150" r="110" fill="#93C5FD" opacity="0.15" />
            </svg>
          </div>

          {/* Draggable Marker Pin */}
          <div
            style={{ left: `${pinPos.x}%`, top: `${pinPos.y}%` }}
            className="absolute transform -translate-x-1/2 -translate-y-full flex flex-col items-center z-10 transition-all duration-75 pointer-events-none"
          >
            <div className="bg-slate-900 text-white font-bold text-[11px] px-3 py-1 rounded-md shadow-lg flex items-center gap-1.5 mb-1 whitespace-nowrap">
              <Navigation className="w-3 h-3 text-blue-400" />
              <span>Tap on map to place pin</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-xl flex items-center justify-center text-white">
              <MapPin className="w-5 h-5 fill-white text-blue-600" />
            </div>
            <div className="w-2 h-2 rounded-full bg-blue-600/40 animate-ping mt-0.5" />
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          Tap anywhere on map canvas to set your location coordinates for rider route planning.
        </p>
      </div>

      {/* Service Radius */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Service Radius <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-3">
          {['1 km', '2 km', '3 km', '5 km', '10 km'].map((r) => {
            const isSelected = serviceRadius === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onRadiusChange(r)}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all border ${
                  isSelected
                    ? 'bg-[#1D4ED8] text-white border-blue-700 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          How far can you provide pickup & delivery?
        </p>
      </div>

      {/* Service Area Zones */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Service Area Zones
        </label>
        <div className="flex flex-wrap gap-2">
          {availableZones.map((zone) => {
            const isSelected = serviceAreas.includes(zone);
            return (
              <button
                key={zone}
                type="button"
                onClick={() => toggleZone(zone)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  isSelected
                    ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                {zone}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">Select specific zones you service</p>
      </div>

      {/* Working Days */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Working Days <span className="text-red-500">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {allDays.map((day) => {
            const isSelected = workingDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`w-11 h-10 rounded-xl text-xs font-bold transition-all border ${
                  isSelected
                    ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
        {errors.workingDays && (
          <p className="text-[11px] text-red-600 font-medium mt-1">{errors.workingDays}</p>
        )}
      </div>

      {/* Working Hours */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Working Hours <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div>
            <span className="text-[11px] text-slate-500 block mb-1">From</span>
            <input
              type="text"
              value={workingHoursFrom}
              onChange={(e) => onHoursFromChange(e.target.value)}
              placeholder="08:00 AM"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block mb-1">To</span>
            <input
              type="text"
              value={workingHoursTo}
              onChange={(e) => onHoursToChange(e.target.value)}
              placeholder="08:00 PM"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
