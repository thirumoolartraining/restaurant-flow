/**
 * Database Query Optimizer - Phase 6.9
 * 
 * Purpose: Optimize database queries and provide query analysis
 * 
 * Features:
 * - Query execution plan analysis
 * - Slow query detection
 * - Index recommendations
 * - Query optimization suggestions
 */

const mongoose = require('mongoose');
const logger = require('./logger');
const alerting = require('./alerting');

// Slow query threshold (milliseconds)
const SLOW_QUERY_THRESHOLD = 100;

/**
 * Explain query execution plan
 */
async function explainQuery(model, query, options = {}) {
  try {
    const collection = model.collection;
    const explanation = await collection.find(query).explain('executionStats');
    
    const stats = {
      executionTimeMs: explanation.executionStats.executionTimeMs,
      totalDocsExamined: explanation.executionStats.totalDocsExamined,
      totalKeysExamined: explanation.executionStats.totalKeysExamined,
      nReturned: explanation.executionStats.nReturned,
      executionStages: explanation.executionStats.executionStages.stage,
      indexUsed: explanation.executionStats.executionStages.indexName || 'COLLSCAN',
      needsIndex: explanation.executionStats.executionStages.stage === 'COLLSCAN',
      efficiency: explanation.executionStats.nReturned / (explanation.executionStats.totalDocsExamined || 1)
    };
    
    // Alert if slow query
    if (stats.executionTimeMs > SLOW_QUERY_THRESHOLD) {
      logger.warn(`⚠️ [Query Optimizer] Slow query detected: ${stats.executionTimeMs}ms`);
    }
    
    // Alert if collection scan
    if (stats.needsIndex) {
      logger.warn(`⚠️ [Query Optimizer] Collection scan detected, consider adding index`);
    }
    
    return stats;
  } catch (error) {
    logger.error('❌ [Query Optimizer] Explain error:', error.message);
    return { error: error.message };
  }
}

/**
 * Analyze query performance
 */
async function analyzeQuery(model, query, options = {}) {
  try {
    const startTime = Date.now();
    
    // Execute query
    const results = await model.find(query, options.projection).limit(options.limit || 100);
    
    const executionTime = Date.now() - startTime;
    
    // Get explanation
    const explanation = await explainQuery(model, query);
    
    const analysis = {
      executionTime,
      resultCount: results.length,
      explanation,
      recommendations: []
    };
    
    // Generate recommendations
    if (executionTime > SLOW_QUERY_THRESHOLD) {
      analysis.recommendations.push('Query is slow, consider optimization');
    }
    
    if (explanation.needsIndex) {
      analysis.recommendations.push(`Add index on: ${JSON.stringify(query)}`);
    }
    
    if (explanation.efficiency < 0.5) {
      analysis.recommendations.push('Low efficiency, too many documents examined');
    }
    
    if (explanation.totalDocsExamined > 1000) {
      analysis.recommendations.push('Consider adding pagination or limiting results');
    }
    
    return analysis;
  } catch (error) {
    logger.error('❌ [Query Optimizer] Analyze error:', error.message);
    return { error: error.message };
  }
}

/**
 * Get index recommendations for a collection
 */
async function getIndexRecommendations(modelName) {
  try {
    const model = mongoose.model(modelName);
    const collection = model.collection;
    
    // Get current indexes
    const indexes = await collection.indexes();
    
    // Get collection stats
    const stats = await collection.stats();
    
    // Analyze slow queries from profiler
    const db = mongoose.connection.db;
    const profileCollection = db.collection('system.profile');
    
    const slowQueries = await profileCollection
      .find({
        ns: `${db.databaseName}.${collection.collectionName}`,
        millis: { $gte: SLOW_QUERY_THRESHOLD }
      })
      .sort({ ts: -1 })
      .limit(10)
      .toArray();
    
    const recommendations = [];
    
    // Analyze slow queries for missing indexes
    for (const query of slowQueries) {
      if (query.planSummary === 'COLLSCAN') {
        const queryKeys = Object.keys(query.command?.filter || query.query || {});
        if (queryKeys.length > 0) {
          recommendations.push({
            type: 'missing_index',
            fields: queryKeys,
            reason: 'Collection scan detected in slow query',
            query: query.command?.filter || query.query
          });
        }
      }
    }
    
    return {
      collection: collection.collectionName,
      currentIndexes: indexes.map(idx => ({
        name: idx.name,
        keys: idx.key,
        unique: idx.unique || false
      })),
      stats: {
        count: stats.count,
        size: Math.round(stats.size / 1024 / 1024) + 'MB',
        avgObjSize: Math.round(stats.avgObjSize) + ' bytes'
      },
      slowQueries: slowQueries.length,
      recommendations
    };
  } catch (error) {
    logger.error('❌ [Query Optimizer] Get recommendations error:', error.message);
    return { error: error.message };
  }
}

