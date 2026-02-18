/**
 * Redis-Based Persistent Metrics Service - Phase 6.5
 * 
 * Purpose: Replace in-memory metrics with Redis-backed persistent storage
 * 
 * Benefits:
 * - ✅ Metrics survive server restarts
 * - ✅ Works across multiple instances
 * - ✅ Real-time aggregation
 * - ✅ Time-series data with TTL
 * - ✅ Efficient counters and histograms
 * 
 * Metrics Collected:
 * - Request counters (total, success, failure)
 * - Response time histograms
 * - Domain action metrics
 * - External API call tracking
 * - Business event counters
 * - Queue metrics
 * - Error rates
 */

const { getClient } = require('./redis');
const logger = require('./logger');

const METRICS_PREFIX = 'metrics:';
const METRICS_TTL = 7 * 24 * 60 * 60; // 7 days

/**
 * Get Redis client
 */
function getRedisClient() {
  return getClient();
}

/**
 * SCAN-based replacement for redis.keys() - O(1) per call instead of O(N)
 * Iterates through keys matching a pattern without blocking Redis
 */
async function scanKeys(redis, pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

/**
 * Record incoming request
 */
async function recordRequest(messageType, route = 'unknown') {
  const redis = getRedisClient();
  const timestamp = Date.now();
  const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  try {
    await Promise.all([
      // Total requests
      redis.incr(`${METRICS_PREFIX}requests:total`),
      redis.incr(`${METRICS_PREFIX}requests:daily:${dateKey}`),
      
      // By message type
      redis.incr(`${METRICS_PREFIX}requests:type:${messageType}`),
      
      // By route
      redis.incr(`${METRICS_PREFIX}requests:route:${route}`),
      
      // Set TTL on daily key
      redis.expire(`${METRICS_PREFIX}requests:daily:${dateKey}`, METRICS_TTL)
    ]);
  } catch (error) {
    logger.error('❌ [Metrics] Failed to record request:', error.message);
  }
}

/**
 * Record request success
 */
async function recordSuccess() {
  const redis = getRedisClient();
  const dateKey = new Date().toISOString().split('T')[0];
  
  try {
    await Promise.all([
      redis.incr(`${METRICS_PREFIX}requests:success`),
      redis.incr(`${METRICS_PREFIX}requests:success:daily:${dateKey}`)
    ]);
  } catch (error) {
    logger.error('❌ [Metrics] Failed to record success:', error.message);
  }
}

/**
 * Record request failure
 */
async function recordFailure() {
  const redis = getRedisClient();
  const dateKey = new Date().toISOString().split('T')[0];
  
  try {
    await Promise.all([
      redis.incr(`${METRICS_PREFIX}requests:failure`),
      redis.incr(`${METRICS_PREFIX}requests:failure:daily:${dateKey}`)
    ]);
  } catch (error) {
    logger.error('❌ [Metrics] Failed to record failure:', error.message);
  }
}

/**
 * Record response time
 */
async function recordResponseTime(component, durationMs, detail = null) {
  const redis = getRedisClient();
  const timestamp = Date.now();
  
  try {
    const key = detail 
      ? `${METRICS_PREFIX}response_time:${component}:${detail}`
      : `${METRICS_PREFIX}response_time:${component}`;
    
    // Store in sorted set with timestamp as score
    await redis.zadd(key, timestamp, `${timestamp}:${durationMs}`);
    
    // Keep only last 1000 measurements
    await redis.zremrangebyrank(key, 0, -1001);
    
    // Set TTL
    await redis.expire(key, METRICS_TTL);
  } catch (error) {
    logger.error('❌ [Metrics] Failed to record response time:', error.message);
  }
}

/**
 * Record domain action execution
 */
async function recordDomainAction(domain, action, success = true) {
  const redis = getRedisClient();
  const key = `${METRICS_PREFIX}domain:${domain}:${action}`;
  
  try {
    await Promise.all([
      redis.hincrby(key, 'total', 1),
      redis.hincrby(key, success ? 'success' : 'failure', 1),
      redis.expire(key, METRICS_TTL)
    ]);
  } catch (error) {
    logger.error('❌ [Metrics] Failed to record domain action:', error.message);
  }
}

/**
 * Record external API call
 */
async function recordApiCall(service, success = true, durationMs = 0) {
  const redis = getRedisClient();
  const key = `${METRICS_PREFIX}api:${service}`;
  
  try {
    await Promise.all([
      redis.hincrby(key, 'calls', 1),
      redis.hincrby(key, 'failures', success ? 0 : 1),
      redis.hincrby(key, 'totalDuration', Math.round(durationMs)),
      redis.expire(key, METRICS_TTL)
    ]);
  } catch (error) {
    logger.error('❌ [Metrics] Failed to record API call:', error.message);
  }
}

/**
 * Record business event
 */
async function recordEvent(event) {
  const redis = getRedisClient();
  const dateKey = new Date().toISOString().split('T')[0];
  
  try {
    await Promise.all([
      redis.incr(`${METRICS_PREFIX}event:${event}`),
      redis.incr(`${METRICS_PREFIX}event:${event}:daily:${dateKey}`),
      redis.expire(`${METRICS_PREFIX}event:${event}:daily:${dateKey}`, METRICS_TTL)
    ]);
  } catch (error) {
    logger.error('❌ [Metrics] Failed to record event:', error.message);
  }
}

/**
 * Record error
 */
async function recordError(errorType, errorMessage) {
  const redis = getRedisClient();
  const timestamp = Date.now();
  const dateKey = new Date().toISOString().split('T')[0];
  
  try {
    await Promise.all([
      redis.incr(`${METRICS_PREFIX}errors:total`),
      redis.incr(`${METRICS_PREFIX}errors:daily:${dateKey}`),
      redis.incr(`${METRICS_PREFIX}errors:type:${errorType}`),
      redis.zadd(`${METRICS_PREFIX}errors:recent`, timestamp, JSON.stringify({
        type: errorType,
        message: errorMessage,
        timestamp
      })),
      // Keep only last 100 errors
      redis.zremrangebyrank(`${METRICS_PREFIX}errors:recent`, 0, -101)
    ]);
  } catch (error) {
    logger.error('❌ [Metrics] Failed to record error:', error.message);
  }
}

/**
 * Get current metrics snapshot
 */
async function getMetrics() {
  const redis = getRedisClient();
  const dateKey = new Date().toISOString().split('T')[0];
  
  try {
    // Get all metrics in parallel
    const [
      totalRequests,
      dailyRequests,
      successRequests,
      failureRequests,
      totalErrors,
      dailyErrors,
      requestTypes,
      requestRoutes,
      domainKeys,
      apiKeys,
      eventKeys,
      recentErrors
    ] = await Promise.all([
      redis.get(`${METRICS_PREFIX}requests:total`),
      redis.get(`${METRICS_PREFIX}requests:daily:${dateKey}`),
      redis.get(`${METRICS_PREFIX}requests:success`),
      redis.get(`${METRICS_PREFIX}requests:failure`),
      redis.get(`${METRICS_PREFIX}errors:total`),
      redis.get(`${METRICS_PREFIX}errors:daily:${dateKey}`),
      scanKeys(redis, `${METRICS_PREFIX}requests:type:*`),
      scanKeys(redis, `${METRICS_PREFIX}requests:route:*`),
      scanKeys(redis, `${METRICS_PREFIX}domain:*`),
      scanKeys(redis, `${METRICS_PREFIX}api:*`),
      scanKeys(redis, `${METRICS_PREFIX}event:*`),
      redis.zrevrange(`${METRICS_PREFIX}errors:recent`, 0, 9, 'WITHSCORES')
    ]);
    
    // Parse request types
    const byMessageType = {};
    for (const key of requestTypes) {
      const type = key.replace(`${METRICS_PREFIX}requests:type:`, '');
      byMessageType[type] = parseInt(await redis.get(key)) || 0;
    }
    
    // Parse request routes
    const byRoute = {};
    for (const key of requestRoutes) {
      const route = key.replace(`${METRICS_PREFIX}requests:route:`, '');
      byRoute[route] = parseInt(await redis.get(key)) || 0;
    }
    
    // Parse domain actions
    const domainActions = {};
    for (const key of domainKeys) {
      const name = key.replace(`${METRICS_PREFIX}domain:`, '');
      const stats = await redis.hgetall(key);
      domainActions[name] = {
        total: parseInt(stats.total) || 0,
        success: parseInt(stats.success) || 0,
        failure: parseInt(stats.failure) || 0
      };
    }
    
    // Parse API calls
    const externalApis = {};
    for (const key of apiKeys) {
      const service = key.replace(`${METRICS_PREFIX}api:`, '');
      const stats = await redis.hgetall(key);
      const calls = parseInt(stats.calls) || 0;
      const failures = parseInt(stats.failures) || 0;
      const totalDuration = parseInt(stats.totalDuration) || 0;
      
      externalApis[service] = {
        calls,
        failures,
        totalDuration,
        avgDuration: calls > 0 ? Math.round(totalDuration / calls) : 0,
        failureRate: calls > 0 ? ((failures / calls) * 100).toFixed(2) + '%' : '0%'
      };
    }
    
    // Parse business events
    const businessEvents = {};
    for (const key of eventKeys) {
      if (!key.includes(':daily:')) {
        const event = key.replace(`${METRICS_PREFIX}event:`, '');
        businessEvents[event] = parseInt(await redis.get(key)) || 0;
      }
    }
    
    // Parse recent errors
    const errors = [];
    for (let i = 0; i < recentErrors.length; i += 2) {
      try {
        errors.push(JSON.parse(recentErrors[i]));
      } catch (e) {
        // Skip invalid JSON
      }
    }
    
    const total = parseInt(totalRequests) || 0;
    const success = parseInt(successRequests) || 0;
    const failure = parseInt(failureRequests) || 0;
    
    return {
      timestamp: new Date().toISOString(),
      requests: {
        total,
        success,
        failure,
        daily: parseInt(dailyRequests) || 0,
        successRate: total > 0 ? ((success / total) * 100).toFixed(2) + '%' : '0%',
        byMessageType,
        byRoute
      },
      errors: {
        total: parseInt(totalErrors) || 0,
        daily: parseInt(dailyErrors) || 0,
        recent: errors
      },
      domainActions,
      externalApis,
      businessEvents
    };
  } catch (error) {
    logger.error('❌ [Metrics] Failed to get metrics:', error.message);
    return { error: error.message };
  }
}

/**
 * Get response time statistics
 */
async function getResponseTimeStats(component, detail = null) {
  const redis = getRedisClient();
  
  try {
    const key = detail 
      ? `${METRICS_PREFIX}response_time:${component}:${detail}`
      : `${METRICS_PREFIX}response_time:${component}`;
    
    const values = await redis.zrange(key, 0, -1);
    
    if (values.length === 0) {
      return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    // Extract durations
    const durations = values.map(v => {
      const parts = v.split(':');
      return parseInt(parts[1]);
    }).sort((a, b) => a - b);
    
    const count = durations.length;
    const avg = Math.round(durations.reduce((sum, d) => sum + d, 0) / count);
    const p50 = durations[Math.floor(count * 0.5)];
    const p95 = durations[Math.floor(count * 0.95)];
    const p99 = durations[Math.floor(count * 0.99)];
    
    return { count, avg, p50, p95, p99 };
  } catch (error) {
    logger.error('❌ [Metrics] Failed to get response time stats:', error.message);
    return { error: error.message };
  }
}

/**
 * Reset all metrics (for testing)
 */
async function resetMetrics() {
  const redis = getRedisClient();
  
  try {
    const keys = await scanKeys(redis, `${METRICS_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    logger.info(`✅ [Metrics] Reset ${keys.length} metric keys`);
  } catch (error) {
    logger.error('❌ [Metrics] Failed to reset metrics:', error.message);
  }
}

module.exports = {
  recordRequest,
  recordSuccess,
  recordFailure,
  recordResponseTime,
  recordDomainAction,
  recordApiCall,
  recordEvent,
  recordError,
  getMetrics,
  getResponseTimeStats,
  resetMetrics
};
