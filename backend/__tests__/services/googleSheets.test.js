/**
 * Tests for googleSheets module structure
 * Verifies the refactored module maintains backward compatibility
 */

// Mock logger
jest.mock('../../services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('googleSheets module structure', () => {
  it('should export all methods from index.js (backward compatible)', () => {
    const googleSheets = require('../../services/googleSheets');
    
    // Core helpers
    expect(typeof googleSheets.getSheetByType).toBe('function');
    expect(typeof googleSheets.findOrderInSheet).toBe('function');
    expect(typeof googleSheets.addDateHeader).toBe('function');
    expect(typeof googleSheets.updateRowColor).toBe('function');
    expect(typeof googleSheets.addOrderToSheet).toBe('function');
    expect(typeof googleSheets.deleteOrderFromSheet).toBe('function');
    
    // Order methods
    expect(typeof googleSheets.addOrder).toBe('function');
    expect(typeof googleSheets.updateOrderStatus).toBe('function');
    expect(typeof googleSheets.initializeSheet).toBe('function');
    expect(typeof googleSheets.updateDeliveryPartner).toBe('function');
    expect(typeof googleSheets.updatePaymentMethod).toBe('function');
    expect(typeof googleSheets.getOrderHistory).toBe('function');
    expect(typeof googleSheets.getDeliveryPartnerHistory).toBe('function');
    
    // Customer methods
    expect(typeof googleSheets.initializeCustomersSheet).toBe('function');
    expect(typeof googleSheets.addOrUpdateCustomer).toBe('function');
    expect(typeof googleSheets.updateCustomerOrder).toBe('function');
    expect(typeof googleSheets.getAllCustomers).toBe('function');
    expect(typeof googleSheets.getTopCustomersBySpent).toBe('function');
    expect(typeof googleSheets.getCustomersByMinSpent).toBe('function');
    expect(typeof googleSheets.getCustomersByMinOrders).toBe('function');
    
    // Report methods
    expect(typeof googleSheets.initializeDailyReportsSheet).toBe('function');
    expect(typeof googleSheets.saveDailyReport).toBe('function');
    expect(typeof googleSheets.getDailyReport).toBe('function');
    expect(typeof googleSheets.getReportsInRange).toBe('function');
    expect(typeof googleSheets.getAllDailyReports).toBe('function');
    
    // Dashboard methods
    expect(typeof googleSheets.initializeDashboardStatsSheet).toBe('function');
    expect(typeof googleSheets.updateDashboardStat).toBe('function');
    expect(typeof googleSheets.getDashboardStats).toBe('function');
    expect(typeof googleSheets.incrementDashboardStat).toBe('function');
    
    // Maintenance methods
    expect(typeof googleSheets.cleanupEmptyDateHeaders).toBe('function');
    expect(typeof googleSheets.clearAllOrderSheets).toBe('function');
    expect(typeof googleSheets.clearAllSheets).toBe('function');
    expect(typeof googleSheets.reformatCustomersSheet).toBe('function');
    expect(typeof googleSheets.reformatDailyReportsSheet).toBe('function');
  });

  it('should export domain-specific facades', () => {
    const orders = require('../../services/googleSheets/orders');
    const customers = require('../../services/googleSheets/customers');
    const reports = require('../../services/googleSheets/reports');
    const dashboard = require('../../services/googleSheets/dashboard');
    const maintenance = require('../../services/googleSheets/maintenance');
    
    expect(Object.keys(orders).length).toBe(8);
    expect(Object.keys(customers).length).toBe(7);
    expect(Object.keys(reports).length).toBe(7);
    expect(Object.keys(dashboard).length).toBe(4);
    expect(Object.keys(maintenance).length).toBe(10);
  });

  it('should maintain method binding in facades', () => {
    const orders = require('../../services/googleSheets/orders');
    
    // Methods should be functions (bound)
    expect(typeof orders.addOrder).toBe('function');
    expect(typeof orders.updateOrderStatus).toBe('function');
    
    // Bound functions have specific characteristics - name includes 'bound'
    expect(orders.addOrder.name).toContain('bound');
  });
});
