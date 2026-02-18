/**
 * Location Domain Handler - Phase 3.4.4
 * 
 * Responsibilities:
 * - Request location from user
 * - Handle location sharing and validation
 * - Validate delivery radius
 * - Calculate delivery charges
 * - Distance calculations
 * - Location formatting
 * 
 * Domain Boundaries:
 * - Does NOT create orders (Payment Initiation Domain)
 * - Does NOT handle payment (Payment Domain)
 * - Does NOT manage cart (Cart Domain)
 * - Uses conversationState service for state management
 * 
 * NOTE: Delegates to paymentInitiation after location confirmation
 */

const Settings = require('../../models/Settings');
const conversationState = require('../conversationState');
const whatsapp = require('../whatsapp');
const { logger } = require('../correlationContext');

// Location validation constants
const LOCATION_VALIDATION = {
  MIN_LATITUDE: -90,
  MAX_LATITUDE: 90,
  MIN_LONGITUDE: -180,
  MAX_LONGITUDE: 180,
  EARTH_RADIUS_KM: 6371
};

/**
 * Request location from user
 */
async function requestLocation(customer, phone) {
  const message = `📍 *Share Your Location*\n\n` +
    `Please share your delivery location so we can:\n` +
    `• Calculate delivery charges\n` +
    `• Estimate delivery time\n` +
    `• Ensure we deliver to your area\n\n` +
    `Tap the 📎 button and select Location`;
  
  await whatsapp.sendButtons(phone, message, [
    { id: 'view_cart', text: '🛒 Back to Cart' },
    { id: 'service_pickup', text: '🏪 Switch to Pickup' }
  ]);
  
  conversationState.transitionTo(customer, 'awaiting_location');
  await customer.save();
}

/**
 * Handle location sharing
 */
async function handleLocation(customer, phone, params) {
  const { locationData } = params;
  
  const { latitude, longitude, name, address } = locationData;
  
  // Validate coordinates
  if (!latitude || !longitude) {
    await whatsapp.sendMessage(phone, '❌ Invalid location. Please share your location again.');
    return requestLocation(customer, phone);
  }
  
  // Check delivery radius and calculate charges
  const deliveryResult = await calculateDeliveryCharge(latitude, longitude);
  
  // Beyond max radius
  if (deliveryResult.beyondMaxRadius) {
    await whatsapp.sendButtons(phone, 
      `❌ *Delivery Not Available*\n\n${deliveryResult.message}\n\n` +
      `Would you like to try a different address or opt for self-pickup?`,
      [
        { id: 'service_pickup', text: '🏪 Self-Pickup' },
        { id: 'share_location', text: '📍 New Location' },
        { id: 'home', text: '🏠 Main Menu' }
      ]
    );
    return;
  }
  
  // Outside free radius and delivery not available
  if (deliveryResult.deliveryNotAvailable) {
    await whatsapp.sendButtons(phone,
      `❌ *Delivery Not Available*\n\n${deliveryResult.message}\n\n` +
      `Would you like to try a different address or opt for self-pickup?`,
      [
        { id: 'service_pickup', text: '🏪 Self-Pickup' },
        { id: 'share_location', text: '📍 New Location' },
        { id: 'home', text: '🏠 Main Menu' }
      ]
    );
    return;
  }
  
  // Get formatted address - never show "Location shared"
  let formattedAddress = address || name;
  
  // If no address available, use coordinates as fallback (but this should rarely happen)
  if (!formattedAddress || formattedAddress.trim() === '') {
    formattedAddress = `Lat: ${latitude.toFixed(6)}, Lon: ${longitude.toFixed(6)}`;
  }
  
  // Save location to customer
  customer.deliveryAddress = {
    latitude,
    longitude,
    address: formattedAddress,
    updatedAt: new Date()
  };
  
  // Store delivery charge in context for order creation
  conversationState.setContext(customer, 'deliveryCharge', deliveryResult.charge || 0);
  conversationState.setContext(customer, 'deliveryDistance', deliveryResult.distance);
  
  await customer.save();
  
  // Confirm location and show delivery charge if applicable
  let confirmMessage = `✅ *Location Confirmed*\n\n📍 ${formattedAddress}\n\n`;
  
  if (deliveryResult.charge > 0) {
    confirmMessage += `🚚 Delivery Charge: ₹${deliveryResult.charge}\n`;
    confirmMessage += `📏 Distance: ${deliveryResult.distance?.toFixed(1)} km\n\n`;
  } else {
    confirmMessage += `🎉 Free Delivery!\n\n`;
  }
  
  confirmMessage += `Proceeding to payment...`;
  
  await whatsapp.sendMessage(phone, confirmMessage);
  
  // Redirect to payment initiation
  return { redirect: 'paymentInitiation', action: 'showPaymentOptions', params: {} };
}

