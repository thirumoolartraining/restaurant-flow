/**
 * Metrics API Routes
 * Phase 4.2: Observability - Metrics Endpoint
 * Phase 5.1: Added rate limiting
 * Phase 6.5: Redis-based persistent metrics + Alerting
 * 
 * Provides HTTP endpoint to view application metrics
 * Useful for monitoring dashboards and health checks
 */

const express = require('express');
const router = express.Router();
const metricsRedis = require('../services/metricsRedis'); // Phase 6.5: Redis metrics
const alerting = require('../services/alerting'); // Phase 6.5: Alerting
const { authenticate } = require('../middleware/authenticate');
const { authorizeAdmin } = require('../middleware/authorize');
const { adminRateLimiter } = require('../middleware/rateLimiterRedis'); // Phase 6.4: Redis rate limiter

// Apply admin rate limiting
router.use(adminRateLimiter);

/**
 * GET /api/metrics
 * Get current metrics snapshot (Redis-based)
 * Requires authentication
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const metrics = await metricsRedis.getMetrics();
    res.json({
      success: true,
      metrics,
      source: 'redis',
      persistent: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/response-times
 * Get response time statistics
 * Requires authentication
 */
router.get('/response-times', authenticate, async (req, res) => {
  try {
    const { component, detail } = req.query;
    
    if (!component) {
      return res.status(400).json({
        success: false,
        error: 'Component parameter required (orchestrator, domain, legacy)'
      });
    }
    
    const stats = await metricsRedis.getResponseTimeStats(component, detail);
    res.json({
      success: true,
      component,
      detail: detail || null,
      stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve response time stats',
      message: error.message
    });
  }
});

/**
 * POST /api/metrics/reset
 * Reset metrics counters
 * Requires admin authentication
 * Useful for testing or periodic resets
 */
router.post('/reset', authenticate, authorizeAdmin, async (req, res) => {
  try {
    await metricsRedis.resetMetrics();
    res.json({
      success: true,
      message: 'Metrics reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to reset metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/health
 * Simple health check endpoint
 * No authentication required
 */
router.get('/health', async (req, res) => {
  try {
    const metrics = await metricsRedis.getMetrics();
    const successRate = parseFloat(metrics.requests.successRate) || 0;
    const isHealthy = metrics.requests.total === 0 || successRate > 50;
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      successRate: metrics.requests.successRate,
      totalRequests: metrics.requests.total,
      dailyRequests: metrics.requests.daily,
      errors: metrics.errors
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message
    });
  }
});

// ========== Phase 6.5: Alerting Endpoints ==========

/**
 * GET /api/metrics/alerting/status
 * Get alerting configuration status
 * Requires admin authentication
 */
router.get('/alerting/status', authenticate, authorizeAdmin, (req, res) => {
  try {
    const status = alerting.getAlertingStatus();
    res.json({
      success: true,
      alerting: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get alerting status',
      message: error.message
    });
  }
});

/**
 * POST /api/metrics/alerting/test
 * Send test alert
 * Requires admin authentication
 */
router.post('/alerting/test', authenticate, authorizeAdmin, async (req, res) => {
  try {
    await alerting.sendTestAlert();
    res.json({
      success: true,
      message: 'Test alert sent successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to send test alert',
      message: error.message
    });
  }
});

/**
 * POST /api/metrics/alerting/send
 * Send custom alert
 * Requires admin authentication
 */
router.post('/alerting/send', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { title, message, severity = 'info', metadata = {} } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Title and message are required'
      });
    }
    
    await alerting.sendAlert(title, message, severity, metadata);
    
    res.json({
      success: true,
      message: 'Alert sent successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to send alert',
      message: error.message
    });
  }
});

module.exports = router;
