/**
 * Redis Caching Service - Phase 6.9
 * 
 * Purpose: Cache frequent queries to reduce database load and improve response times
 * 
 * Features:
 * - Automatic cache invalidation
 * - TTL-based expiration
 * - Cache warming
 * - Cache statistics
 * - Namespace support
 */

const redis = require('./redis');
const metricsRedis = require('./metricsRedis');
const logger = require('./logger');

// Cache TTL configurations (in seconds)
const CACHE_TTL = {
  menu: 300,           // 5 minutes
  categories: 600,     // 10 minutes
  offers: 300,         // 5 minutes
  settings: 3600,      // 1 hour
  customer: 1800,      // 30 minutes
  order: 60,           // 1 minute
  stats: 120,          // 2 minutes
  deliveryBoys: 300    // 5 minutes
};

// Cache key prefixes
const CACHE_PREFIX = {
  menu: 'menu:',
  categories: 'categories:',
  offers: 'offers:',
  settings: 'settings:',
  customer: 'customer:',
  order: 'order:',
  stats: 'stats:',
  deliveryBoys: 'delivery:'
};

/**
 * Generate cache key
 */
function getCacheKey(namespace, identifier) {
  const prefix = CACHE_PREFIX[namespace] || `${namespace}:`;
  return `${prefix}${identifier}`;
}

/**
 * Get cached data
 */
async function get(namespace, identifier) {
  try {
    const client = redis.getClient();
    if (!client) {
      logger.info('[Cache] Redis not available, skipping cache');
      return null;
    }
    
    const key = getCacheKey(namespace, identifier);
    const data = await client.get(key);
    
    if (data) {
      await metricsRedis.recordEvent('cache.hit');
      logger.info(`[Cache] Hit: ${key}`);
      return JSON.parse(data);
    }
    
    await metricsRedis.recordEvent('cache.miss');
    logger.info(`[Cache] Miss: ${key}`);
    return null;
  } catch (error) {
    logger.error('[Cache] Get error', { error: error.message });
    await metricsRedis.recordError('CacheGet', error.message);
    return null;
  }
}

/**
 * Set cached data
 */
async function set(namespace, identifier, data, customTTL = null) {
  try {
    const client = redis.getClient();
    if (!client) {
      logger.info('[Cache] Redis not available, skipping cache');
      return false;
    }
    
    const key = getCacheKey(namespace, identifier);
    const ttl = customTTL || CACHE_TTL[namespace] || 300;
    
    await client.setex(key, ttl, JSON.stringify(data));
    
    await metricsRedis.recordEvent('cache.set');
    logger.info(`[Cache] Set: ${key} (TTL: ${ttl}s)`);
    return true;
  } catch (error) {
    logger.error('[Cache] Set error', { error: error.message });
    await metricsRedis.recordError('CacheSet', error.message);
    return false;
  }
}

/**
 * Delete cached data
 */
async function del(namespace, identifier) {
  try {
    const client = redis.getClient();
    if (!client) {
      return false;
    }
    
    const key = getCacheKey(namespace, identifier);
    await client.del(key);
    
    await metricsRedis.recordEvent('cache.delete');
    logger.info(`[Cache] Deleted: ${key}`);
    return true;
  } catch (error) {
    logger.error('[Cache] Delete error', { error: error.message });
    return false;
  }
}

/**
 * Delete all cached data for a namespace
 */
async function delNamespace(namespace) {
  try {
    const client = redis.getClient();
    if (!client) {
      return false;
    }
    
    const prefix = CACHE_PREFIX[namespace] || `${namespace}:`;
    const keys = await client.keys(`${prefix}*`);
    
    if (keys.length > 0) {
      await client.del(...keys);
      logger.info(`[Cache] Deleted ${keys.length} keys from namespace: ${namespace}`);
    }
    
    await metricsRedis.recordEvent('cache.namespace_delete');
    return true;
  } catch (error) {
    logger.error('[Cache] Delete namespace error', { error: error.message });
    return false;
  }
}

/**
 * Get or set cached data (cache-aside pattern)
 */
