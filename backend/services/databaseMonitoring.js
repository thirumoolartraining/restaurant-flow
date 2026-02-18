/**
 * Database Monitoring Service - Phase 6.7
 * 
 * Purpose: Monitor database performance and health
 * 
 * Features:
 * - Slow query detection
 * - Connection pool monitoring
 * - Database size tracking
 * - Index usage analysis
 * - Query performance metrics
 * - Automated alerts for issues
 */

const mongoose = require('mongoose');
const logger = require('./logger');
const alerting = require('./alerting');
const metricsRedis = require('./metricsRedis');

// Configuration
const SLOW_QUERY_THRESHOLD = 1000; // 1 second
const MONITORING_INTERVAL = 60000; // 1 minute
const ALERT_THRESHOLD = 5; // Alert after 5 slow queries

// Slow query tracking
const slowQueries = [];
let monitoringInterval = null;

/**
 * Enable MongoDB profiling for slow query detection
 */
async function enableProfiling() {
  try {
    const db = mongoose.connection.db;
    
    // Set profiling level 1 (log slow operations)
    await db.command({
      profile: 1,
      slowms: SLOW_QUERY_THRESHOLD
    });
    
    logger.info(`✅ [DB Monitor] Profiling enabled (threshold: ${SLOW_QUERY_THRESHOLD}ms)`);
    return true;
  } catch (error) {
    logger.error('❌ [DB Monitor] Failed to enable profiling:', error.message);
    return false;
  }
}

/**
 * Get slow queries from system.profile collection
 */
async function getSlowQueries(limit = 10) {
  try {
    const db = mongoose.connection.db;
    const profileCollection = db.collection('system.profile');
    
    const queries = await profileCollection
      .find({
        millis: { $gte: SLOW_QUERY_THRESHOLD }
      })
      .sort({ ts: -1 })
      .limit(limit)
      .toArray();
    
    return queries.map(q => ({
      timestamp: q.ts,
      operation: q.op,
      namespace: q.ns,
      duration: q.millis,
      query: q.command || q.query,
      planSummary: q.planSummary
    }));
  } catch (error) {
    logger.error('❌ [DB Monitor] Failed to get slow queries:', error.message);
    return [];
  }
}

/**
 * Get database statistics
 */
async function getDatabaseStats() {
  try {
    const db = mongoose.connection.db;
    const stats = await db.stats();
    
    return {
      collections: stats.collections,
      dataSize: Math.round(stats.dataSize / 1024 / 1024), // MB
      storageSize: Math.round(stats.storageSize / 1024 / 1024), // MB
      indexes: stats.indexes,
      indexSize: Math.round(stats.indexSize / 1024 / 1024), // MB
      avgObjSize: Math.round(stats.avgObjSize),
      objects: stats.objects
    };
  } catch (error) {
    logger.error('❌ [DB Monitor] Failed to get database stats:', error.message);
    return null;
  }
}

/**
 * Get connection pool statistics
 */
function getConnectionPoolStats() {
  try {
    const connection = mongoose.connection;
    
    return {
      readyState: connection.readyState,
      readyStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][connection.readyState],
      host: connection.host,
      port: connection.port,
      name: connection.name,
      models: Object.keys(connection.models).length
    };
  } catch (error) {
    logger.error('❌ [DB Monitor] Failed to get connection stats:', error.message);
    return null;
  }
}

/**
 * Analyze index usage
 */
async function analyzeIndexUsage(collectionName) {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    
    const indexStats = await collection.aggregate([
      { $indexStats: {} }
    ]).toArray();
    
    return indexStats.map(stat => ({
      name: stat.name,
      accesses: stat.accesses.ops,
      since: stat.accesses.since
    }));
  } catch (error) {
    logger.error(`❌ [DB Monitor] Failed to analyze indexes for ${collectionName}:`, error.message);
    return [];
  }
}

/**
 * Check for unused indexes
 */
async function findUnusedIndexes() {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const unusedIndexes = [];
    
    for (const coll of collections) {
      const indexStats = await analyzeIndexUsage(coll.name);
      
      for (const index of indexStats) {
        // Skip _id index
        if (index.name === '_id_') continue;
        
        // If index has 0 accesses, it's unused
        if (index.accesses === 0) {
          unusedIndexes.push({
            collection: coll.name,
            index: index.name
          });
        }
      }
    }
    
    return unusedIndexes;
  } catch (error) {
    logger.error('❌ [DB Monitor] Failed to find unused indexes:', error.message);
    return [];
  }
}

