/**
 * Google Sheets Service - Modular Entry Point
 * 
 * This directory refactors the original monolithic googleSheets.js (3300+ lines)
 * into a structured module. The full implementation lives in core.js, while
 * domain-specific facades provide focused imports for new code.
 * 
 * Structure:
 *   index.js       - Backward-compatible re-export (this file)
 *   core.js        - Full implementation (all 41 methods)
 *   constants.js   - Shared config, helpers, auth client
 *   orders.js      - Order CRUD facade
 *   customers.js   - Customer management facade
 *   reports.js     - Daily reports facade
 *   dashboard.js   - Dashboard stats facade
 *   maintenance.js - Clear/reset/reformat facade
 * 
 * Usage (backward compatible):
 *   const googleSheets = require('./services/googleSheets');
 *   googleSheets.addOrder(order);
 * 
 * Usage (focused import):
 *   const { addOrder, updateOrderStatus } = require('./services/googleSheets/orders');
 */

module.exports = require('./core');
