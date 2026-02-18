/**
 * Data Retention Policy Service - Phase 6.7
 * 
 * Purpose: Implement automated data retention policies
 * 
 * Retention Policies:
 * - Completed orders: 90 days
 * - Cancelled orders: 30 days
 * - Failed payments: 30 days
 * - Inbound messages: 30 days
 * - Outbound messages: 30 days
 * - Logs: 14 days (handled by Winston)
 * - Metrics: 7 days (handled by Redis TTL)
 */

const Order = require('../models/Order');
const logger = require('./logger');
const InboundMessage = require('../models/InboundMessage');
const OutboundMessage = require('../models/OutboundMessage');
const alerting = require('./alerting');
const metricsRedis = require('./metricsRedis');

// Retention periods (in days)
const RETENTION_POLICIES = {
  completedOrders: 90,
  cancelledOrders: 30,
  failedPayments: 30,
  inboundMessages: 30,
  outboundMessages: 30,
  processedMessages: 7
};

/**
 * Clean old completed orders
 */
async function cleanCompletedOrders() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.completedOrders);
    
    const result = await Order.deleteMany({
      status: 'delivered',
      updatedAt: { $lt: cutoffDate }
    });
    
    logger.info(`✅ [Data Retention] Cleaned ${result.deletedCount} completed orders`);
    
    await metricsRedis.recordEvent('data_retention.orders_cleaned');
    
    return result.deletedCount;
  } catch (error) {
    logger.error('❌ [Data Retention] Failed to clean completed orders:', error.message);
    return 0;
  }
}

/**
 * Clean old cancelled orders
 */
async function cleanCancelledOrders() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.cancelledOrders);
    
    const result = await Order.deleteMany({
      status: 'cancelled',
      updatedAt: { $lt: cutoffDate }
    });
    
    logger.info(`✅ [Data Retention] Cleaned ${result.deletedCount} cancelled orders`);
    
    await metricsRedis.recordEvent('data_retention.cancelled_orders_cleaned');
    
    return result.deletedCount;
  } catch (error) {
    logger.error('❌ [Data Retention] Failed to clean cancelled orders:', error.message);
    return 0;
  }
}

/**
 * Clean old failed payments
 */
async function cleanFailedPayments() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.failedPayments);
    
    const result = await Order.deleteMany({
      paymentStatus: 'failed',
      updatedAt: { $lt: cutoffDate }
    });
    
    logger.info(`✅ [Data Retention] Cleaned ${result.deletedCount} failed payments`);
    
    await metricsRedis.recordEvent('data_retention.failed_payments_cleaned');
    
    return result.deletedCount;
  } catch (error) {
    logger.error('❌ [Data Retention] Failed to clean failed payments:', error.message);
    return 0;
  }
}

/**
 * Clean old inbound messages
 */
async function cleanInboundMessages() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.inboundMessages);
    
    const result = await InboundMessage.deleteMany({
      status: 'processed',
      processedAt: { $lt: cutoffDate }
    });
    
    logger.info(`✅ [Data Retention] Cleaned ${result.deletedCount} inbound messages`);
    
    await metricsRedis.recordEvent('data_retention.inbound_messages_cleaned');
    
    return result.deletedCount;
  } catch (error) {
    logger.error('❌ [Data Retention] Failed to clean inbound messages:', error.message);
    return 0;
  }
}

/**
 * Clean old outbound messages
 */
async function cleanOutboundMessages() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.outboundMessages);
    
    const result = await OutboundMessage.deleteMany({
      status: 'sent',
      sentAt: { $lt: cutoffDate }
    });
    
    logger.info(`✅ [Data Retention] Cleaned ${result.deletedCount} outbound messages`);
    
    await metricsRedis.recordEvent('data_retention.outbound_messages_cleaned');
    
    return result.deletedCount;
  } catch (error) {
    logger.error('❌ [Data Retention] Failed to clean outbound messages:', error.message);
    return 0;
  }
}

/**
 * Archive old data before deletion (optional)
 */