/**
 * Monitor database health
 */
async function monitorHealth() {
  try {
    // Get slow queries
    const slowQueries = await getSlowQueries(5);
    
    // Alert if too many slow queries
    if (slowQueries.length >= ALERT_THRESHOLD) {
      await alerting.sendAlert(
        'Database Performance Issue',
        `Detected ${slowQueries.length} slow queries (>${SLOW_QUERY_THRESHOLD}ms)`,
        'warning',
        {
          slowQueries: slowQueries.map(q => ({
            operation: q.operation,
            namespace: q.namespace,
            duration: `${q.duration}ms`
          }))
        }
      );
    }
    
    // Get database stats
    const dbStats = await getDatabaseStats();
    
    // Alert if database is getting large (>1GB)
    if (dbStats && dbStats.dataSize > 1024) {
      await alerting.sendAlert(
        'Database Size Warning',
        `Database size is ${dbStats.dataSize}MB`,
        'info',
        { stats: dbStats }
      );
    }
    
    // Record metrics
    if (dbStats) {
      await metricsRedis.recordEvent('db.monitoring.health_check');
    }
    
    return {
      healthy: true,
      slowQueries: slowQueries.length,
      dbStats
    };
  } catch (error) {
    logger.error('❌ [DB Monitor] Health check failed:', error.message);
    
    await alerting.alertDatabaseIssue(error);
    
    return {
      healthy: false,
      error: error.message
    };
  }
}

/**
 * Start monitoring
 */
function startMonitoring() {
  if (monitoringInterval) {
    logger.info('⚠️ [DB Monitor] Monitoring already started');
    return;
  }
  
  logger.info('🔄 [DB Monitor] Starting database monitoring...');
  
  // Enable profiling
  enableProfiling();
  
  // Run health check immediately
  monitorHealth();
  
  // Schedule periodic health checks
  monitoringInterval = setInterval(monitorHealth, MONITORING_INTERVAL);
  
  logger.info(`✅ [DB Monitor] Monitoring started (interval: ${MONITORING_INTERVAL / 1000}s)`);
}

/**
 * Stop monitoring
 */
function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info('✅ [DB Monitor] Monitoring stopped');
  }
}

/**
 * Get monitoring report
 */
async function getMonitoringReport() {
  try {
    const [slowQueries, dbStats, poolStats, unusedIndexes] = await Promise.all([
      getSlowQueries(10),
      getDatabaseStats(),
      Promise.resolve(getConnectionPoolStats()),
      findUnusedIndexes()
    ]);
    
    return {
      timestamp: new Date().toISOString(),
      slowQueries,
      databaseStats: dbStats,
      connectionPool: poolStats,
      unusedIndexes,
      monitoring: {
        enabled: !!monitoringInterval,
        interval: MONITORING_INTERVAL,
        slowQueryThreshold: SLOW_QUERY_THRESHOLD
      }
    };
  } catch (error) {
    logger.error('❌ [DB Monitor] Failed to generate report:', error.message);
    return { error: error.message };
  }
}

/**
 * Explain query plan
 */
async function explainQuery(collectionName, query) {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    
    const explanation = await collection.find(query).explain('executionStats');
    
    return {
      executionTimeMs: explanation.executionStats.executionTimeMs,
      totalDocsExamined: explanation.executionStats.totalDocsExamined,
      totalKeysExamined: explanation.executionStats.totalKeysExamined,
      nReturned: explanation.executionStats.nReturned,
      executionStages: explanation.executionStats.executionStages,
      indexUsed: explanation.executionStats.executionStages.indexName || 'COLLSCAN'
    };
  } catch (error) {
    logger.error('❌ [DB Monitor] Failed to explain query:', error.message);
    return { error: error.message };
  }
}

module.exports = {
  enableProfiling,
  getSlowQueries,
  getDatabaseStats,
  getConnectionPoolStats,
  analyzeIndexUsage,
  findUnusedIndexes,
  monitorHealth,
  startMonitoring,
  stopMonitoring,
  getMonitoringReport,
  explainQuery
};