/**
 * Optimize common queries with lean() and select()
 */
function optimizeQuery(query) {
  // Add lean() for read-only queries
  if (!query._mongooseOptions?.lean) {
    query.lean();
  }
  
  return query;
}

/**
 * Create optimized query builder
 */
function createOptimizedQuery(model, filter = {}, options = {}) {
  let query = model.find(filter);
  
  // Apply lean for better performance
  if (options.lean !== false) {
    query = query.lean();
  }
  
  // Apply projection
  if (options.select) {
    query = query.select(options.select);
  }
  
  // Apply limit
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  // Apply skip
  if (options.skip) {
    query = query.skip(options.skip);
  }
  
  // Apply sort
  if (options.sort) {
    query = query.sort(options.sort);
  }
  
  // Apply populate (use sparingly)
  if (options.populate) {
    query = query.populate(options.populate);
  }
  
  return query;
}

/**
 * Monitor query performance
 */
async function monitorQuery(model, query, operation = 'find') {
  const startTime = Date.now();
  
  try {
    const result = await query;
    const executionTime = Date.now() - startTime;
    
    if (executionTime > SLOW_QUERY_THRESHOLD) {
      logger.warn(`⚠️ [Query Monitor] Slow ${operation} on ${model.modelName}: ${executionTime}ms`);
      
      // Alert if very slow
      if (executionTime > 1000) {
        await alerting.sendAlert(
          'Slow Database Query',
          `${operation} on ${model.modelName} took ${executionTime}ms`,
          'warning',
          { executionTime, operation, model: model.modelName }
        );
      }
    }
    
    return result;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error(`❌ [Query Monitor] ${operation} error on ${model.modelName}: ${error.message} (${executionTime}ms)`);
    throw error;
  }
}

/**
 * Batch operations for better performance
 */
async function batchInsert(model, documents, batchSize = 1000) {
  try {
    const results = [];
    
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const inserted = await model.insertMany(batch, { ordered: false });
      results.push(...inserted);
      
      logger.info(`✅ [Query Optimizer] Batch inserted ${inserted.length} documents`);
    }
    
    return results;
  } catch (error) {
    logger.error('❌ [Query Optimizer] Batch insert error:', error.message);
    throw error;
  }
}

/**
 * Aggregate with optimization
 */
async function optimizedAggregate(model, pipeline, options = {}) {
  try {
    // Add allowDiskUse for large aggregations
    const aggregateOptions = {
      allowDiskUse: true,
      ...options
    };
    
    const startTime = Date.now();
    const result = await model.aggregate(pipeline, aggregateOptions);
    const executionTime = Date.now() - startTime;
    
    if (executionTime > SLOW_QUERY_THRESHOLD) {
      logger.warn(`⚠️ [Query Optimizer] Slow aggregation on ${model.modelName}: ${executionTime}ms`);
    }
    
    return result;
  } catch (error) {
    logger.error('❌ [Query Optimizer] Aggregate error:', error.message);
    throw error;
  }
}

module.exports = {
  explainQuery,
  analyzeQuery,
  getIndexRecommendations,
  optimizeQuery,
  createOptimizedQuery,
  monitorQuery,
  batchInsert,
  optimizedAggregate,
  SLOW_QUERY_THRESHOLD
};
