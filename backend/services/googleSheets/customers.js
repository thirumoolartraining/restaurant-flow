/**
 * Google Sheets - Customers Domain
 * 
 * Facade for customer-related Google Sheets operations.
 * Methods are bound to the core object so `this` references work correctly.
 */
const core = require('./core');

module.exports = {
  initializeCustomersSheet: core.initializeCustomersSheet.bind(core),
  addOrUpdateCustomer: core.addOrUpdateCustomer.bind(core),
  updateCustomerOrder: core.updateCustomerOrder.bind(core),
  getAllCustomers: core.getAllCustomers.bind(core),
  getTopCustomersBySpent: core.getTopCustomersBySpent.bind(core),
  getCustomersByMinSpent: core.getCustomersByMinSpent.bind(core),
  getCustomersByMinOrders: core.getCustomersByMinOrders.bind(core)
};
