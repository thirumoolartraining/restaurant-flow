/**
 * Redis Connection Service - Phase 6.4
 * 
 * Purpose: Centralized Redis connection for:
 * - Persistent rate limiting
 * - Message queue (Bull)
 * - Session management
 * - Caching (future)
 * 
 * Features:
 * - Automatic reconnection
 * - Connection pooling
 * - Health monitoring
 * - Graceful shutdown
 */

const Redis = require('ioredis');
const logger = require('./logger');

// Redis configuration
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  
  // Connection options
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  
  // Reconnection strategy
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    logger.info(`🔄 [Redis] Reconnecting... attempt ${times}, delay ${delay}ms`);
    return delay;
  },
  
  // Connection timeout
  connectTimeout: 10000,
  
  // Keep-alive
  keepAlive: 30000,
  
  // Lazy connect (connect on first command)
  lazyConnect: false
};

// Create Redis client
const redisClient = new Redis(REDIS_CONFIG);

// Connection event handlers
redisClient.on('connect', () => {
  logger.info('✅ [Redis] Connected successfully');
});

redisClient.on('ready', () => {
  logger.info('✅ [Redis] Ready to accept commands');
});

redisClient.on('error', (error) => {
  logger.error('❌ [Redis] Connection error:', error.message);
});

redisClient.on('close', () => {
  logger.info('⚠️ [Redis] Connection closed');
});

redisClient.on('reconnecting', () => {
  logger.info('🔄 [Redis] Reconnecting...');
});

redisClient.on('end', () => {
  logger.info('⚠️ [Redis] Connection ended');
});

/**
 * Get Redis client instance
 */
function getClient() {
  return redisClient;
}

/**
 * Create a new Redis client (for Bull queues)
 */
function createClient() {
  return new Redis({
    ...REDIS_CONFIG,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
}

/**
 * Check Redis connection health
 */
async function healthCheck() {
  try {
    const result = await redisClient.ping();
    return {
      status: 'healthy',
      connected: true,
      response: result,
      host: REDIS_CONFIG.host,
      port: REDIS_CONFIG.port,
      db: REDIS_CONFIG.db
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connected: false,
      error: error.message,
      host: REDIS_CONFIG.host,
      port: REDIS_CONFIG.port
    };
  }
}

/**
 * Get Redis info and statistics
 */
async function getInfo() {
  try {
    const info = await redisClient.info();
    const dbSize = await redisClient.dbsize();
    const memory = await redisClient.info('memory');
    
    return {
      connected: true,
      dbSize,
      info: parseRedisInfo(info),
      memory: parseRedisInfo(memory)
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

/**
 * Parse Redis INFO command output
 */
function parseRedisInfo(infoString) {
  const lines = infoString.split('\r\n');
  const info = {};
  
  for (const line of lines) {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split(':');
      if (key && value) {
        info[key] = value;
      }
    }
  }
  
  return info;
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  logger.info('🔄 [Redis] Shutting down...');
  
  try {
    await redisClient.quit();
    logger.info('✅ [Redis] Shutdown complete');
  } catch (error) {
    logger.error('❌ [Redis] Shutdown error:', error.message);
    // Force disconnect
    redisClient.disconnect();
  }
}

// Handle process termination
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = {
  getClient,
  createClient,
  healthCheck,
  getInfo,
  shutdown,
  REDIS_CONFIG
};
