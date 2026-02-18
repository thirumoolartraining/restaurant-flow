/**
 * Google Sheets - Maintenance Domain
 * 
 * Facade for cleanup, clear, and reformat Google Sheets operations.
 * Methods are bound to the core object so `this` references work correctly.
 */
const core = require('./core');

module.exports = {
  // Cleanup
  cleanupEmptyDateHeaders: core.cleanupEmptyDateHeaders.bind(core),
  
  // Clear operations
  clearAllOrderSheets: core.clearAllOrderSheets.bind(core),
  clearCustomersSheet: core.clearCustomersSheet.bind(core),
  clearDailyReportsSheet: core.clearDailyReportsSheet.bind(core),
  clearDashboardStatsSheet: core.clearDashboardStatsSheet.bind(core),
  clearAllSheets: core.clearAllSheets.bind(core),
  
  // Reformatting
  getColumnLetter: core.getColumnLetter.bind(core),
  reformatCustomersSheet: core.reformatCustomersSheet.bind(core),
  reformatDailyReportsSheet: core.reformatDailyReportsSheet.bind(core),
  reformatDashboardStatsSheet: core.reformatDashboardStatsSheet.bind(core)
};
