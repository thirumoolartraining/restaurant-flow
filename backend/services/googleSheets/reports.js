/**
 * Google Sheets - Daily Reports Domain
 * 
 * Facade for daily report Google Sheets operations.
 * Methods are bound to the core object so `this` references work correctly.
 */
const core = require('./core');

module.exports = {
  initializeDailyReportsSheet: core.initializeDailyReportsSheet.bind(core),
  saveDailyReport: core.saveDailyReport.bind(core),
  syncTodayDailyReport: core.syncTodayDailyReport.bind(core),
  getDailyReport: core.getDailyReport.bind(core),
  getReportsInRange: core.getReportsInRange.bind(core),
  saveDailyReportByDate: core.saveDailyReportByDate.bind(core),
  getAllDailyReports: core.getAllDailyReports.bind(core)
};
