/**
 * Webhook Payload Validation Middleware
 * 
 * Purpose: Validate webhook payload structure before processing
 * - Schema validation for Meta webhook format
 * - Required field checking
 * - Type validation
 * - Malformed payload rejection
 * 
 * Security: Prevents processing of malformed/malicious payloads
 */

/**
 * Validate Meta webhook payload structure
 */
function validateMetaWebhook(req, res, next) {
  const payload = req.body;
const logger = require('../services/logger');
  
  // Check root structure
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({
      error: 'Invalid payload structure',
      code: 'INVALID_PAYLOAD'
    });
  }
  
  // Check object field
  if (payload.object !== 'whatsapp_business_account') {
    return res.status(400).json({
      error: 'Invalid object type',
      code: 'INVALID_OBJECT',
      expected: 'whatsapp_business_account',
      received: payload.object
    });
  }
  
  // Check entry array
  if (!Array.isArray(payload.entry) || payload.entry.length === 0) {
    return res.status(400).json({
      error: 'Missing or invalid entry array',
      code: 'INVALID_ENTRY'
    });
  }
  
  // Validate each entry
  for (const entry of payload.entry) {
    if (!entry.id || typeof entry.id !== 'string') {
      return res.status(400).json({
        error: 'Entry missing id field',
        code: 'MISSING_ENTRY_ID'
      });
    }
    
    if (!Array.isArray(entry.changes) || entry.changes.length === 0) {
      return res.status(400).json({
        error: 'Entry missing changes array',
        code: 'MISSING_CHANGES'
      });
    }
    
    // Validate each change
    for (const change of entry.changes) {
      if (!change.value || typeof change.value !== 'object') {
        return res.status(400).json({
          error: 'Change missing value object',
          code: 'MISSING_VALUE'
        });
      }
      
      // Check for messages or statuses
      const hasMessages = Array.isArray(change.value.messages);
      const hasStatuses = Array.isArray(change.value.statuses);
      
      if (!hasMessages && !hasStatuses) {
        return res.status(400).json({
          error: 'Change value missing messages or statuses',
          code: 'MISSING_MESSAGES_STATUSES'
        });
      }
      
      // Validate messages if present
      if (hasMessages) {
        for (const message of change.value.messages) {
          if (!message.id || typeof message.id !== 'string') {
            return res.status(400).json({
              error: 'Message missing id',
              code: 'MISSING_MESSAGE_ID'
            });
          }
          
          if (!message.from || typeof message.from !== 'string') {
            return res.status(400).json({
              error: 'Message missing from field',
              code: 'MISSING_FROM'
            });
          }
          
          if (!message.type || typeof message.type !== 'string') {
            return res.status(400).json({
              error: 'Message missing type field',
              code: 'MISSING_TYPE'
            });
          }
          
          if (!message.timestamp || typeof message.timestamp !== 'string') {
            return res.status(400).json({
              error: 'Message missing timestamp',
              code: 'MISSING_TIMESTAMP'
            });
          }
        }
      }
    }
  }
  
  // Payload is valid
  logger.info('✅ Webhook payload validated');
  next();
}

/**
 * Sanitize webhook payload (remove potentially dangerous fields)
 */
function sanitizeWebhookPayload(req, res, next) {
  const payload = req.body;
  
  // Remove any __proto__ or constructor fields (prototype pollution prevention)
  function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    delete obj.__proto__;
    delete obj.constructor;
    delete obj.prototype;
    
    for (const key in obj) {
      if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
      }
    }
    
    return obj;
  }
  
  req.body = sanitizeObject(payload);
  next();
}

/**
 * Rate limiting per phone number
 * Prevents spam from single phone number
 */
const phoneRateLimits = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_MESSAGES_PER_WINDOW = 20;

function rateLimitByPhone(req, res, next) {
  try {
    const payload = req.body;
    
    // Extract phone numbers from messages
    const phones = new Set();
    
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        for (const message of change.value?.messages || []) {
          if (message.from) {
            phones.add(message.from);
          }
        }
      }
    }
    
    // Check rate limit for each phone
    const now = Date.now();
    
    for (const phone of phones) {
      let limit = phoneRateLimits.get(phone);
      
      if (!limit) {
        limit = {
          count: 0,
          windowStart: now
        };
        phoneRateLimits.set(phone, limit);
      }
      
      // Reset window if expired
      if (now - limit.windowStart > RATE_LIMIT_WINDOW) {
        limit.count = 0;
        limit.windowStart = now;
      }
      
      // Increment count
      limit.count++;
      
      // Check if exceeded
      if (limit.count > MAX_MESSAGES_PER_WINDOW) {
        logger.warn(`⚠️ Rate limit exceeded for phone ${phone}: ${limit.count} messages in window`);
        
        return res.status(429).json({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          phone,
          retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - limit.windowStart)) / 1000)
        });
      }
    }
    
    next();
    
  } catch (error) {
    logger.error('❌ Rate limit check error:', error);
    // Don't block on rate limit errors
    next();
  }
}

// Clean expired rate limits every minute
setInterval(() => {
  const now = Date.now();
  for (const [phone, limit] of phoneRateLimits.entries()) {
    if (now - limit.windowStart > RATE_LIMIT_WINDOW * 2) {
      phoneRateLimits.delete(phone);
    }
  }
}, 60 * 1000);

/**
 * Get rate limit statistics
 */
function getRateLimitStats() {
  const stats = {
    trackedPhones: phoneRateLimits.size,
    limits: []
  };
  
  const now = Date.now();
  
  for (const [phone, limit] of phoneRateLimits.entries()) {
    if (now - limit.windowStart <= RATE_LIMIT_WINDOW) {
      stats.limits.push({
        phone: phone.substring(0, 8) + '***', // Masked for privacy
        count: limit.count,
        windowAge: Math.floor((now - limit.windowStart) / 1000)
      });
    }
  }
  
  return stats;
}

module.exports = {
  validateMetaWebhook,
  sanitizeWebhookPayload,
  rateLimitByPhone,
  getRateLimitStats
};