async function archiveData(collection, query, archivePath) {
  try {
    // This is a placeholder for archiving logic
    // In production, you might want to:
    // 1. Export to S3/Cloud Storage
    // 2. Export to data warehouse
    // 3. Create compressed backups
    
    logger.info(`📦 [Data Retention] Archiving ${collection} data...`);
    
    // TODO: Implement actual archiving logic
    
    return true;
  } catch (error) {
    logger.error('❌ [Data Retention] Failed to archive data:', error.message);
    return false;
  }
}

/**
 * Run all retention policies
 */
async function runRetentionPolicies() {
  logger.info('🔄 [Data Retention] Running retention policies...');
  
  const startTime = Date.now();
  
  try {
    const results = await Promise.all([
      cleanCompletedOrders(),
      cleanCancelledOrders(),
      cleanFailedPayments(),
      cleanInboundMessages(),
      cleanOutboundMessages()
    ]);
    
    const totalCleaned = results.reduce((sum, count) => sum + count, 0);
    const duration = Date.now() - startTime;
    
    logger.info(`✅ [Data Retention] Cleaned ${totalCleaned} records in ${duration}ms`);
    
    // Alert if significant data was cleaned
    if (totalCleaned > 1000) {
      await alerting.sendAlert(
        'Data Retention Policy Executed',
        `Cleaned ${totalCleaned} old records`,
        'info',
        {
          completedOrders: results[0],
          cancelledOrders: results[1],
          failedPayments: results[2],
          inboundMessages: results[3],
          outboundMessages: results[4],
          duration: `${duration}ms`
        }
      );
    }
    
    return {
      success: true,
      totalCleaned,
      duration,
      breakdown: {
        completedOrders: results[0],
        cancelledOrders: results[1],
        failedPayments: results[2],
        inboundMessages: results[3],
        outboundMessages: results[4]
      }
    };
  } catch (error) {
    logger.error('❌ [Data Retention] Failed to run retention policies:', error.message);
    
    await alerting.sendAlert(
      'Data Retention Policy Failed',
      error.message,
      'error',
      { error: error.stack }
    );
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get retention policy status
 */
async function getRetentionStatus() {
  try {
    const now = new Date();
    
    // Count records that will be cleaned
    const [
      completedOrdersCount,
      cancelledOrdersCount,
      failedPaymentsCount,
      inboundMessagesCount,
      outboundMessagesCount
    ] = await Promise.all([
      Order.countDocuments({
        status: 'delivered',
        updatedAt: { $lt: new Date(now.getTime() - RETENTION_POLICIES.completedOrders * 24 * 60 * 60 * 1000) }
      }),
      Order.countDocuments({
        status: 'cancelled',
        updatedAt: { $lt: new Date(now.getTime() - RETENTION_POLICIES.cancelledOrders * 24 * 60 * 60 * 1000) }
      }),
      Order.countDocuments({
        paymentStatus: 'failed',
        updatedAt: { $lt: new Date(now.getTime() - RETENTION_POLICIES.failedPayments * 24 * 60 * 60 * 1000) }
      }),
      InboundMessage.countDocuments({
        status: 'processed',
        processedAt: { $lt: new Date(now.getTime() - RETENTION_POLICIES.inboundMessages * 24 * 60 * 60 * 1000) }
      }),
      OutboundMessage.countDocuments({
        status: 'sent',
        sentAt: { $lt: new Date(now.getTime() - RETENTION_POLICIES.outboundMessages * 24 * 60 * 60 * 1000) }
      })
    ]);
    
    return {
      policies: RETENTION_POLICIES,
      pendingCleanup: {
        completedOrders: completedOrdersCount,
        cancelledOrders: cancelledOrdersCount,
        failedPayments: failedPaymentsCount,
        inboundMessages: inboundMessagesCount,
        outboundMessages: outboundMessagesCount,
        total: completedOrdersCount + cancelledOrdersCount + failedPaymentsCount + 
               inboundMessagesCount + outboundMessagesCount
      }
    };
  } catch (error) {
    logger.error('❌ [Data Retention] Failed to get retention status:', error.message);
    return { error: error.message };
  }
}

module.exports = {
  runRetentionPolicies,
  getRetentionStatus,
  cleanCompletedOrders,
  cleanCancelledOrders,
  cleanFailedPayments,
  cleanInboundMessages,
  cleanOutboundMessages,
  RETENTION_POLICIES
};
