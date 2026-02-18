/**
 * Redis-Based Rate Limiting Middleware - Phase 6.4
 * 
 * Purpose: Persistent rate limiting that survives server restarts
 * 
 * Improvements over in-memory rate limiter:
 * - ✅ Persistent across server restarts
 * - ✅ Works in multi-instance deployments
 * - ✅ Automatic expiration (no manual cleanup needed)
 * - ✅ Better performance for high traffic
 * 
 * Uses rate-limiter-flexible library with Redis store
 */

const { RateLimiterRedis } = require('rate-limiter-flexible');
const logger = require('../services/logger');
const { getClient } = require('../services/redis');

// Get Redis client
const redisClient = getClient();

/**
 * Create Redis-based rate limiter
 * 
 * @param {Object} options - Rate limit configuration
 * @param {number} options.points - Maximum requests allowed
 * @param {number} options.duration - Time window in seconds
 * @param {string} options.keyPrefix - Prefix for rate limit key
 * @param {number} options.blockDuration - Block duration after limit exceeded (seconds)
 * @returns {RateLimiterRedis} Rate limiter instance
 */
function createRateLimiter(options) {
  const {
    points,
    duration,
    keyPrefix = 'rl',
    blockDuration = 0
  } = options;
  
  return new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix,
    points, // Number of requests
    duration, // Per duration in seconds
    blockDuration, // Block for N seconds after limit exceeded
    execEvenly: false, // Do not delay requests evenly
    execEvenlyMinDelayMs: 0
  });
}

/**
 * Create rate limiter middleware
 * 
 * @param {RateLimiterRedis} rateLimiter - Rate limiter instance
 * @param {string} message - Error message
 * @returns {Function} Express middleware
 */
function createRateLimiterMiddleware(rateLimiter, message = 'Too many requests') {
  return async (req, res, next) => {
    // Get client identifier (IP address)
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    
    try {
      // Consume 1 point
      const rateLimiterRes = await rateLimiter.consume(key);
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', rateLimiter.points);
      res.setHeader('X-RateLimit-Remaining', rateLimiterRes.remainingPoints);
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());
      
      next();
      
    } catch (rateLimiterRes) {
      // Rate limit exceeded
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);
      
      res.setHeader('X-RateLimit-Limit', rateLimiter.points);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());
      res.setHeader('Retry-After', retryAfter);
      
      logger.warn(`⚠️ [RateLimit] Limit exceeded: ${key} (${rateLimiter.keyPrefix})`);
      
      return res.status(429).json({
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: retryAfter,
        limit: rateLimiter.points,
        window: `${rateLimiter.duration}s`
      });
    }
  };
}

/**
 * Pre-configured rate limiters
 */

// Auth endpoints (login, register) - strict limit
const authRateLimiter = createRateLimiter({
  points: 20,
  duration: 15 * 60, // 15 minutes
  keyPrefix: 'rl:auth',
  blockDuration: 15 * 60 // Block for 15 minutes after limit
});

const authRateLimiterMiddleware = createRateLimiterMiddleware(
  authRateLimiter,
  'Too many authentication attempts, please try again later'
);

// Admin endpoints - moderate limit
const adminRateLimiter = createRateLimiter({
  points: 100,
  duration: 15 * 60, // 15 minutes
  keyPrefix: 'rl:admin'
});

const adminRateLimiterMiddleware = createRateLimiterMiddleware(
  adminRateLimiter,
  'Too many admin requests, please slow down'
);

// Webhook endpoints - high limit (Meta sends many webhooks)
const webhookRateLimiter = createRateLimiter({
  points: 1000,
  duration: 60, // 1 minute
  keyPrefix: 'rl:webhook'
});

const webhookRateLimiterMiddleware = createRateLimiterMiddleware(
  webhookRateLimiter,
  'Webhook rate limit exceeded'
);

// Public endpoints - moderate limit
const publicRateLimiter = createRateLimiter({
  points: 200,
  duration: 15 * 60, // 15 minutes
  keyPrefix: 'rl:public'
});

const publicRateLimiterMiddleware = createRateLimiterMiddleware(
  publicRateLimiter,
  'Too many requests, please try again later'
);

// Strict rate limiter for sensitive operations
const strictRateLimiter = createRateLimiter({
  points: 5,
  duration: 15 * 60, // 15 minutes
  keyPrefix: 'rl:strict',
  blockDuration: 30 * 60 // Block for 30 minutes after limit
});

const strictRateLimiterMiddleware = createRateLimiterMiddleware(
  strictRateLimiter,
  'Too many attempts, please try again later'
);

/**
 * Get rate limit statistics
 */
async function getRateLimitStats() {
  try {
    const keys = await redisClient.keys('rl:*');
    
    const stats = {
      totalKeys: keys.length,
      byPrefix: {}
    };
    
    // Group by prefix
    for (const key of keys) {
      const prefix = key.split(':').slice(0, 2).join(':');
      if (!stats.byPrefix[prefix]) {
        stats.byPrefix[prefix] = { count: 0 };
      }
      stats.byPrefix[prefix].count++;
    }
    
    return stats;
  } catch (error) {
    logger.error('❌ [RateLimit] Failed to get stats:', error.message);
    return { error: error.message };
  }
}

/**
 * Clear rate limit for specific IP
 */
async function clearRateLimit(ip, prefix = null) {
  try {
    if (prefix) {
      const key = `${prefix}:${ip}`;
      await redisClient.del(key);
      logger.info(`✅ [RateLimit] Cleared rate limit for ${key}`);
    } else {
      // Clear all prefixes for this IP
      const keys = await redisClient.keys(`rl:*:${ip}`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
        logger.info(`✅ [RateLimit] Cleared ${keys.length} rate limits for ${ip}`);
      }
    }
    return true;
  } catch (error) {
    logger.error('❌ [RateLimit] Failed to clear rate limit:', error.message);
    return false;
  }
}

/**
 * Get rate limit info for specific IP
 */
async function getRateLimitInfo(ip, prefix = 'rl:public') {
  try {
    const key = `${prefix}:${ip}`;
    const ttl = await redisClient.ttl(key);
    const value = await redisClient.get(key);
    
    if (ttl === -2) {
      return { exists: false, message: 'No rate limit data' };
    }
    
    return {
      exists: true,
      key,
      ttl,
      value: value ? JSON.parse(value) : null,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString()
    };
  } catch (error) {
    logger.error('❌ [RateLimit] Failed to get rate limit info:', error.message);
    return { error: error.message };
  }
}

module.exports = {
  createRateLimiter,
  createRateLimiterMiddleware,
  
  // Pre-configured middleware
  authRateLimiter: authRateLimiterMiddleware,
  adminRateLimiter: adminRateLimiterMiddleware,
  webhookRateLimiter: webhookRateLimiterMiddleware,
  publicRateLimiter: publicRateLimiterMiddleware,
  strictRateLimiter: strictRateLimiterMiddleware,
  
  // Utility functions
  getRateLimitStats,
  clearRateLimit,
  getRateLimitInfo
};
