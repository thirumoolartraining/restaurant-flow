/**
 * Shared Format Helpers - Phase 6.1
 * 
 * Purpose: Extract common formatting patterns from domain handlers
 * Reduces code duplication for price, offer, and display formatting
 * 
 * Common Patterns Extracted:
 * - Price formatting with offers
 * - Offer type formatting
 * - Order status formatting
 * - Date/time formatting
 * - Distance formatting
 * - Currency formatting
 */

/**
 * Format price with offer discount
 */
function formatPriceWithOffer(item) {
  if (item.offerPrice && item.offerPrice < item.price) {
    const discount = Math.round(((item.price - item.offerPrice) / item.price) * 100);
    return `~₹${item.price}~ ➜ *₹${item.offerPrice}* (${discount}% OFF)`;
  }
  return `₹${item.price}`;
}

/**
 * Format price with active customer offers
 */
function formatPriceWithActiveOffers(item, activeOffers) {
  // First check if item has built-in offerPrice
  if (item.offerPrice && item.offerPrice < item.price) {
    const discount = Math.round(((item.price - item.offerPrice) / item.price) * 100);
    return `~₹${item.price}~ ➜ *₹${item.offerPrice}* (${discount}% OFF)`;
  }
  
  // Then check customer's activeOffers for targeted discounts
  if (activeOffers && activeOffers.length > 0) {
    const offerResult = calculateOfferDiscount(item, activeOffers);
    if (offerResult.discountedPrice !== null && offerResult.discountAmount > 0) {
      const discount = Math.round((offerResult.discountAmount / item.price) * 100);
      return `~₹${item.price}~ ➜ *₹${offerResult.discountedPrice}* (${discount}% OFF 🎁)`;
    }
  }
  
  return `₹${item.price}`;
}

/**
 * Calculate offer discount from customer's activeOffers
 */
function calculateOfferDiscount(menuItem, activeOffers) {
  if (!activeOffers || activeOffers.length === 0) {
    return { discountedPrice: null, discountAmount: 0, appliedOffer: null };
  }
  
  const now = new Date();
  
  for (const offer of activeOffers) {
    // Skip expired offers
    if (offer.validUntil && new Date(offer.validUntil) < now) {
      continue;
    }
    
    // Check if item is applicable to this offer
    let isApplicable = false;
    
    if (offer.appliedItems && offer.appliedItems.length > 0) {
      isApplicable = offer.appliedItems.some(itemId => 
        itemId.toString() === menuItem._id.toString()
      );
    }
    
    if (!isApplicable && offer.appliedCategories && offer.appliedCategories.length > 0) {
      isApplicable = offer.appliedCategories.includes(menuItem.category);
    }
    
    if (!isApplicable && offer.offerType && menuItem.offerType) {
      const itemOfferTypes = Array.isArray(menuItem.offerType) ? menuItem.offerType : [menuItem.offerType];
      isApplicable = itemOfferTypes.includes(offer.offerType);
    }
    
    if (isApplicable) {
      const price = menuItem.price;
      let discountedPrice = price;
      let discountAmount = 0;
      
      if (offer.discountType === 'percentage' && offer.discountValue > 0) {
        discountAmount = Math.round((price * offer.discountValue) / 100);
        discountedPrice = price - discountAmount;
      } else if (offer.discountType === 'fixed' && offer.discountValue > 0) {
        discountAmount = Math.min(offer.discountValue, price);
        discountedPrice = price - discountAmount;
      } else if (offer.percentage && offer.percentage > 0) {
        discountAmount = Math.round((price * offer.percentage) / 100);
        discountedPrice = price - discountAmount;
      }
      
      if (discountAmount > 0) {
        return { discountedPrice, discountAmount, appliedOffer: offer };
      }
    }
  }
  
  return { discountedPrice: null, discountAmount: 0, appliedOffer: null };
}

/**
 * Format offer types for display
 */
function formatOfferTypes(item) {
  if (item.offerType && Array.isArray(item.offerType) && item.offerType.length > 0) {
    const offersList = item.offerType.join(', ');
    return `\n🎉 *Offers:* ${offersList}`;
  } else if (item.offerType && typeof item.offerType === 'string' && item.offerType.trim()) {
    return `\n🎉 *Offers:* ${item.offerType}`;
  }
  return '';
}

/**
 * Format order status with emoji
 */
function formatOrderStatus(status) {
  const statusEmoji = {
    pending: '⏳',
    confirmed: '✅',
    preparing: '👨‍🍳',
    ready: '📦',
    out_for_delivery: '🚚',
    delivered: '✅',
    cancelled: '❌',
    refunded: '💰'
  };
  
  const emoji = statusEmoji[status] || '📋';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  return `${emoji} ${label}`;
}

/**
 * Format date for display
 */
function formatDate(date) {
  if (!date) return 'N/A';
  
  const d = new Date(date);
  const options = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  return d.toLocaleDateString('en-IN', options);
}

/**
 * Format distance
 */
function formatDistance(distanceKm) {
  if (distanceKm === null || distanceKm === undefined) return 'N/A';
  
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} meters`;
  }
  
  return `${distanceKm.toFixed(1)} KM`;
}

/**
 * Format currency (Indian Rupees)
 */
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '₹0';
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * Format food type label
 */
function getFoodTypeLabel(foodType) {
  const labels = {
    veg: '🌿 Vegetarian',
    nonveg: '🍗 Non-Vegetarian',
    egg: '🥚 Egg',
    all: '🍽️ All Items'
  };
  
  return labels[foodType] || labels.all;
}

/**
 * Format food type emoji
 */
function getFoodTypeEmoji(foodType) {
  const emojis = {
    veg: '🌿',
    nonveg: '🍗',
    egg: '🥚'
  };
  
  return emojis[foodType] || '🍽️';
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format phone number for display
 */
function formatPhoneNumber(phone) {
  if (!phone) return 'N/A';
  
  // Remove country code if present
  const cleaned = phone.replace(/^\+91/, '');
  
  // Format as XXXXX-XXXXX
  if (cleaned.length === 10) {
    return `${cleaned.substring(0, 5)}-${cleaned.substring(5)}`;
  }
  
  return cleaned;
}

module.exports = {
  formatPriceWithOffer,
  formatPriceWithActiveOffers,
  calculateOfferDiscount,
  formatOfferTypes,
  formatOrderStatus,
  formatDate,
  formatDistance,
  formatCurrency,
  getFoodTypeLabel,
  getFoodTypeEmoji,
  truncateText,
  formatPhoneNumber
};
