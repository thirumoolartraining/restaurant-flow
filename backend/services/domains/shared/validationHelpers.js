/**
 * Shared Validation Helpers - Phase 6.1
 * 
 * Purpose: Extract common validation patterns from domain handlers
 * Reduces code duplication for cart, order, and item validation
 * 
 * Common Patterns Extracted:
 * - Cart availability checks
 * - Item availability checks
 * - Order status validation
 * - Location validation
 * - Payment validation
 * - Quantity validation
 */

const MenuItem = require('../../../models/MenuItem');
const Category = require('../../../models/Category');
const Order = require('../../../models/Order');

/**
 * Check if cart items are still available
 */
async function checkCartAvailability(cart) {
  if (!cart || cart.length === 0) {
    return { available: true, unavailableItems: [] };
  }
  
  const unavailableItems = [];
  const allCategories = await Category.find({ isActive: true });
  
  // Get scheduled categories that are currently ACTIVE
  const scheduledActiveCategories = allCategories
    .filter(c => c.schedule?.enabled && !c.isPaused && !c.isSoldOut)
    .map(c => c.name);
  
  // Get scheduled categories that are LOCKED
  const scheduledLockedCategories = allCategories
    .filter(c => c.schedule?.enabled && (c.isPaused || c.isSoldOut))
    .map(c => c.name);
  
  for (const cartItem of cart) {
    const menuItem = await MenuItem.findById(cartItem.menuItem);
    
    if (!menuItem) {
      unavailableItems.push({ 
        name: cartItem.menuItem?.name || 'Unknown item', 
        reason: 'deleted' 
      });
      continue;
    }
    
    if (!menuItem.available) {
      unavailableItems.push({ name: menuItem.name, reason: 'unavailable' });
      continue;
    }
    
    const itemCategories = Array.isArray(menuItem.category) 
      ? menuItem.category 
      : [menuItem.category];
    
    // Check if item has any scheduled category that is ACTIVE
    const hasScheduledActiveCategory = itemCategories.some(cat => 
      scheduledActiveCategories.includes(cat)
    );
    
    if (hasScheduledActiveCategory) continue;
    
    // Check if item has any scheduled category that is LOCKED
    const hasScheduledLockedCategory = itemCategories.some(cat => 
      scheduledLockedCategories.includes(cat)
    );
    
    if (hasScheduledLockedCategory) {
      unavailableItems.push({ name: menuItem.name, reason: 'category_paused' });
      continue;
    }
    
    // Check if any non-scheduled category is active
    const hasActiveNonScheduledCategory = itemCategories.some(cat => {
      const category = allCategories.find(c => c.name === cat);
      return category && !category.schedule?.enabled && !category.isPaused && !category.isSoldOut;
    });
    
    if (!hasActiveNonScheduledCategory) {
      unavailableItems.push({ name: menuItem.name, reason: 'category_paused' });
    }
  }
  
  return {
    available: unavailableItems.length === 0,
    unavailableItems
  };
}

/**
 * Check if a single item is available
 */
async function checkItemAvailability(itemId) {
  const item = await MenuItem.findById(itemId);
  
  if (!item) {
    return { available: false, reason: 'not_found' };
  }
  
  if (!item.available) {
    return { available: false, reason: 'unavailable' };
  }
  
  // Check category availability
  const categories = Array.isArray(item.category) ? item.category : [item.category];
  const allCategories = await Category.find({ name: { $in: categories }, isActive: true });
  
  const hasAvailableCategory = allCategories.some(cat => 
    !cat.isPaused && !cat.isSoldOut
  );
  
  if (!hasAvailableCategory) {
    return { available: false, reason: 'category_unavailable' };
  }
  
  return { available: true, item };
}

/**
 * Validate order can be cancelled
 */
