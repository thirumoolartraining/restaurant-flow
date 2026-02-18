/**
 * Health Check Routes
 * Phase 5.1: Production Improvements
 * Phase 6.4: Added Redis and Queue health checks
 * 
 * Provides health check endpoints for load balancers and monitoring
 * No authentication required for health checks
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { getMetrics } = require('../services/metrics');
const redis = require('../services/redis'); // Phase 6.4
const messageQueue = require('../services/messageQueue'); // Phase 6.4

/**
 * GET /health
 * Basic health check - returns 200 if server is running
 * Used by load balancers for basic availability check
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'restaurant-whatsapp-bot'
  });
});

/**
 * GET /health/ready
 * Readiness check - returns 200 only if all dependencies are ready
 * Used by Kubernetes/orchestrators to know when to send traffic
 */
router.get('/ready', async (req, res) => {
  const checks = {
    server: 'ok',
    database: 'checking',
    redis: 'checking', // Phase 6.4
    queue: 'checking', // Phase 6.4
    timestamp: new Date().toISOString()
  };
  
  let isReady = true;
  
  // Check database connection
  try {
    if (mongoose.connection.readyState === 1) {
      checks.database = 'ok';
    } else {
      checks.database = 'not_connected';
      isReady = false;
    }
  } catch (error) {
    checks.database = 'error';
    checks.databaseError = error.message;
    isReady = false;
  }
  
  // Phase 6.4: Check Redis connection
  try {
    const redisHealth = await redis.healthCheck();
    if (redisHealth.connected) {
      checks.redis = 'ok';
    } else {
      checks.redis = 'not_connected';
      checks.redisError = redisHealth.error;
      isReady = false;
    }
  } catch (error) {
    checks.redis = 'error';
    checks.redisError = error.message;
    isReady = false;
  }
  
  // Phase 6.4: Check message queue
  try {
    const queueStats = await messageQueue.getQueueStats();
    if (queueStats && !queueStats.error) {
      checks.queue = 'ok';
      checks.queueStats = queueStats;
    } else {
      checks.queue = 'error';
      checks.queueError = queueStats.error;
      isReady = false;
    }
  } catch (error) {
    checks.queue = 'error';
    checks.queueError = error.message;
    isReady = false;
  }
  
  // Check if critical environment variables are set
  const requiredEnvVars = [
    'MONGODB_URI',
    'JWT_SECRET',
    'META_PHONE_NUMBER_ID',
    'META_ACCESS_TOKEN'
  ];
  
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
  if (missingEnvVars.length > 0) {
    checks.environment = 'missing_variables';
    checks.missingEnvVars = missingEnvVars;
    isReady = false;
  } else {
    checks.environment = 'ok';
  }
  
  const statusCode = isReady ? 200 : 503;
  res.status(statusCode).json({
    status: isReady ? 'ready' : 'not_ready',
    checks,
    uptime: process.uptime()
  });
});

/**
 * GET /health/live
 * Liveness check - returns 200 if server is alive (not deadlocked)
 * Used by Kubernetes to know when to restart the pod
 */
router.get('/live', (req, res) => {
  // Simple check - if we can respond, we're alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB'
    }
  });
});

/**
 * GET /health/metrics
 * Health check with metrics - returns health status + key metrics
 * Useful for monitoring dashboards
 */
router.get('/metrics', (req, res) => {
  try {
    const metrics = getMetrics();
    const isHealthy = metrics.requests.total === 0 || 
                      parseFloat(metrics.requests.successRate) > 50;
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      uptime: metrics.uptime.formatted,
      successRate: metrics.requests.successRate,
      totalRequests: metrics.requests.total,
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /health/detailed
 * Detailed health check with all system information
 * Useful for debugging and detailed monitoring
 */
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'checking',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(process.uptime()),
      formatted: formatUptime(process.uptime())
    },
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid,
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        unit: 'MB'
      },
      cpu: process.cpuUsage()
    },
    dependencies: {
      database: {
        status: 'checking',
        type: 'MongoDB'
      },
      externalApis: {
        whatsapp: process.env.META_ACCESS_TOKEN ? 'configured' : 'not_configured',
        razorpay: process.env.RAZORPAY_KEY_ID ? 'configured' : 'not_configured',
        cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'not_configured',
        googleSheets: process.env.GOOGLE_SHEETS_CREDENTIALS ? 'configured' : 'not_configured'
      }
    }
  };
  
  // Check database
  try {
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    health.dependencies.database.status = dbStates[dbState] || 'unknown';
    health.dependencies.database.readyState = dbState;
    
    if (dbState === 1) {
      // Get database stats
      const db = mongoose.connection.db;
      const stats = await db.stats();
      health.dependencies.database.collections = stats.collections;
      health.dependencies.database.dataSize = Math.round(stats.dataSize / 1024 / 1024) + ' MB';
    }
  } catch (error) {
    health.dependencies.database.status = 'error';
    health.dependencies.database.error = error.message;
  }
  
  // Get circuit breaker health (Phase 5.2)
  try {
    const { getCircuitBreakerHealth } = require('../services/circuitBreaker');
    health.circuitBreakers = getCircuitBreakerHealth();
  } catch (error) {
    health.circuitBreakers = { error: 'Circuit breakers not initialized' };
  }
  
  // Get metrics
  try {
    const metrics = getMetrics();
    health.metrics = {
      requests: {
        total: metrics.requests.total,
        success: metrics.requests.success,
        failure: metrics.requests.failure,
        successRate: metrics.requests.successRate
      },
      responseTimes: {
        orchestrator: metrics.responseTimes.orchestrator,
        domains: Object.keys(metrics.responseTimes.domains).length
      }
    };
  } catch (error) {
    health.metrics = { error: error.message };
  }
  
  // Determine overall status
  const isHealthy = health.dependencies.database.status === 'connected';
  health.status = isHealthy ? 'healthy' : 'degraded';
  
  res.status(isHealthy ? 200 : 503).json(health);
});

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

module.exports = router;
