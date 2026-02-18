/**
 * Reliable Google Sheets Wrapper - Phase 6.7
 * 
 * Purpose: Add retry logic and error handling to Google Sheets operations
 * 
 * Features:
 * - Automatic retry with exponential backoff
 * - Error alerting
 * - Fallback handling
 * - Sync status tracking
 */

const googleSheets = require('./googleSheets');
const logger = require('./logger');
const alerting = require('./alerting');
const metricsRedis = require('./metricsRedis');

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000; // 1 second
const MAX_DELAY = 10000; // 10 seconds

// Track sync errors
const syncErrors = new Map();

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff(fn, retries = MAX_RETRIES, delay = INITIAL_DELAY) {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) {
      throw error;
    }
    
    logger.info(`⚠️ [Sheets Retry] Attempt failed, retrying in ${delay}ms... (${retries} retries left)`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return retryWithBackoff(fn, retries - 1, Math.min(delay * 2, MAX_DELAY));
  }
}

/**
 * Add order with retry
 */
async function addOrderReliable(order) {
  const operation = 'addOrder';
  
  try {
    const result = await retryWithBackoff(async () => {
      return await googleSheets.addOrder(order);
    });
    
    // Clear error if previously failed
    if (syncErrors.has(operation)) {
      syncErrors.delete(operation);
    }
    
    await metricsRedis.recordEvent('sheets.sync.success');
    
    return result;
  } catch (error) {
    logger.error('❌ [Sheets] Failed to add order after retries:', error.message);
    
    // Track error
    const errorKey = `${operation}:${order.orderId}`;
    syncErrors.set(errorKey, {
      operation,
      orderId: order.orderId,
      error: error.message,
      timestamp: new Date(),
      retries: MAX_RETRIES
    });
    
    // Alert if too many errors
    if (syncErrors.size >= 5) {
      await alerting.sendAlert(
        'Google Sheets Sync Issues',
        `${syncErrors.size} orders failed to sync to Google Sheets`,
        'warning',
        {
          failedOrders: Array.from(syncErrors.values()).map(e => e.orderId)
        }
      );
    }
    
    await metricsRedis.recordEvent('sheets.sync.failure');
    await metricsRedis.recordError('GoogleSheetsSync', error.message);
    
    // Don't throw - allow order to be created even if sheets sync fails
    return false;
  }
}

/**
 * Update order with retry
 */
async function updateOrderReliable(orderId, updates) {
  const operation = 'updateOrder';
  
  try {
    const result = await retryWithBackoff(async () => {
      return await googleSheets.updateOrder(orderId, updates);
    });
    
    await metricsRedis.recordEvent('sheets.update.success');
    
    return result;
  } catch (error) {
    logger.error('❌ [Sheets] Failed to update order after retries:', error.message);
    
    const errorKey = `${operation}:${orderId}`;
    syncErrors.set(errorKey, {
      operation,
      orderId,
      error: error.message,
      timestamp: new Date(),
      retries: MAX_RETRIES
    });
    
    await metricsRedis.recordEvent('sheets.update.failure');
    
    return false;
  }
}

/**
 * Add customer with retry
 */
async function addCustomerReliable(customer) {
  const operation = 'addCustomer';
  
  try {
    const result = await retryWithBackoff(async () => {
      return await googleSheets.addCustomer(customer);
    });
    
    await metricsRedis.recordEvent('sheets.customer.success');
    
    return result;
  } catch (error) {
    logger.error('❌ [Sheets] Failed to add customer after retries:', error.message);
    
    await metricsRedis.recordEvent('sheets.customer.failure');
    
    return false;
  }
}

/**
 * Retry failed syncs
 */
async function retryFailedSyncs() {
  if (syncErrors.size === 0) {
    logger.info('✅ [Sheets] No failed syncs to retry');
    return { retried: 0, succeeded: 0, failed: 0 };
  }
  
  logger.info(`🔄 [Sheets] Retrying ${syncErrors.size} failed syncs...`);
  
  let succeeded = 0;
  let failed = 0;
  
  for (const [key, errorInfo] of syncErrors.entries()) {
    try {
      // Retry based on operation type
      if (errorInfo.operation === 'addOrder') {
        // Would need to fetch order from database
        logger.info(`⏭️ [Sheets] Skipping retry for ${errorInfo.orderId} (needs manual intervention)`);
        failed++;
      } else if (errorInfo.operation === 'updateOrder') {
        logger.info(`⏭️ [Sheets] Skipping retry for ${errorInfo.orderId} (needs manual intervention)`);
        failed++;
      }
      
      // Remove from error map if successful
      // syncErrors.delete(key);
      // succeeded++;
    } catch (error) {
      logger.error(`❌ [Sheets] Retry failed for ${errorInfo.orderId}:`, error.message);
      failed++;
    }
  }
  
  return {
    retried: syncErrors.size,
    succeeded,
    failed
  };
}

/**
 * Get sync status
 */
function getSyncStatus() {
  return {
    failedSyncs: syncErrors.size,
    errors: Array.from(syncErrors.values()).map(e => ({
      operation: e.operation,
      orderId: e.orderId,
      error: e.error,
      timestamp: e.timestamp,
      age: Math.round((Date.now() - e.timestamp.getTime()) / 1000) + 's'
    }))
  };
}

/**
 * Clear sync errors
 */
function clearSyncErrors() {
  const count = syncErrors.size;
  syncErrors.clear();
  logger.info(`✅ [Sheets] Cleared ${count} sync errors`);
  return count;
}

module.exports = {
  addOrderReliable,
  updateOrderReliable,
  addCustomerReliable,
  retryFailedSyncs,
  getSyncStatus,
  clearSyncErrors,
  
  // Re-export other methods from original service
  ...googleSheets
};
