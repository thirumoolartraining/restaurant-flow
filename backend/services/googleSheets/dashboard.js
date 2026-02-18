/**
 * Google Sheets - Dashboard Stats Domain
 * 
 * Facade for dashboard statistics Google Sheets operations.
 * Methods are bound to the core object so `this` references work correctly.
 */
const core = require('./core');

module.exports = {
  initializeDashboardStatsSheet: core.initializeDashboardStatsSheet.bind(core),
  updateDashboardStat: core.updateDashboardStat.bind(core),
  getDashboardStats: core.getDashboardStats.bind(core),
  incrementDashboardStat: core.incrementDashboardStat.bind(core)
};
