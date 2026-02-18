/**
 * Database Monitoring & Management Routes - Phase 6.7
 */

const express = require('express');
const router = express.Router();
const databaseMonitoring = require('../services/databaseMonitoring');
const dataRetention = require('../services/dataRetention');
const googleSheetsReliable = require('../services/googleSheetsReliable');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const { adminRateLimiter } = require('../middleware/rateLimiter');

// All routes require admin authentication and rate limiting
router.use(adminRateLimiter);
router.use(authenticate);
router.use(authorize(['admin']));

/**
 * @route GET /api/database/monitoring/report
 * @desc Get comprehensive database monitoring report
 * @access Admin only
 */
router.get('/monitoring/report', async (req, res) => {
  try {
    const report = await databaseMonitoring.getMonitoringReport();
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/database/monitoring/slow-queries
 * @desc Get recent slow queries
 * @access Admin only
 */
router.get('/monitoring/slow-queries', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const slowQueries = await databaseMonitoring.getSlowQueries(limit);
    res.json({ slowQueries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/database/monitoring/stats
 * @desc Get database statistics
 * @access Admin only
 */
router.get('/monitoring/stats', async (req, res) => {
  try {
    const stats = await databaseMonitoring.getDatabaseStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/database/monitoring/connection
 * @desc Get connection pool statistics
 * @access Admin only
 */
router.get('/monitoring/connection', async (req, res) => {
  try {
    const stats = databaseMonitoring.getConnectionPoolStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/database/monitoring/indexes/:collection
 * @desc Analyze index usage for a collection
 * @access Admin only
 */
router.get('/monitoring/indexes/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const indexStats = await databaseMonitoring.analyzeIndexUsage(collection);
    res.json({ collection, indexes: indexStats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/database/monitoring/unused-indexes
 * @desc Find unused indexes across all collections
 * @access Admin only
 */
router.get('/monitoring/unused-indexes', async (req, res) => {
  try {
    const unusedIndexes = await databaseMonitoring.findUnusedIndexes();
    res.json({ unusedIndexes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/database/monitoring/explain
 * @desc Explain query execution plan
 * @access Admin only
 */
router.post('/monitoring/explain', async (req, res) => {
  try {
    const { collection, query } = req.body;
    
    if (!collection || !query) {
      return res.status(400).json({ error: 'Collection and query are required' });
    }
    
    const explanation = await databaseMonitoring.explainQuery(collection, query);
    res.json(explanation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/database/retention/status
 * @desc Get data retention policy status
 * @access Admin only
 */
router.get('/retention/status', async (req, res) => {
  try {
    const status = await dataRetention.getRetentionStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/database/retention/run
 * @desc Manually trigger data retention policies
 * @access Admin only
 */
router.post('/retention/run', async (req, res) => {
  try {
    const result = await dataRetention.runRetentionPolicies();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/database/sheets/sync-status
 * @desc Get Google Sheets sync status
 * @access Admin only
 */
router.get('/sheets/sync-status', async (req, res) => {
  try {
    const status = googleSheetsReliable.getSyncStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/database/sheets/retry-failed
 * @desc Retry failed Google Sheets syncs
 * @access Admin only
 */
router.post('/sheets/retry-failed', async (req, res) => {
  try {
    const result = await googleSheetsReliable.retryFailedSyncs();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/database/sheets/clear-errors
 * @desc Clear Google Sheets sync errors
 * @access Admin only
 */
router.post('/sheets/clear-errors', async (req, res) => {
  try {
    const count = googleSheetsReliable.clearSyncErrors();
    res.json({ cleared: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
