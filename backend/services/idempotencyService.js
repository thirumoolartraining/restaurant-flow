/**
 * Idempotency Service
 * 
 * Purpose: Prevent duplicate processing of operations
 * - Outbound message deduplication (same content to same phone)
 * - Business operation deduplication (cart operations, order placement)
 * - Request-level idempotency using correlation IDs
 * 
 * Strategy: Content-based hashing with TTL
 */

const crypto = require('crypto');
const mongoose = require('mongoose');

// In-memory cache for fast lookups (with TTL)
const idempotencyCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Generate idempotency key from operation parameters
 */
function generateKey(namespace, ...params) {
  const content = params.map(p => 
    typeof p === 'object' ? JSON.stringify(p) : String(p)
  ).join('|');
  
  const hash = crypto
    .createHash('sha256')
    .update(content)
    .digest('hex')
    .substring(0, 16);
  
  return `${namespace}:${hash}`;
}

/**
 * Check if operation is duplicate (in-memory cache)
 */
function isDuplicate(key) {
  const entry = idempotencyCache.get(key);
  
  if (!entry) return false;
  
  // Check if expired
  if (Date.now() > entry.expiresAt) {
    idempotencyCache.delete(key);
    return false;
  }
  
  return true;
}

/**
 * Mark operation as processed
 */
function markProcessed(key, ttlMs = CACHE_TTL) {
  idempotencyCache.set(key, {
    processedAt: Date.now(),
    expiresAt: Date.now() + ttlMs
  });
}

/**
 * Clean expired entries (called periodically)
 */
function cleanExpired() {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache.entries()) {
    if (now > entry.expiresAt) {
      idempotencyCache.delete(key);
    }
  }
}

// Clean every minute
setInterval(cleanExpired, 60 * 1000);

/**
 * Outbound message idempotency
 * Prevents sending duplicate messages to same phone with same content
 */
function checkOutboundMessage(phone, messageType, content) {
  const key = generateKey('outbound', phone, messageType, content);
  return {
    isDuplicate: isDuplicate(key),
    mark: () => markProcessed(key, 1 * 60 * 1000) // 1 min TTL for messages
  };
}

/**
 * Cart operation idempotency
 * Prevents duplicate add/remove operations
 */
function checkCartOperation(customerId, operation, itemId, quantity = 1) {
  const key = generateKey('cart', customerId, operation, itemId, quantity);
  return {
    isDuplicate: isDuplicate(key),
    mark: () => markProcessed(key, 30 * 1000) // 30 sec TTL for cart ops
  };
}

/**
 * Order operation idempotency
 * Prevents duplicate order placement
 */
function checkOrderOperation(customerId, operation, orderData) {
  const key = generateKey('order', customerId, operation, orderData);
  return {
    isDuplicate: isDuplicate(key),
    mark: () => markProcessed(key, 1 * 60 * 1000) // 1 min TTL for orders
  };
}

/**
 * Generic operation idempotency
 */
function checkOperation(namespace, ...params) {
  const key = generateKey(namespace, ...params);
  return {
    isDuplicate: isDuplicate(key),
    mark: () => markProcessed(key)
  };
}

/**
 * Correlation ID generation for request tracing
 */
function generateCorrelationId() {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Get cache statistics
 */
function getStats() {
  const now = Date.now();
  let active = 0;
  let expired = 0;
  
  for (const [, entry] of idempotencyCache.entries()) {
    if (now > entry.expiresAt) {
      expired++;
    } else {
      active++;
    }
  }
  
  return {
    total: idempotencyCache.size,
    active,
    expired,
    cacheTtlMs: CACHE_TTL
  };
}

module.exports = {
  generateKey,
  isDuplicate,
  markProcessed,
  checkOutboundMessage,
  checkCartOperation,
  checkOrderOperation,
  checkOperation,
  generateCorrelationId,
  getStats,
  cleanExpired
};