/**
 * Calculate delivery charge based on location
 */
async function calculateDeliveryCharge(customerLat, customerLon) {
  try {
    const restaurantLocation = await Settings.getValue('restaurantLocation');
    const deliverySettings = await Settings.getValue('deliverySettings');
    
    if (!restaurantLocation?.latitude || !restaurantLocation?.longitude) {
      return { charge: 0, distance: null, withinFreeRadius: true, message: null };
    }
    
    if (!deliverySettings) {
      return { charge: 0, distance: null, withinFreeRadius: true, message: null };
    }
    
    // Calculate straight-line distance
    const distance = calculateStraightLineDistance(
      restaurantLocation.latitude,
      restaurantLocation.longitude,
      customerLat,
      customerLon
    );
    
    if (distance === null) {
      return { charge: 0, distance: null, withinFreeRadius: true, message: null };
    }
    
    const noFreeDelivery = deliverySettings.noFreeDelivery || false;
    const baseDeliveryCharge = deliverySettings.baseDeliveryCharge || 0;
    const freeRadius = deliverySettings.freeDeliveryRadius || 5;
    const maxRadius = deliverySettings.maxDeliveryRadius;
    const extraChargeEnabled = deliverySettings.enableExtraDeliveryCharge;
    const extraCharge = deliverySettings.extraDeliveryCharge || 0;
    
    // Check max radius
    if (maxRadius && distance > maxRadius) {
      return {
        charge: null,
        distance,
        withinFreeRadius: false,
        beyondMaxRadius: true,
        maxRadius,
        message: `Sorry, we don't deliver beyond ${maxRadius} km. Your location is ${distance.toFixed(1)} km away.`
      };
    }
    
    // No free delivery mode
    if (noFreeDelivery) {
      if (distance > freeRadius && extraChargeEnabled && extraCharge > 0) {
        const totalCharge = baseDeliveryCharge + extraCharge;
        return {
          charge: totalCharge,
          distance,
          withinFreeRadius: false,
          message: `Delivery charge: ₹${totalCharge} (₹${baseDeliveryCharge} base + ₹${extraCharge} extra)`
        };
      }
      return {
        charge: baseDeliveryCharge,
        distance,
        withinFreeRadius: true,
        message: `Delivery charge: ₹${baseDeliveryCharge}`
      };
    }
    
    // Within free radius
    if (distance <= freeRadius) {
      return {
        charge: 0,
        distance,
        withinFreeRadius: true,
        message: null
      };
    }
    
    // Outside free radius
    if (extraChargeEnabled && extraCharge > 0) {
      return {
        charge: extraCharge,
        distance,
        withinFreeRadius: false,
        message: `Delivery charge: ₹${extraCharge} (beyond ${freeRadius} km)`
      };
    }
    
    // Extra charge not enabled - reject
    return {
      charge: null,
      distance,
      withinFreeRadius: false,
      deliveryNotAvailable: true,
      freeRadius,
      message: `Sorry, delivery is only available within ${freeRadius} km. Your location is ${distance.toFixed(1)} km away.`
    };
    
  } catch (error) {
    console.error('Error calculating delivery charge:', error);
    return { charge: 0, distance: null, withinFreeRadius: true, message: null };
  }
}

/**
 * Calculate straight-line distance (Haversine formula)
 */
function calculateStraightLineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = LOCATION_VALIDATION.EARTH_RADIUS_KM;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100;
}

/**
 * Validate coordinates
 */
function validateCoordinates(latitude, longitude) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return { valid: false, error: 'Coordinates must be numbers' };
  }
  
  if (latitude < LOCATION_VALIDATION.MIN_LATITUDE || latitude > LOCATION_VALIDATION.MAX_LATITUDE) {
    return { valid: false, error: 'Invalid latitude' };
  }
  
  if (longitude < LOCATION_VALIDATION.MIN_LONGITUDE || longitude > LOCATION_VALIDATION.MAX_LONGITUDE) {
    return { valid: false, error: 'Invalid longitude' };
  }
  
  return { valid: true };
}

/**
 * Format location for display
 */
function formatLocation(locationData) {
  const { latitude, longitude, address, name } = locationData;
  
  let formatted = '';
  
  if (address) {
    formatted = address;
  } else if (name) {
    formatted = name;
  } else {
    formatted = `${latitude}, ${longitude}`;
  }
  
  return formatted;
}

/**
 * Get delivery settings
 */
