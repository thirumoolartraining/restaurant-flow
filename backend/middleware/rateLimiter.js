/**
 * Rate Limiting Middleware
 * 
 * Purpose: Prevent abuse and DoS attacks
 * Strategy: In-memory store (simple, no Redis needed for single instance)
 * 
 * Rate Limits:
 * - Auth endpoints: 20 requests per 15 minutes per IP
 * - Admin endpoints: 500 requests per 15 minutes per IP
 * - Webhook endpoints: 1000 requests per minute per IP
 * - Public endpoints: 500 requests per 15 minutes per IP
 */

// In-memory store for rate limiting
// Structure: { ip: { count: number, resetTime: timestamp } }
const rateLimitStore = new Map();
const logger = require('../services/logger');

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(ip);
    }
  }
}, 5 * 60 * 1000);

/**
 * Create rate limiter middleware
 * 
 * @param {Object} options - Rate limit configuration
 * @param {number} options.maxRequests - Maximum requests allowed
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {string} options.message - Error message
 * @param {string} options.keyPrefix - Prefix for rate limit key (to separate different limits)
 * @returns {Function} Express middleware
 */
function createRateLimiter(options) {
  const {
    maxRequests,
    windowMs,
    message = 'Too many requests, please try again later',
    keyPrefix = 'default'
  } = options;
  
  return (req, res, next) => {
    // Get client IP
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    
    const now = Date.now();
    const limitData = rateLimitStore.get(key);
    
    // First request or window expired
    if (!limitData || limitData.resetTime < now) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());
      
      return next();
    }
    
    // Increment count
    limitData.count++;
    
    // Check if limit exceeded
    if (limitData.count > maxRequests) {
      const retryAfter = Math.ceil((limitData.resetTime - now) / 1000);
      
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(limitData.resetTime).toISOString());
      res.setHeader('Retry-After', retryAfter);
      
      logger.warn(`⚠️ Rate limit exceeded: ${ip} (${keyPrefix})`);
      
      return res.status(429).json({
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: retryAfter,
        limit: maxRequests,
        window: `${windowMs / 1000}s`
      });
    }
    
    // Update headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - limitData.count);
    res.setHeader('X-RateLimit-Reset', new Date(limitData.resetTime).toISOString());
    
    next();
  };
}

/**
 * Pre-configured rate limiters
 */

// Auth endpoints (login, register) - strict limit
const authRateLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many authentication attempts, please try again later',
  keyPrefix: 'auth'
});

// Admin endpoints - generous limit (mobile app makes many parallel calls)
const adminRateLimiter = createRateLimiter({
  maxRequests: 500,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many admin requests, please slow down',
  keyPrefix: 'admin'
});

// Webhook endpoints - high limit (Meta sends many webhooks)
const webhookRateLimiter = createRateLimiter({
  maxRequests: 1000,
  windowMs: 60 * 1000, // 1 minute
  message: 'Webhook rate limit exceeded',
  keyPrefix: 'webhook'
});

// Public endpoints - generous limit
const publicRateLimiter = createRateLimiter({
  maxRequests: 500,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many requests, please try again later',
  keyPrefix: 'public'
});

// Strict rate limiter for sensitive operations
const strictRateLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many attempts, please try again later',
  keyPrefix: 'strict'
});

/**
 * Get rate limit statistics (for monitoring)
 */
function getRateLimitStats() {
  const stats = {
    totalKeys: rateLimitStore.size,
    byPrefix: {}
  };
  
  for (const [key, data] of rateLimitStore.entries()) {
    const prefix = key.split(':')[0];
    if (!stats.byPrefix[prefix]) {
      stats.byPrefix[prefix] = { count: 0, totalRequests: 0 };
    }
    stats.byPrefix[prefix].count++;
    stats.byPrefix[prefix].totalRequests += data.count;
  }
  
  return stats;
}

/**
 * Clear rate limit for specific IP (admin function)
 */
function clearRateLimit(ip, prefix = null) {
  if (prefix) {
    const key = `${prefix}:${ip}`;
    rateLimitStore.delete(key);
  } else {
    // Clear all prefixes for this IP
    for (const key of rateLimitStore.keys()) {
      if (key.endsWith(`:${ip}`)) {
        rateLimitStore.delete(key);
      }
    }
  }
}

module.exports = {
  createRateLimiter,
  authRateLimiter,
  adminRateLimiter,
  webhookRateLimiter,
  publicRateLimiter,
  strictRateLimiter,
  getRateLimitStats,
  clearRateLimit
};