async function validateOrderCancellation(orderId, customerId) {
  const order = await Order.findOne({ orderId, customer: customerId });
  
  if (!order) {
    return { valid: false, reason: 'not_found', message: '❌ Order not found.' };
  }
  
  if (order.status !== 'pending' && order.status !== 'confirmed') {
    return { 
      valid: false, 
      reason: 'invalid_status', 
      message: `❌ Cannot cancel order. Current status: ${order.status}\n\nPlease contact support for assistance.`
    };
  }
  
  return { valid: true, order };
}

/**
 * Validate order can be refunded
 */
async function validateOrderRefund(orderId, customerId) {
  const order = await Order.findOne({ orderId, customer: customerId });
  
  if (!order) {
    return { valid: false, reason: 'not_found', message: '❌ Order not found.' };
  }
  
  if (order.refundStatus === 'completed') {
    return { 
      valid: false, 
      reason: 'already_refunded', 
      message: `✅ Order ${order.orderId} has already been refunded.\n\nRefund amount: ₹${order.refundAmount || order.totalAmount}`
    };
  }
  
  if (order.refundStatus === 'requested' || order.refundStatus === 'processing') {
    return { 
      valid: false, 
      reason: 'refund_pending', 
      message: `⏳ Refund for order ${order.orderId} is already ${order.refundStatus}.\n\nPlease wait for admin approval.`
    };
  }
  
  if (order.status !== 'cancelled' && order.status !== 'delivered') {
    return { 
      valid: false, 
      reason: 'invalid_status', 
      message: `❌ Refund not available for orders with status: ${order.status}`
    };
  }
  
  return { valid: true, order };
}

/**
 * Validate quantity
 */
function validateQuantity(quantity) {
  const qty = parseInt(quantity);
  
  if (isNaN(qty) || qty < 1) {
    return { valid: false, message: '❌ Invalid quantity. Please enter a number greater than 0.' };
  }
  
  if (qty > 50) {
    return { valid: false, message: '❌ Maximum quantity is 50 per item. Please contact us for bulk orders.' };
  }
  
  return { valid: true, quantity: qty };
}

/**
 * Validate location coordinates
 */
function validateLocation(latitude, longitude) {
  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);
  
  if (isNaN(lat) || isNaN(lon)) {
    return { valid: false, message: '❌ Invalid location coordinates.' };
  }
  
  // Basic range check for India
  if (lat < 8 || lat > 37 || lon < 68 || lon > 97) {
    return { valid: false, message: '❌ Location appears to be outside India. Please check your location.' };
  }
  
  return { valid: true, latitude: lat, longitude: lon };
}

/**
 * Validate phone number
 */
function validatePhoneNumber(phone) {
  // Remove spaces and special characters
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  
  // Check if it's a valid Indian mobile number
  const indianMobileRegex = /^(\+91|91)?[6-9]\d{9}$/;
  
  if (!indianMobileRegex.test(cleaned)) {
    return { valid: false, message: '❌ Invalid phone number. Please enter a valid Indian mobile number.' };
  }
  
  // Normalize to include country code
  const normalized = cleaned.startsWith('+91') 
    ? cleaned 
    : cleaned.startsWith('91') 
      ? '+' + cleaned 
      : '+91' + cleaned.replace(/^0+/, '');
  
  return { valid: true, phone: normalized };
}

/**
 * Check if cart is empty
 */
function isCartEmpty(cart) {
  return !cart || cart.length === 0;
}

/**
 * Check if order is in progress
 */
function isOrderInProgress(order) {
  const inProgressStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];
  return inProgressStatuses.includes(order.status);
}

/**
 * Check if order is completed
 */
function isOrderCompleted(order) {
  const completedStatuses = ['delivered', 'cancelled', 'refunded'];
  return completedStatuses.includes(order.status);
}

module.exports = {
  checkCartAvailability,
  checkItemAvailability,
  validateOrderCancellation,
  validateOrderRefund,
  validateQuantity,
  validateLocation,
  validatePhoneNumber,
  isCartEmpty,
  isOrderInProgress,
  isOrderCompleted
};
