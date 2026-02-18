/**
 * Monitoring and Observability Routes
 * 
 * Purpose: Provide visibility into system health and performance
 * - Idempotency cache statistics
 * - Correlation context tracking
 * - Rate limiting statistics
 * - Transaction metrics
 * - Domain operation metrics
 */

const express = require('express');
const router = express.Router();
const idempotencyService = require('../services/idempotencyService');
const { getRateLimitStats, adminRateLimiter } = require('../middleware/rateLimiter');
const { getStats: getMessageStats } = require('../services/messageProcessor');
const InboundMessage = require('../models/InboundMessage');
const OutboundMessage = require('../models/OutboundMessage');
const authMiddleware = require('../middleware/auth');

// Apply admin rate limiting and authentication to ALL monitoring routes
router.use(adminRateLimiter);
router.use(authMiddleware);

/**
 * GET /api/monitoring/health
 * System health check
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/idempotency
 * Idempotency cache statistics
 */
router.get('/idempotency', (req, res) => {
  try {
    const stats = idempotencyService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/monitoring/rate-limits
 * Rate limiting statistics
 */
router.get('/rate-limits', (req, res) => {
  try {
    const stats = getRateLimitStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/monitoring/messages
 * Message processing statistics
 */
router.get('/messages', async (req, res) => {
  try {
    const timeRange = parseInt(req.query.hours) || 24;
    const stats = await getMessageStats(timeRange);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/monitoring/messages/detailed
 * Detailed message statistics
 */
router.get('/messages/detailed', async (req, res) => {
  try {
    const timeRange = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
    
    // Inbound statistics
    const inboundStats = await InboundMessage.aggregate([
      { $match: { receivedAt: { $gte: since } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgRetries: { $avg: '$retryCount' }
        }
      }
    ]);
    
    // Outbound statistics
    const outboundStats = await OutboundMessage.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgRetries: { $avg: '$retryCount' }
        }
      }
    ]);
    
    // Error classification
    const errorStats = await InboundMessage.aggregate([
      {
        $match: {
          status: 'failed',
          receivedAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: '$error.code',
          count: { $sum: 1 },
          isRetryable: { $first: '$error.isRetryable' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    res.json({
      timeRange: `${timeRange}h`,
      inbound: inboundStats,
      outbound: outboundStats,
      topErrors: errorStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/monitoring/performance
 * Performance metrics
 */
router.get('/performance', async (req, res) => {
  try {
    const timeRange = parseInt(req.query.hours) || 1;
    const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
    
    // Message processing times
    const processingTimes = await InboundMessage.aggregate([
      {
        $match: {
          status: 'processed',
          receivedAt: { $gte: since },
          processedAt: { $exists: true }
        }
      },
      {
        $project: {
          duration: {
            $subtract: ['$processedAt', '$receivedAt']
          }
        }
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: '$duration' },
          minDuration: { $min: '$duration' },
          maxDuration: { $max: '$duration' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      timeRange: `${timeRange}h`,
      processing: processingTimes[0] || {
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        count: 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/monitoring/errors/recent
 * Recent errors for debugging
 */
router.get('/errors/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const recentErrors = await InboundMessage.find({
      status: 'failed'
    })
    .sort({ receivedAt: -1 })
    .limit(limit)
    .select('messageId phone messageType error receivedAt retryCount')
    .lean();
    
    res.json({
      count: recentErrors.length,
      errors: recentErrors.map(e => ({
        messageId: e.messageId,
        phone: e.phone?.substring(0, 8) + '***', // Masked
        messageType: e.messageType,
        error: e.error,
        receivedAt: e.receivedAt,
        retryCount: e.retryCount
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/monitoring/cache/clear
 * Clear idempotency cache (admin only)
 */
router.post('/cache/clear', (req, res) => {
  try {
    idempotencyService.cleanExpired();
    res.json({
      success: true,
      message: 'Cache cleared'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/monitoring/summary
 * Overall system summary
 */
router.get('/summary', async (req, res) => {
  try {
    const [
      messageStats,
      idempotencyStats,
      rateLimitStats
    ] = await Promise.all([
      getMessageStats(24),
      idempotencyService.getStats(),
      Promise.resolve(getRateLimitStats())
    ]);
    
    res.json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      messages: messageStats,
      idempotency: idempotencyStats,
      rateLimits: rateLimitStats,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
