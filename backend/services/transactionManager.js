/**
 * Transaction Manager
 * 
 * Purpose: Provide transaction support for multi-step operations
 * - MongoDB session management
 * - Automatic rollback on errors
 * - Optimistic locking for concurrent updates
 * - Retry logic for transient failures
 * 
 * Usage:
 *   await transactionManager.execute(async (session) => {
 *     // Your operations here
 *     await model.save({ session });
 *   });
 */

const mongoose = require('mongoose');
const { logger } = require('./correlationContext');

/**
 * Execute operations within a transaction
 * Automatically commits on success, rolls back on error
 */
async function execute(operations, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 100,
    isolationLevel = 'snapshot'
  } = options;
  
  let attempt = 0;
  let lastError;
  
  while (attempt < maxRetries) {
    attempt++;
    
    const session = await mongoose.startSession();
    
    try {
      logger.debug('Transaction started', { attempt, maxRetries });
      
      // Start transaction with options
      session.startTransaction({
        readConcern: { level: isolationLevel },
        writeConcern: { w: 'majority' }
      });
      
      // Execute operations with session
      const result = await operations(session);
      
      // Commit transaction
      await session.commitTransaction();
      
      logger.debug('Transaction committed', { attempt });
      
      return result;
      
    } catch (error) {
      // Abort transaction
      await session.abortTransaction();
      
      logger.warn('Transaction aborted', {
        attempt,
        error: error.message,
        code: error.code
      });
      
      lastError = error;
      
      // Check if retryable
      if (!isRetryableError(error) || attempt >= maxRetries) {
        throw error;
      }
      
      // Wait before retry with exponential backoff
      const delay = retryDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } finally {
      session.endSession();
    }
  }
  
  throw lastError;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error) {
  // MongoDB transient transaction errors
  if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')) {
    return true;
  }
  
  // Write conflicts
  if (error.code === 112) { // WriteConflict
    return true;
  }
  
  // Network errors
  if (error.name === 'MongoNetworkError') {
    return true;
  }
  
  // Timeout errors
  if (error.name === 'MongoTimeoutError') {
    return true;
  }
  
  return false;
}

/**
 * Execute with optimistic locking
 * Checks version field before update
 */
async function executeWithOptimisticLock(model, filter, updateFn, options = {}) {
  const {
    maxRetries = 5,
    versionField = '__v'
  } = options;
  
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    
    // Find document with current version
    const doc = await model.findOne(filter);
    
    if (!doc) {
      throw new Error('Document not found');
    }
    
    const currentVersion = doc[versionField];
    
    // Apply updates
    await updateFn(doc);
    
    // Try to save with version check
    try {
      doc[versionField] = currentVersion + 1;
      
      const result = await model.updateOne(
        {
          ...filter,
          [versionField]: currentVersion
        },
        doc.toObject(),
        { runValidators: true }
      );
      
      if (result.matchedCount === 0) {
        // Version mismatch - document was modified
        logger.warn('Optimistic lock conflict', { attempt, maxRetries });
        
        if (attempt >= maxRetries) {
          throw new Error('Optimistic lock failed: too many conflicts');
        }
        
        // Retry
        continue;
      }
      
      logger.debug('Optimistic lock succeeded', { attempt });
      return doc;
      
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 50 * attempt));
    }
  }
  
  throw new Error('Optimistic lock failed: max retries exceeded');
}

/**
 * Batch operations within transaction
 * Processes items in batches to avoid memory issues
 */
async function executeBatch(items, batchSize, operationFn, options = {}) {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const batchResults = await execute(async (session) => {
      const promises = batch.map(item => operationFn(item, session));
      return Promise.all(promises);
    }, options);
    
    results.push(...batchResults);
    
    logger.debug('Batch processed', {
      batchNumber: Math.floor(i / batchSize) + 1,
      batchSize: batch.length,
      totalProcessed: results.length,
      totalItems: items.length
    });
  }
  
  return results;
}

/**
 * Execute with compensation (saga pattern)
 * Runs compensation functions if operation fails
 */
async function executeWithCompensation(steps) {
  const completedSteps = [];
  
  try {
    for (const step of steps) {
      logger.debug('Executing step', { stepName: step.name });
      
      const result = await step.execute();
      
      completedSteps.push({
        ...step,
        result
      });
    }
    
    return completedSteps.map(s => s.result);
    
  } catch (error) {
    logger.error('Step failed, running compensations', {
      error: error.message,
      completedSteps: completedSteps.length
    });
    
    // Run compensations in reverse order
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const step = completedSteps[i];
      
      if (step.compensate) {
        try {
          logger.debug('Running compensation', { stepName: step.name });
          await step.compensate(step.result);
        } catch (compensationError) {
          logger.error('Compensation failed', {
            stepName: step.name,
            error: compensationError.message
          });
        }
      }
    }
    
    throw error;
  }
}

/**
 * Check if transactions are supported
 */
async function isSupported() {
  try {
    const session = await mongoose.startSession();
    session.endSession();
    return true;
  } catch (error) {
    logger.warn('Transactions not supported', { error: error.message });
    return false;
  }
}

module.exports = {
  execute,
  executeWithOptimisticLock,
  executeBatch,
  executeWithCompensation,
  isRetryableError,
  isSupported
};
