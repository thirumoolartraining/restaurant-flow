/**
 * Format Helpers Unit Tests - Phase 6.2
 */

const formatHelpers = require('../formatHelpers');

describe('Format Helpers', () => {
  describe('formatPriceWithOffer', () => {
    it('should format price with offer discount', () => {
      const item = { price: 100, offerPrice: 80 };
      const result = formatHelpers.formatPriceWithOffer(item);
      
      expect(result).toContain('₹100');
      expect(result).toContain('₹80');
      expect(result).toContain('20% OFF');
    });
    
    it('should format price without offer', () => {
      const item = { price: 100 };
      const result = formatHelpers.formatPriceWithOffer(item);
      
      expect(result).toBe('₹100');
    });
    
    it('should not show offer if offerPrice is same as price', () => {
      const item = { price: 100, offerPrice: 100 };
      const result = formatHelpers.formatPriceWithOffer(item);
      
      expect(result).toBe('₹100');
    });
  });
  
  describe('formatOfferTypes', () => {
    it('should format array of offer types', () => {
      const item = { offerType: ['BOGO', 'Weekend Special'] };
      const result = formatHelpers.formatOfferTypes(item);
      
      expect(result).toContain('BOGO');
      expect(result).toContain('Weekend Special');
      expect(result).toContain('🎉');
    });
    
    it('should format single offer type string', () => {
      const item = { offerType: 'BOGO' };
      const result = formatHelpers.formatOfferTypes(item);
      
      expect(result).toContain('BOGO');
      expect(result).toContain('🎉');
    });
    
    it('should return empty string for no offers', () => {
      const item = {};
      const result = formatHelpers.formatOfferTypes(item);
      
      expect(result).toBe('');
    });
    
    it('should return empty string for empty array', () => {
      const item = { offerType: [] };
      const result = formatHelpers.formatOfferTypes(item);
      
      expect(result).toBe('');
    });
  });
  
  describe('formatOrderStatus', () => {
    it('should format pending status', () => {
      const result = formatHelpers.formatOrderStatus('pending');
      expect(result).toContain('⏳');
      expect(result).toContain('Pending');
    });
    
    it('should format confirmed status', () => {
      const result = formatHelpers.formatOrderStatus('confirmed');
      expect(result).toContain('✅');
      expect(result).toContain('Confirmed');
    });
    
    it('should format out_for_delivery status', () => {
      const result = formatHelpers.formatOrderStatus('out_for_delivery');
      expect(result).toContain('🚚');
      expect(result).toContain('Out For Delivery');
    });
  });
  
  describe('formatCurrency', () => {
    it('should format positive amount', () => {
      expect(formatHelpers.formatCurrency(1000)).toBe('₹1,000');
    });
    
    it('should format zero', () => {
      expect(formatHelpers.formatCurrency(0)).toBe('₹0');
    });
    
    it('should handle null', () => {
      expect(formatHelpers.formatCurrency(null)).toBe('₹0');
    });
    
    it('should handle undefined', () => {
      expect(formatHelpers.formatCurrency(undefined)).toBe('₹0');
    });
    
    it('should format large amounts', () => {
      expect(formatHelpers.formatCurrency(1000000)).toBe('₹10,00,000');
    });
  });
  
  describe('formatDistance', () => {
    it('should format distance less than 1 KM in meters', () => {
      expect(formatHelpers.formatDistance(0.5)).toBe('500 meters');
    });
    
    it('should format distance in KM', () => {
      expect(formatHelpers.formatDistance(2.5)).toBe('2.5 KM');
    });
    
    it('should handle null', () => {
      expect(formatHelpers.formatDistance(null)).toBe('N/A');
    });
    
    it('should handle zero', () => {
      expect(formatHelpers.formatDistance(0)).toBe('0 meters');
    });
  });
  
  describe('getFoodTypeLabel', () => {
    it('should return vegetarian label', () => {
      const result = formatHelpers.getFoodTypeLabel('veg');
      expect(result).toContain('🌿');
      expect(result).toContain('Vegetarian');
    });
    
    it('should return non-vegetarian label', () => {
      const result = formatHelpers.getFoodTypeLabel('nonveg');
      expect(result).toContain('🍗');
      expect(result).toContain('Non-Vegetarian');
    });
    
    it('should return egg label', () => {
      const result = formatHelpers.getFoodTypeLabel('egg');
      expect(result).toContain('🥚');
      expect(result).toContain('Egg');
    });
    
    it('should return all items label for unknown type', () => {
      const result = formatHelpers.getFoodTypeLabel('unknown');
      expect(result).toContain('🍽️');
      expect(result).toContain('All Items');
    });
  });
  
  describe('getFoodTypeEmoji', () => {
    it('should return correct emojis', () => {
      expect(formatHelpers.getFoodTypeEmoji('veg')).toBe('🌿');
      expect(formatHelpers.getFoodTypeEmoji('nonveg')).toBe('🍗');
      expect(formatHelpers.getFoodTypeEmoji('egg')).toBe('🥚');
      expect(formatHelpers.getFoodTypeEmoji('unknown')).toBe('🍽️');
    });
  });
  
  describe('truncateText', () => {
    it('should truncate long text', () => {
      const longText = 'a'.repeat(150);
      const result = formatHelpers.truncateText(longText, 100);
      
      expect(result.length).toBe(100);
      expect(result).toMatch(/\.\.\.$/);
    });
    
    it('should not truncate short text', () => {
      const shortText = 'Short text';
      const result = formatHelpers.truncateText(shortText, 100);
      
      expect(result).toBe(shortText);
    });
    
    it('should handle null', () => {
      expect(formatHelpers.truncateText(null)).toBeNull();
    });
  });
  
  describe('formatPhoneNumber', () => {
    it('should format 10-digit number', () => {
      expect(formatHelpers.formatPhoneNumber('9876543210')).toBe('98765-43210');
    });
    
    it('should format number with country code', () => {
      expect(formatHelpers.formatPhoneNumber('+919876543210')).toBe('98765-43210');
    });
    
    it('should handle null', () => {
      expect(formatHelpers.formatPhoneNumber(null)).toBe('N/A');
    });
    
    it('should handle invalid length', () => {
      const result = formatHelpers.formatPhoneNumber('123');
      expect(result).toBe('123');
    });
  });
  
  describe('formatDate', () => {
    it('should format valid date', () => {
      const date = new Date('2026-02-05T10:30:00');
      const result = formatHelpers.formatDate(date);
      
      expect(result).toContain('Feb');
      expect(result).toContain('2026');
    });
    
    it('should handle null', () => {
      expect(formatHelpers.formatDate(null)).toBe('N/A');
    });
  });
});
