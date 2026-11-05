import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, Loader2, CheckCircle2, Crosshair, Building, X, AlertCircle } from 'lucide-react';

interface InteractiveMapProps {
  pickupAddress: string;
  exactShopLocation?: string;
  landmark: string;
  pincode: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  serviceRadius: string;
  serviceAreas: string[];
  workingDays: string[];
  workingHoursFrom: string;
  workingHoursTo: string;
  errors?: Record<string, string>;
  onAddressChange: (val: string) => void;
  onExactShopLocationChange?: (val: string) => void;
  onLocationCoordinatesChange: (lat: number, lng: number) => void;
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
  'Greater Kailash',
  'Madhapur',
  'Gachibowli',
  'Banjara Hills',
  'Jubilee Hills',
  'Kukatpally',
  'Hitec City',
  'Kondapur',
  'Ameerpet',
  'Secunderabad'
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

const AWS_LOCATION_KEY =
  'v1.public.eyJqdGkiOiIzNDgzZTFjMC01N2ZjLTRkZTYtODM0OS0xYzE4ZTRiNTIwZDcifYygLYhkH3uJ1gQKmlS63fWlZqkzwuWBrKS09slqUhs-pQTyD6lY8hmpmVwlPi3WIInOUSs8oc7hGvd_NJwLf6SlKaBh1Ci7fHCtKVWlyGVCnQzg4gNF1oc-tWI_4UO2j9Ghu-TGuII60MboUZBMSCKijerOKdWx3Q05pVF8FrhND80Kjjxl80Ezd67P9sqvVLqyE3HvSc4bvT0AWwg7wo0NM0YB7YfnIoTxpR40Kl10Y4PquQ9BT1Nk1gGWfCAnEWdkqHGNEQqZdHzlewr6bQXyuLSzKfpdHINmUmY6vusKQ9YuDMVsar7EkPs-RszYKQz54G19scq83LHvBx2KfSc.Njg1MGZlZTUtYTI2ZS00MDdlLWJjNDktMDNmZDlkNzVmMjQ0';
const AWS_REGION = 'ap-south-1';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  fullAddress: string;
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  pincode?: string;
  district?: string;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  pickupAddress,
  exactShopLocation = '',
  landmark,
  pincode,
  city,
  state,
  lat,
  lng,
  serviceRadius,
  serviceAreas,
  workingDays,
  workingHoursFrom,
  workingHoursTo,
  errors = {},
  onAddressChange,
  onExactShopLocationChange,
  onLocationCoordinatesChange,
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
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const searchDebounceRef = useRef<any>(null);

  const [searchQuery, setSearchQuery] = useState(exactShopLocation || pickupAddress || '');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [locationNotice, setLocationNotice] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  // Fallback pin position if Leaflet tiles are still initializing
  const [fallbackPin, setFallbackPin] = useState({ x: 50, y: 50 });

  // Sync search input if exactShopLocation prop changes from outside
  useEffect(() => {
    if (exactShopLocation && !searchQuery) {
      setSearchQuery(exactShopLocation);
    }
  }, [exactShopLocation]);

