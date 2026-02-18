/**
 * Validation Helpers Unit Tests - Phase 6.2
 */

const validationHelpers = require('../validationHelpers');

describe('Validation Helpers', () => {
  describe('validateQuantity', () => {
    it('should validate positive quantity', () => {
      const result = validationHelpers.validateQuantity(5);
      
      expect(result.valid).toBe(true);
      expect(result.quantity).toBe(5);
    });
    
    it('should reject negative quantity', () => {
      const result = validationHelpers.validateQuantity(-1);
      
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid quantity');
    });
    
    it('should reject zero quantity', () => {
      const result = validationHelpers.validateQuantity(0);
      
      expect(result.valid).toBe(false);
    });
    
    it('should reject quantity over 50', () => {
      const result = validationHelpers.validateQuantity(100);
      
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Maximum quantity');
    });
    
    it('should reject non-numeric quantity', () => {
      const result = validationHelpers.validateQuantity('abc');
      
      expect(result.valid).toBe(false);
    });
    
    it('should accept string numbers', () => {
      const result = validationHelpers.validateQuantity('5');
      
      expect(result.valid).toBe(true);
      expect(result.quantity).toBe(5);
    });
  });
  
  describe('validateLocation', () => {
    it('should validate coordinates in India', () => {
      const result = validationHelpers.validateLocation(28.6139, 77.2090); // Delhi
      
      expect(result.valid).toBe(true);
      expect(result.latitude).toBe(28.6139);
      expect(result.longitude).toBe(77.2090);
    });
    
    it('should reject coordinates outside India', () => {
      const result = validationHelpers.validateLocation(50, 100);
      
      expect(result.valid).toBe(false);
      expect(result.message).toContain('outside India');
    });
    
    it('should reject invalid latitude', () => {
      const result = validationHelpers.validateLocation('abc', 77.2090);
      
      expect(result.valid).toBe(false);
    });
    
    it('should reject invalid longitude', () => {
      const result = validationHelpers.validateLocation(28.6139, 'def');
      
      expect(result.valid).toBe(false);
    });
    
    it('should accept string coordinates', () => {
      const result = validationHelpers.validateLocation('28.6139', '77.2090');
      
      expect(result.valid).toBe(true);
      expect(result.latitude).toBe(28.6139);
      expect(result.longitude).toBe(77.2090);
    });
  });
  
  describe('validatePhoneNumber', () => {
    it('should validate 10-digit Indian mobile', () => {
      const result = validationHelpers.validatePhoneNumber('9876543210');
      
      expect(result.valid).toBe(true);
      expect(result.phone).toBe('+919876543210');
    });
    
    it('should validate number with +91', () => {
      const result = validationHelpers.validatePhoneNumber('+919876543210');
      
      expect(result.valid).toBe(true);
      expect(result.phone).toBe('+919876543210');
    });
    
    it('should validate number with 91 prefix', () => {
      const result = validationHelpers.validatePhoneNumber('919876543210');
      
      expect(result.valid).toBe(true);
      expect(result.phone).toBe('+919876543210');
    });
    
    it('should reject invalid number', () => {
      const result = validationHelpers.validatePhoneNumber('123');
      
      expect(result.valid).toBe(false);
    });
    
    it('should reject number starting with invalid digit', () => {
      const result = validationHelpers.validatePhoneNumber('5876543210');
      
      expect(result.valid).toBe(false);
    });
    
    it('should handle spaces and dashes', () => {
      const result = validationHelpers.validatePhoneNumber('987-654-3210');
      
      expect(result.valid).toBe(true);
      expect(result.phone).toBe('+919876543210');
    });
  });
  
  describe('isCartEmpty', () => {
    it('should return true for empty array', () => {
      expect(validationHelpers.isCartEmpty([])).toBe(true);
    });
    
    it('should return true for null', () => {
      expect(validationHelpers.isCartEmpty(null)).toBe(true);
    });
    
    it('should return true for undefined', () => {
      expect(validationHelpers.isCartEmpty(undefined)).toBe(true);
    });
    
    it('should return false for non-empty array', () => {
      expect(validationHelpers.isCartEmpty([{ item: 'test' }])).toBe(false);
    });
  });
  
  describe('isOrderInProgress', () => {
    it('should return true for pending status', () => {
      expect(validationHelpers.isOrderInProgress({ status: 'pending' })).toBe(true);
    });
    
    it('should return true for confirmed status', () => {
      expect(validationHelpers.isOrderInProgress({ status: 'confirmed' })).toBe(true);
    });
    
    it('should return true for preparing status', () => {
      expect(validationHelpers.isOrderInProgress({ status: 'preparing' })).toBe(true);
    });
    
    it('should return true for ready status', () => {
      expect(validationHelpers.isOrderInProgress({ status: 'ready' })).toBe(true);
    });
    
    it('should return true for out_for_delivery status', () => {
      expect(validationHelpers.isOrderInProgress({ status: 'out_for_delivery' })).toBe(true);
    });
    
    it('should return false for delivered status', () => {
      expect(validationHelpers.isOrderInProgress({ status: 'delivered' })).toBe(false);
    });
    
    it('should return false for cancelled status', () => {
      expect(validationHelpers.isOrderInProgress({ status: 'cancelled' })).toBe(false);
    });
  });
  
  describe('isOrderCompleted', () => {
    it('should return true for delivered status', () => {
      expect(validationHelpers.isOrderCompleted({ status: 'delivered' })).toBe(true);
    });
    
    it('should return true for cancelled status', () => {
      expect(validationHelpers.isOrderCompleted({ status: 'cancelled' })).toBe(true);
    });
    
    it('should return true for refunded status', () => {
      expect(validationHelpers.isOrderCompleted({ status: 'refunded' })).toBe(true);
    });
    
    it('should return false for pending status', () => {
      expect(validationHelpers.isOrderCompleted({ status: 'pending' })).toBe(false);
    });
    
    it('should return false for preparing status', () => {
      expect(validationHelpers.isOrderCompleted({ status: 'preparing' })).toBe(false);
    });
  });
});