async function getDeliverySettings() {
  try {
    const settings = await Settings.getValue('deliverySettings');
    return settings || {
      noFreeDelivery: false,
      baseDeliveryCharge: 0,
      freeDeliveryRadius: 5,
      maxDeliveryRadius: null,
      enableExtraDeliveryCharge: false,
      extraDeliveryCharge: 0
    };
  } catch (error) {
    logger.error('Failed to get delivery settings', { error: error.message });
    return {
      noFreeDelivery: false,
      baseDeliveryCharge: 0,
      freeDeliveryRadius: 5,
      maxDeliveryRadius: null,
      enableExtraDeliveryCharge: false,
      extraDeliveryCharge: 0
    };
  }
}

/**
 * Get restaurant location
 */
async function getRestaurantLocation() {
  try {
    const location = await Settings.getValue('restaurantLocation');
    return location || null;
  } catch (error) {
    logger.error('Failed to get restaurant location', { error: error.message });
    return null;
  }
}

/**
 * Check if location is within delivery radius
 */
async function isWithinDeliveryRadius(latitude, longitude) {
  const restaurantLocation = await getRestaurantLocation();
  const deliverySettings = await getDeliverySettings();
  
  if (!restaurantLocation?.latitude || !restaurantLocation?.longitude) {
    return { within: true, distance: null };
  }
  
  const distance = calculateStraightLineDistance(
    restaurantLocation.latitude,
    restaurantLocation.longitude,
    latitude,
    longitude
  );
  
  if (distance === null) {
    return { within: true, distance: null };
  }
  
  const maxRadius = deliverySettings.maxDeliveryRadius;
  
  if (maxRadius && distance > maxRadius) {
    return { within: false, distance, maxRadius };
  }
  
  return { within: true, distance };
}

/**
 * Format delivery charge message
 */
function formatDeliveryChargeMessage(deliveryResult) {
  if (deliveryResult.beyondMaxRadius) {
    return `❌ *Delivery Not Available*\n\n${deliveryResult.message}`;
  }
  
  if (deliveryResult.deliveryNotAvailable) {
    return `❌ *Delivery Not Available*\n\n${deliveryResult.message}`;
  }
  
  if (deliveryResult.charge === 0) {
    return `🎉 *Free Delivery!*\n\nYour location is within our free delivery zone.`;
  }
  
  return `🚚 *Delivery Charge: ₹${deliveryResult.charge}*\n\n${deliveryResult.message || ''}`;
}

/**
 * Save customer location
 */
async function saveCustomerLocation(customer, locationData) {
  const { latitude, longitude, address, name } = locationData;
  
  // Never save "Location shared" - use coordinates as fallback
  let formattedAddress = address || name;
  if (!formattedAddress || formattedAddress.trim() === '') {
    formattedAddress = `Lat: ${latitude.toFixed(6)}, Lon: ${longitude.toFixed(6)}`;
  }
  
  customer.deliveryAddress = {
    latitude,
    longitude,
    address: formattedAddress,
    updatedAt: new Date()
  };
  
  await customer.save();
  
  logger.info('Customer location saved', {
    customerId: customer._id,
    latitude,
    longitude,
    address: formattedAddress
  });
}

/**
 * Clear customer location
 */
async function clearCustomerLocation(customer) {
  customer.deliveryAddress = null;
  await customer.save();
  
  logger.info('Customer location cleared', {
    customerId: customer._id
  });
}

/**
 * Get customer location
 */
function getCustomerLocation(customer) {
  return customer.deliveryAddress || null;
}

/**
 * Has customer location
 */
function hasCustomerLocation(customer) {
  return !!(customer.deliveryAddress?.latitude && customer.deliveryAddress?.longitude);
}

/**
 * Request location with custom message
 */
async function requestLocationWithMessage(customer, phone, message) {
  await whatsapp.sendButtons(phone, message, [
    { id: 'view_cart', text: '🛒 Back to Cart' },
    { id: 'service_pickup', text: '🏪 Switch to Pickup' }
  ]);
  
  conversationState.transitionTo(customer, 'awaiting_location');
  await customer.save();
}

module.exports = {
  // Core location operations
  requestLocation,
  handleLocation,
  
  // Location calculations
  calculateDeliveryCharge,
  calculateStraightLineDistance,
  isWithinDeliveryRadius,
  
  // Location validation
  validateCoordinates,
  
  // Location formatting
  formatLocation,
  formatDeliveryChargeMessage,
  
  // Settings helpers
  getDeliverySettings,
  getRestaurantLocation,
  
  // Customer location management
  saveCustomerLocation,
  clearCustomerLocation,
  getCustomerLocation,
  hasCustomerLocation,
  
  // UI helpers
  requestLocationWithMessage
};
