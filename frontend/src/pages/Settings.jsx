import { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  MapPin, 
  Truck, 
  IndianRupee, 
  Save, 
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Info,
  Sun,
  Moon
} from 'lucide-react';
import api from '../api';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Settings state
  const [settings, setSettings] = useState({
    restaurantLocation: {
      googleMapsUrl: '',
      latitude: null,
      longitude: null,
      address: ''
    },
    deliverySettings: {
      noFreeDelivery: false, // If true, all deliveries are charged
      baseDeliveryCharge: 20, // Base charge for all deliveries (when noFreeDelivery is true)
      freeDeliveryRadius: 5, // in KM
      enableExtraDeliveryCharge: false, // If true, charge extra for beyond free radius; if false, reject orders
      extraDeliveryCharge: 30, // in INR
      maxDeliveryRadius: 15, // Maximum delivery radius in KM (optional)
      distanceMultiplier: 1.4 // Multiplier to convert straight-line to approximate road distance
    },
    holidayMode: false
  });

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/settings');
      
      // Merge fetched settings with defaults
      setSettings(prev => ({
        ...prev,
        restaurantLocation: response.data.restaurantLocation || prev.restaurantLocation,
        deliverySettings: response.data.deliverySettings || prev.deliverySettings,
        holidayMode: response.data.holidayMode || false
      }));
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  // Parse Google Maps URL to extract coordinates
  const parseGoogleMapsUrl = (url) => {
    if (!url) return null;
    
    try {
      // Pattern 1: https://www.google.com/maps?q=17.4399,78.4983
      // Pattern 2: https://maps.google.com/?q=17.4399,78.4983
      // Pattern 3: https://www.google.com/maps/place/.../@17.4399,78.4983,17z
      // Pattern 4: https://goo.gl/maps/... (shortened)
      // Pattern 5: https://maps.app.goo.gl/...
      
      // Try to extract coordinates from @lat,lng pattern
      const atPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const atMatch = url.match(atPattern);
      if (atMatch) {
        return {
          latitude: parseFloat(atMatch[1]),
          longitude: parseFloat(atMatch[2])
        };
      }
      
      // Try to extract from ?q=lat,lng pattern
      const qPattern = /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const qMatch = url.match(qPattern);
      if (qMatch) {
        return {
          latitude: parseFloat(qMatch[1]),
          longitude: parseFloat(qMatch[2])
        };
      }
      
      // Try to extract from ll=lat,lng pattern
      const llPattern = /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const llMatch = url.match(llPattern);
      if (llMatch) {
        return {
          latitude: parseFloat(llMatch[1]),
          longitude: parseFloat(llMatch[2])
        };
      }
      
      return null;
    } catch (err) {
      console.error('Error parsing Google Maps URL:', err);
      return null;
    }
  };

  // Handle Google Maps URL change
  const handleMapsUrlChange = (url) => {
    setSettings(prev => ({
      ...prev,
      restaurantLocation: {
        ...prev.restaurantLocation,
        googleMapsUrl: url
      }
    }));
    
    // Try to extract coordinates
    const coords = parseGoogleMapsUrl(url);
    if (coords) {
      setSettings(prev => ({
        ...prev,
        restaurantLocation: {
          ...prev.restaurantLocation,
          googleMapsUrl: url,
          latitude: coords.latitude,
          longitude: coords.longitude
        }
      }));
    }
  };

  // Save settings
  const saveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      // Validate required fields
      if (settings.deliverySettings.enableExtraDeliveryCharge) {
        if (!settings.restaurantLocation.latitude || !settings.restaurantLocation.longitude) {
          setError('Please set restaurant location to enable delivery charges');
          return;
        }
      }
      
      // Save restaurant location
      await api.put('/settings/restaurantLocation', { 
        value: settings.restaurantLocation 
      });
      
      // Save delivery settings
      await api.put('/settings/deliverySettings', { 
        value: settings.deliverySettings 
      });
      
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Toggle holiday mode
  const toggleHolidayMode = async () => {
    try {
      const response = await api.post('/settings/holiday/toggle');
      setSettings(prev => ({
        ...prev,
        holidayMode: response.data.holidayMode
      }));
      setSuccess(`Holiday mode ${response.data.holidayMode ? 'enabled' : 'disabled'}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error toggling holiday mode:', err);
      setError('Failed to toggle holiday mode');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
            <SettingsIcon className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark-900">Settings</h1>
            <p className="text-dark-500">Configure restaurant and delivery settings</p>
          </div>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}
      
      {success && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <p>{success}</p>
        </div>
      )}

      {/* Holiday Mode */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${settings.holidayMode ? 'bg-yellow-100' : 'bg-green-100'}`}>
              {settings.holidayMode ? <Sun className="w-6 h-6 text-yellow-600" /> : <Moon className="w-6 h-6 text-green-600" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-dark-900">Holiday Mode</h2>
              <p className="text-dark-500 text-sm">
                {settings.holidayMode 
                  ? 'Restaurant is closed - Orders are paused' 
                  : 'Restaurant is open - Accepting orders'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleHolidayMode}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              settings.holidayMode ? 'bg-yellow-500' : 'bg-dark-200'
            }`}
          >
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              settings.holidayMode ? 'translate-x-8' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Restaurant Location */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-dark-900">Restaurant Location</h2>
            <p className="text-dark-500 text-sm">Set your restaurant's location for delivery distance calculation</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Google Maps URL */}
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-2">
              Google Maps URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={settings.restaurantLocation.googleMapsUrl}
                onChange={(e) => handleMapsUrlChange(e.target.value)}
                placeholder="https://maps.google.com/?q=17.4399,78.4983"
                className="flex-1 px-4 py-3 border border-dark-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
              {settings.restaurantLocation.googleMapsUrl && (
                <a
                  href={settings.restaurantLocation.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              )}
            </div>
            <p className="text-xs text-dark-400 mt-1">
              Paste your restaurant's Google Maps link. Coordinates will be extracted automatically.
            </p>
          </div>

          {/* Extracted Coordinates */}
          {settings.restaurantLocation.latitude && settings.restaurantLocation.longitude && (
            <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">Location Detected</p>
                <p className="text-sm text-green-600">
                  Lat: {settings.restaurantLocation.latitude.toFixed(6)}, 
                  Lng: {settings.restaurantLocation.longitude.toFixed(6)}
                </p>
              </div>
            </div>
          )}

          {/* Manual Coordinates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Latitude (Optional)
              </label>
              <input
                type="number"
                step="any"
                value={settings.restaurantLocation.latitude || ''}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  restaurantLocation: {
                    ...prev.restaurantLocation,
                    latitude: e.target.value ? parseFloat(e.target.value) : null
                  }
                }))}
                placeholder="17.4399"
                className="w-full px-4 py-3 border border-dark-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Longitude (Optional)
              </label>
              <input
                type="number"
                step="any"
                value={settings.restaurantLocation.longitude || ''}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  restaurantLocation: {
                    ...prev.restaurantLocation,
                    longitude: e.target.value ? parseFloat(e.target.value) : null
                  }
                }))}
                placeholder="78.4983"
                className="w-full px-4 py-3 border border-dark-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-2">
              Restaurant Address (Optional)
            </label>
            <textarea
              value={settings.restaurantLocation.address}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                restaurantLocation: {
                  ...prev.restaurantLocation,
                  address: e.target.value
                }
              }))}
              placeholder="Enter your restaurant address..."
              rows={2}
              className="w-full px-4 py-3 border border-dark-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
            />
          </div>
        </div>
      </div>

      {/* Delivery Settings */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <Truck className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-dark-900">Delivery Settings</h2>
            <p className="text-dark-500 text-sm">Configure delivery radius and charges</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* No Free Delivery Option */}
          <div className="flex items-start gap-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <input
              type="checkbox"
              id="noFreeDelivery"
              checked={settings.deliverySettings.noFreeDelivery}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                deliverySettings: {
                  ...prev.deliverySettings,
                  noFreeDelivery: e.target.checked
                }
              }))}
              className="w-5 h-5 mt-1 rounded border-red-300 text-red-600 focus:ring-red-500"
            />
            <div className="flex-1">
              <label htmlFor="noFreeDelivery" className="text-sm font-medium text-red-800 cursor-pointer">
                No Free Delivery (Charge for ALL deliveries)
              </label>
              <p className="text-xs text-red-600 mt-1">
                If enabled, ALL customers will be charged for delivery regardless of distance
              </p>
            </div>
          </div>

          {/* Base Delivery Charge (when no free delivery) */}
          {settings.deliverySettings.noFreeDelivery && (
            <div className="ml-9 p-4 bg-red-50 border border-red-200 rounded-xl">
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Base Delivery Charge (₹)
              </label>
              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  <span className="px-3 py-3 bg-dark-100 border border-r-0 border-dark-200 rounded-l-xl text-dark-500">
                    <IndianRupee className="w-4 h-4" />
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={settings.deliverySettings.baseDeliveryCharge}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      deliverySettings: {
                        ...prev.deliverySettings,
                        baseDeliveryCharge: parseInt(e.target.value) || 0
                      }
                    }))}
                    className="w-28 px-4 py-3 border border-dark-200 rounded-r-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  />
                </div>
              </div>
              <p className="text-xs text-dark-400 mt-1">
                This amount will be charged for ALL deliveries
              </p>
            </div>
          )}

          {/* Free Delivery Radius */}
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-2">
              {settings.deliverySettings.noFreeDelivery ? 'Standard Delivery Radius (KM)' : 'Free Delivery Radius (KM)'}
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="1"
                max="50"
                value={settings.deliverySettings.freeDeliveryRadius}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  deliverySettings: {
                    ...prev.deliverySettings,
                    freeDeliveryRadius: parseInt(e.target.value) || 5
                  }
                }))}
                className="w-32 px-4 py-3 border border-dark-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
              <span className="text-dark-500">kilometers</span>
            </div>
            <p className="text-xs text-dark-400 mt-1">
              {settings.deliverySettings.noFreeDelivery 
                ? 'Customers within this radius pay base charge only'
                : 'Customers within this radius will get free delivery'}
            </p>
          </div>

          {/* Enable Extra Delivery Charge */}
          <div className="flex items-start gap-4 p-4 bg-dark-50 rounded-xl">
            <input
              type="checkbox"
              id="enableExtraCharge"
              checked={settings.deliverySettings.enableExtraDeliveryCharge}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                deliverySettings: {
                  ...prev.deliverySettings,
                  enableExtraDeliveryCharge: e.target.checked
                }
              }))}
              className="w-5 h-5 mt-1 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
            />
            <div className="flex-1">
              <label htmlFor="enableExtraCharge" className="text-sm font-medium text-dark-800 cursor-pointer">
                {settings.deliverySettings.noFreeDelivery 
                  ? 'Charge extra for deliveries beyond standard radius'
                  : 'Accept deliveries beyond free radius (with extra charge)'}
              </label>
              <p className="text-xs text-dark-500 mt-1">
                {settings.deliverySettings.noFreeDelivery 
                  ? 'If enabled, customers outside the standard radius will be charged base + extra fee'
                  : 'If DISABLED, orders from customers outside the free delivery radius will be REJECTED'}
              </p>
            </div>
          </div>

          {/* Extra Delivery Charge Amount */}
          {settings.deliverySettings.enableExtraDeliveryCharge && (
            <div className="ml-9 p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-700 mb-2">
                  Extra Delivery Charge (₹)
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center">
                    <span className="px-3 py-3 bg-dark-100 border border-r-0 border-dark-200 rounded-l-xl text-dark-500">
                      <IndianRupee className="w-4 h-4" />
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={settings.deliverySettings.extraDeliveryCharge}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        deliverySettings: {
                          ...prev.deliverySettings,
                          extraDeliveryCharge: parseInt(e.target.value) || 0
                        }
                      }))}
                      className="w-28 px-4 py-3 border border-dark-200 rounded-r-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    />
                  </div>
                </div>
                <p className="text-xs text-dark-400 mt-1">
                  This amount will be added to orders from customers outside the free delivery radius
                </p>
              </div>

              {/* Max Delivery Radius (Optional) */}
              <div>
                <label className="block text-sm font-medium text-dark-700 mb-2">
                  Maximum Delivery Radius (KM) - Optional
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min={settings.deliverySettings.freeDeliveryRadius}
                    max="100"
                    value={settings.deliverySettings.maxDeliveryRadius || ''}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      deliverySettings: {
                        ...prev.deliverySettings,
                        maxDeliveryRadius: e.target.value ? parseInt(e.target.value) : null
                      }
                    }))}
                    placeholder="No limit"
                    className="w-32 px-4 py-3 border border-dark-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  />
                  <span className="text-dark-500">kilometers</span>
                </div>
                <p className="text-xs text-dark-400 mt-1">
                  Leave empty for unlimited. Orders beyond this radius will not be accepted.
                </p>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">How it works:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>When a customer shares their delivery location, we calculate the distance from your restaurant</li>
                {settings.deliverySettings.noFreeDelivery ? (
                  <>
                    <li>ALL deliveries are charged ₹{settings.deliverySettings.baseDeliveryCharge} (base charge)</li>
                    {settings.deliverySettings.enableExtraDeliveryCharge && (
                      <li>If beyond {settings.deliverySettings.freeDeliveryRadius} KM, ₹{settings.deliverySettings.extraDeliveryCharge} extra is added (total: ₹{settings.deliverySettings.baseDeliveryCharge + settings.deliverySettings.extraDeliveryCharge})</li>
                    )}
                  </>
                ) : (
                  <>
                    <li>If within {settings.deliverySettings.freeDeliveryRadius} KM, delivery is FREE</li>
                    {settings.deliverySettings.enableExtraDeliveryCharge ? (
                      <li>If beyond {settings.deliverySettings.freeDeliveryRadius} KM, ₹{settings.deliverySettings.extraDeliveryCharge} delivery charge is added</li>
                    ) : (
                      <li className="text-red-600 font-medium">⚠️ Orders beyond {settings.deliverySettings.freeDeliveryRadius} KM will be REJECTED (enable extra charge to accept them)</li>
                    )}
                  </>
                )}
                {settings.deliverySettings.maxDeliveryRadius && (
                  <li>Orders beyond {settings.deliverySettings.maxDeliveryRadius} KM are not accepted</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