async function getOrSet(namespace, identifier, fetchFunction, customTTL = null) {
  try {
    // Try to get from cache
    const cached = await get(namespace, identifier);
    if (cached !== null) {
      return cached;
    }
    
    // Fetch from source
    const data = await fetchFunction();
    
    // Store in cache
    if (data !== null && data !== undefined) {
      await set(namespace, identifier, data, customTTL);
    }
    
    return data;
  } catch (error) {
    logger.error('[Cache] GetOrSet error', { error: error.message });
    // Return data from source even if caching fails
    return await fetchFunction();
  }
}

/**
 * Warm cache with frequently accessed data
 */
async function warmCache() {
  try {
    logger.info('[Cache] Warming cache...');
    
    const MenuItem = require('../models/MenuItem');
    const Category = require('../models/Category');
    const Offer = require('../models/Offer');
    const Settings = require('../models/Settings');
    
    // Cache all menu items
    const menuItems = await MenuItem.find({ isAvailable: true }).lean();
    await set('menu', 'all', menuItems);
    logger.info(`[Cache] Warmed menu items: ${menuItems.length}`);
    
    // Cache all categories
    const categories = await Category.find({ isActive: true }).lean();
    await set('categories', 'all', categories);
    logger.info(`[Cache] Warmed categories: ${categories.length}`);
    
    // Cache active offers
    const offers = await Offer.find({ 
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() }
    }).lean();
    await set('offers', 'active', offers);
    logger.info(`[Cache] Warmed offers: ${offers.length}`);
    
    // Cache settings
    const settings = await Settings.findOne().lean();
    if (settings) {
      await set('settings', 'global', settings);
      logger.info('[Cache] Warmed settings');
    }
    
    logger.info('[Cache] Cache warming complete');
    return true;
  } catch (error) {
    logger.error('[Cache] Warm cache error', { error: error.message });
    return false;
  }
}

/**
 * Get cache statistics
 */
async function getStats() {
  try {
    const client = redis.getClient();
    if (!client) {
      return { error: 'Redis not available' };
    }
    
    const info = await client.info('stats');
    const dbsize = await client.dbsize();
    
    // Parse info string
    const stats = {};
    info.split('\r\n').forEach(line => {
      const [key, value] = line.split(':');
      if (key && value) {
        stats[key] = value;
      }
    });
    
    return {
      totalKeys: dbsize,
      keyspaceHits: parseInt(stats.keyspace_hits) || 0,
      keyspaceMisses: parseInt(stats.keyspace_misses) || 0,
      hitRate: stats.keyspace_hits && stats.keyspace_misses 
        ? ((parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses))) * 100).toFixed(2) + '%'
        : 'N/A',
      evictedKeys: parseInt(stats.evicted_keys) || 0,
      expiredKeys: parseInt(stats.expired_keys) || 0
    };
  } catch (error) {
    logger.error('[Cache] Get stats error', { error: error.message });
    return { error: error.message };
  }
}

/**
 * Clear all cache
 */
async function clearAll() {
  try {
    const client = redis.getClient();
    if (!client) {
      return false;
    }
    
    await client.flushdb();
    logger.info('[Cache] Cleared all cache');
    
    await metricsRedis.recordEvent('cache.clear_all');
    return true;
  } catch (error) {
    logger.error('[Cache] Clear all error', { error: error.message });
    return false;
  }
}

/**
 * Cache middleware for Express routes
 */
function cacheMiddleware(namespace, identifierFn, ttl = null) {
  return async (req, res, next) => {
    try {
      const identifier = identifierFn ? identifierFn(req) : req.originalUrl;
      const cached = await get(namespace, identifier);
      
      if (cached !== null) {
        return res.json(cached);
      }
      
      // Store original res.json
      const originalJson = res.json.bind(res);
      
      // Override res.json to cache response
      res.json = (data) => {
        set(namespace, identifier, data, ttl);
        return originalJson(data);
      };
      
      next();
    } catch (error) {
      logger.error('[Cache] Middleware error', { error: error.message });
      next();
    }
  };
}

module.exports = {
  get,
  set,
  del,
  delNamespace,
  getOrSet,
  warmCache,
  getStats,
  clearAll,
  cacheMiddleware,
  CACHE_TTL,
  CACHE_PREFIX
};
