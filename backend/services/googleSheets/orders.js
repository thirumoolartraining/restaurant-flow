/**
 * Google Sheets - Orders Domain
 * 
 * Facade for order-related Google Sheets operations.
 * Methods are bound to the core object so `this` references work correctly.
 */
const core = require('./core');

module.exports = {
  addOrder: core.addOrder.bind(core),
  updateOrderStatus: core.updateOrderStatus.bind(core),
  initializeSheet: core.initializeSheet.bind(core),
  updateDeliveryPartner: core.updateDeliveryPartner.bind(core),
  updateActualPaymentMethod: core.updateActualPaymentMethod.bind(core),
  updatePaymentMethod: core.updatePaymentMethod.bind(core),
  getOrderHistory: core.getOrderHistory.bind(core),
  getDeliveryPartnerHistory: core.getDeliveryPartnerHistory.bind(core)
};