  // Check if Leaflet is available on window
  useEffect(() => {
    const checkLeaflet = () => {
      if ((window as any).L) {
        setLeafletLoaded(true);
      }
    };
    checkLeaflet();
    const interval = setInterval(checkLeaflet, 200);
    const timeout = setTimeout(() => clearInterval(interval), 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  // Initialize or update Leaflet Map
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapContainerRef.current) return;

    const currentLat = lat || 17.3850;
    const currentLng = lng || 78.4867;

    if (!mapInstanceRef.current) {
      try {
        const map = L.map(mapContainerRef.current, {
          center: [currentLat, currentLng],
          zoom: 15,
          zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        // Custom styled marker
        const customIcon = L.divIcon({
          className: 'custom-map-marker',
          html: `
            <div style="position: relative; transform: translate(-50%, -100%);">
              <div style="background-color: #0F172A; color: white; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); white-space: nowrap; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                <span>📍 Shop Entrance</span>
              </div>
              <div style="width: 32px; height: 32px; border-radius: 50%; background: #1D4ED8; border: 2.5px solid white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div style="width: 8px; height: 8px; background: #1D4ED8; border-radius: 50%; opacity: 0.6; margin: 2px auto 0 auto;"></div>
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const marker = L.marker([currentLat, currentLng], {
          draggable: true,
          icon: customIcon,
        }).addTo(map);

        // Marker drag handler
        marker.on('dragend', () => {
          const newPos = marker.getLatLng();
          handleCoordinatesUpdate(newPos.lat, newPos.lng, true);
        });

        // Map click handler
        map.on('click', (e: any) => {
          marker.setLatLng(e.latlng);
          handleCoordinatesUpdate(e.latlng.lat, e.latlng.lng, true);
        });

        mapInstanceRef.current = map;
        markerInstanceRef.current = marker;

        // Force tile redraw after container layout
        setTimeout(() => map.invalidateSize(), 250);
      } catch (err) {
        console.warn('Leaflet initialization warning:', err);
      }
    } else {
      // Pan to updated coordinates
      try {
        const marker = markerInstanceRef.current;
        const map = mapInstanceRef.current;
        if (marker && map) {
          marker.setLatLng([currentLat, currentLng]);
          map.panTo([currentLat, currentLng]);
        }
      } catch (_) {}
    }
  }, [leafletLoaded, lat, lng]);

  // Handle coordinates update with reverse-geocoding via AWS Location Service + Nominatim fallback
  const handleCoordinatesUpdate = async (newLat: number, newLng: number, reverseGeocode = true) => {
    onLocationCoordinatesChange(newLat, newLng);

    if (reverseGeocode) {
      // 1. Try AWS Location Reverse-Geocode
      try {
        const url = `https://places.geo.${AWS_REGION}.amazonaws.com/v2/reverse-geocode?key=${AWS_LOCATION_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            QueryPosition: [newLng, newLat],
            MaxResults: 1,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const first = data.ResultItems?.[0];
          if (first) {
            const addr = first.Address || {};
            const title = first.Title || addr.Label?.split(',')[0] || 'Selected Shop Location';
            const full = addr.Label || title;

            setSearchQuery(title);
            if (onExactShopLocationChange) onExactShopLocationChange(full);
            if (!pickupAddress) onAddressChange(full);

            const locality = addr.Locality || addr.SubRegion?.Name || addr.District;
            const region = addr.Region?.Name || addr.Region?.Code;
            const postal = addr.PostalCode;

            if (locality && !city) onCityChange(locality);
            if (region && !state) onStateChange(region);
            if (postal && !pincode && /^\d{6}$/.test(postal)) onPincodeChange(postal);
            return;
          }
        }
      } catch (e) {
        console.warn('AWS reverse geocode error:', e);
      }

      // 2. Fallback to Nominatim Reverse-Geocode
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        if (data && data.display_name) {
          const title = data.display_name.split(',').slice(0, 3).join(', ').trim();
          setSearchQuery(title);
          if (onExactShopLocationChange) onExactShopLocationChange(title);
          if (!pickupAddress) onAddressChange(data.display_name);

          const addr = data.address || {};
          const detectedCity = addr.city || addr.town || addr.village || addr.state_district;
          const detectedState = addr.state;
          const detectedPostcode = addr.postcode;

          if (detectedCity && !city) onCityChange(detectedCity);
          if (detectedState && !state) onStateChange(detectedState);
          if (detectedPostcode && !pincode && /^\d{6}$/.test(detectedPostcode)) {
            onPincodeChange(detectedPostcode);
          }
        }
      } catch (err) {
        console.warn('Reverse geocode fallback error:', err);
      }
    }
  };

  // Search places via AWS Places API + Nominatim fallback
  const handleSearch = async (queryText: string) => {
    const q = queryText.trim();
    if (!q || q.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setShowDropdown(true);
    setHasSearched(true);

    const biasLng = lng || 78.4867;
    const biasLat = lat || 17.3850;

    // 1. Try AWS Location Service Places API Search-Text
    try {
      const url = `https://places.geo.${AWS_REGION}.amazonaws.com/v2/search-text?key=${AWS_LOCATION_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          QueryText: q,
          BiasPosition: [biasLng, biasLat],
          MaxResults: 6,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.ResultItems) && data.ResultItems.length > 0) {
          const results: SearchResult[] = data.ResultItems.map((item: any) => {
            const addr = item.Address || {};
            const locality = addr.Locality || addr.SubRegion?.Name || addr.District || '';
            const region = addr.Region?.Name || addr.Region?.Code || '';
            const postal = addr.PostalCode || '';
            const district = addr.District || addr.SubDistrict || '';
            return {
              id: item.PlaceId || Math.random().toString(),
              title: item.Title || addr.Label?.split(',')[0] || q,
              subtitle: addr.Label || `${locality}, ${region}`,
              fullAddress: addr.Label || item.Title || q,
              lat: item.Position[1],
              lng: item.Position[0],
              city: locality,
              state: region,
              pincode: postal,
              district,
            };
          });
          setSearchResults(results);
          setIsSearching(false);
          return;
        }
      }
    } catch (e) {
      console.warn('AWS Places search error:', e);
    }

    // 2. Fallback to OpenStreetMap Nominatim
    try {
      const encoded = encodeURIComponent(q);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=in&limit=6&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const results: SearchResult[] = data.map((item: any) => ({
          id: String(item.place_id),
          title: item.display_name.split(',')[0],
          subtitle: item.display_name,
          fullAddress: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          city: item.address?.city || item.address?.town || item.address?.village,
          state: item.address?.state,
          pincode: item.address?.postcode,
          district: item.address?.suburb || item.address?.road,
        }));
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (e) {
      console.warn('Location search error:', e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (val: string) => {
    setSearchQuery(val);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    if (val.trim().length >= 2) {
      searchDebounceRef.current = setTimeout(() => {
        handleSearch(val);
      }, 350);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
      setHasSearched(false);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    setSearchQuery(result.title);
    setShowDropdown(false);

    if (onExactShopLocationChange) {
      onExactShopLocationChange(result.fullAddress || result.title);
    }
    if (!pickupAddress) {
      onAddressChange(result.fullAddress || result.title);
    }

    // Auto-fill city / state / pincode / landmark
    if (result.city && !city) onCityChange(result.city);
    if (result.state && !state) onStateChange(result.state);
    if (result.pincode && !pincode && /^\d{6}$/.test(result.pincode)) {
      onPincodeChange(result.pincode);
    }
    if (result.district && !landmark) {
      onLandmarkChange(result.district);
    }

    // Center map & move marker
    onLocationCoordinatesChange(result.lat, result.lng);
    if (mapInstanceRef.current && markerInstanceRef.current) {
      try {
        markerInstanceRef.current.setLatLng([result.lat, result.lng]);
        mapInstanceRef.current.flyTo([result.lat, result.lng], 16, { duration: 1.2 });
      } catch (_) {}
    }
  };

  // Detect current location via browser GPS + IP fallback
  const handleDetectCurrentLocation = () => {
    setIsLocating(true);
    setLocationNotice(null);

    const applyCoords = (detectedLat: number, detectedLng: number, source: string) => {
      setIsLocating(false);
      onLocationCoordinatesChange(detectedLat, detectedLng);
      handleCoordinatesUpdate(detectedLat, detectedLng, true);

      if (mapInstanceRef.current && markerInstanceRef.current) {
        try {
          markerInstanceRef.current.setLatLng([detectedLat, detectedLng]);
          mapInstanceRef.current.flyTo([detectedLat, detectedLng], 16, { duration: 1.2 });
        } catch (_) {}
      }
      setLocationNotice({
        type: 'success',
        text: `Location detected via ${source}: (${detectedLat.toFixed(4)}, ${detectedLng.toFixed(4)})`,
      });
      setTimeout(() => setLocationNotice(null), 4000);
    };

    const fallbackIpLocation = async () => {
      try {
        const res = await fetch('https://ipwho.is/');
        if (res.ok) {
          const data = await res.json();
          if (data.success && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
            applyCoords(data.latitude, data.longitude, `${data.city || 'Network'} GPS`);
            return;
          }
        }
      } catch (_) {}
      setIsLocating(false);
      setLocationNotice({
        type: 'info',
        text: 'GPS auto-detect unavailable. Type your shop or apartment name in the search box above.',
      });
      setTimeout(() => setLocationNotice(null), 5000);
    };

    if (!navigator.geolocation) {
      fallbackIpLocation();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyCoords(pos.coords.latitude, pos.coords.longitude, 'Device GPS');
      },
      () => {
        // High accuracy timed out or denied, try low-accuracy
        navigator.geolocation.getCurrentPosition(
          (pos2) => {
            applyCoords(pos2.coords.latitude, pos2.coords.longitude, 'Browser GPS');
          },
          () => {
            // Geolocation not available on desktop PC without GPS sensor, fallback to IP location
            fallbackIpLocation();
          },
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 30000 }
    );
  };

  const handleFallbackMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setFallbackPin({ x: Math.max(10, Math.min(90, x)), y: Math.max(15, Math.min(85, y)) });
  };

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
      {/* 1. Address & Landmark */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          Shop / Pickup Address <span className="text-red-500">*</span>
        </label>
        <textarea
          value={pickupAddress}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="e.g. Hema Soudha Apartments, Shop 4, Ground Floor"
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

      {/* 2. Pin code, City, State Grid */}
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
            placeholder="e.g. 500013"
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

      {/* 3. Exact Shop Location Search & Interactive Map Canvas */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <label className="block text-xs font-bold text-slate-800">
            Exact Shop Location & Pin Point <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={handleDetectCurrentLocation}
            disabled={isLocating}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors w-fit cursor-pointer"
          >
            {isLocating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            ) : (
              <Crosshair className="w-3.5 h-3.5 text-blue-600" />
            )}
            <span>Use My Current Location</span>
          </button>
        </div>

        {/* Location Notice (GPS / IP Detection feedback) */}
        {locationNotice && (
          <div
            className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in ${
              locationNotice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-medium">{locationNotice.text}</span>
          </div>
        )}

        {/* Search Bar Input */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => {
                if (searchQuery.trim().length >= 2 || searchResults.length > 0) setShowDropdown(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch(searchQuery);
                }
              }}
              placeholder="Search your exact shop location or landmark (e.g. Hema Soudha, Ramanthapur)..."
              className="w-full pl-10 pr-28 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setShowDropdown(false);
                  setHasSearched(false);
                }}
                className="absolute right-20 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
                title="Clear text"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {isSearching && (
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin absolute right-16" />
            )}
            <button
              type="button"
              onClick={() => handleSearch(searchQuery)}
              className="absolute right-2 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              Search
            </button>
          </div>

          {/* Autocomplete Suggestions Dropdown matching Mobile App UI */}
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {/* Quick Option: Use Current Location */}
              <button
                type="button"
                onClick={() => {
                  setShowDropdown(false);
                  handleDetectCurrentLocation();
                }}
                className="w-full text-left px-4 py-3 bg-blue-50/70 hover:bg-blue-100/70 transition-colors flex items-center justify-between text-xs text-blue-700 font-bold"
              >
                <div className="flex items-center gap-2.5">
                  <Crosshair className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Use current location</span>
                </div>
                <span className="text-sm font-semibold text-blue-500">›</span>
              </button>

              {/* Places List */}
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectResult(item)}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-start gap-3 text-xs"
                >
                  <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate text-xs">{item.title}</p>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{item.subtitle}</p>
                  </div>
                </button>
              ))}

              {/* Empty State */}
              {hasSearched && !isSearching && searchResults.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-500 space-y-1">
                  <p className="font-semibold text-slate-700">No matching locations found for "{searchQuery}"</p>
                  <p className="text-[11px] text-slate-400">
                    Try searching with your colony, road, or apartment name (e.g. Ramanthapur, Amberpet, Hema Soudha)
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Interactive Leaflet Map Container */}
        <div className="relative w-full h-72 bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden shadow-inner mt-2">
          {/* Real Leaflet Map Canvas */}
          <div
            ref={mapContainerRef}
            className="w-full h-full z-0"
            style={{ minHeight: '280px' }}
          />

          {/* Fallback styling if Leaflet script is still loading */}
          {!leafletLoaded && (
            <div
              onClick={handleFallbackMapClick}
              className="absolute inset-0 bg-[#E5E3DF] cursor-crosshair flex items-center justify-center"
            >
              <svg className="w-full h-full opacity-60 absolute inset-0" viewBox="0 0 600 300">
                <rect x="0" y="0" width="600" height="300" fill="#E5E3DF" />
                <path d="M0 100 Q150 120 300 80 T600 150" stroke="#FFFFFF" strokeWidth="24" fill="none" />
                <path d="M100 0 V300" stroke="#FFFFFF" strokeWidth="18" fill="none" />
                <path d="M400 0 V300" stroke="#FFFFFF" strokeWidth="14" fill="none" />
                <path d="M250 0 L250 300" stroke="#FDE68A" strokeWidth="10" fill="none" />
              </svg>
              <div
                style={{ left: `${fallbackPin.x}%`, top: `${fallbackPin.y}%` }}
                className="absolute transform -translate-x-1/2 -translate-y-full flex flex-col items-center z-10"
              >
                <div className="bg-slate-900 text-white font-bold text-[11px] px-3 py-1 rounded-md shadow-lg flex items-center gap-1.5 mb-1 whitespace-nowrap">
                  <Navigation className="w-3 h-3 text-blue-400" />
                  <span>Tap on map to place pin</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-xl flex items-center justify-center text-white">
                  <MapPin className="w-5 h-5 fill-white text-blue-600" />
                </div>
              </div>
            </div>
          )}

          {/* Map Floating Helper Overlay */}
          <div className="absolute top-3 left-3 z-10 pointer-events-none">
            <span className="bg-white/95 backdrop-blur-xs text-slate-800 text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-md border border-slate-200/80 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>Tap or drag marker to set exact shop door</span>
            </span>
          </div>

          {/* Coordinates readout badge */}
          <div className="absolute bottom-3 right-3 z-10 pointer-events-none">
            <span className="bg-slate-900/90 backdrop-blur-xs text-white text-[11px] font-mono px-3 py-1.5 rounded-lg shadow-md flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>
                {(lat || 17.3850).toFixed(6)}, {(lng || 78.4867).toFixed(6)}
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <p>Tap anywhere on map canvas to update exact pickup coordinates for rider route planning.</p>
          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Live Map Active
          </span>
        </div>
      </div>

      {/* 4. Service Radius */}
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

      {/* 5. Service Area Zones */}
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

      {/* 6. Working Days */}
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

      {/* 7. Working Hours */}
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
