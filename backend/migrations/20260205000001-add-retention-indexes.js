/**
 * Migration: Add indexes for data retention queries
 * Created: 2026-02-05
 * 
 * Purpose: Optimize data retention cleanup queries
 */

module.exports = {
  async up(db, client) {
    logger.info('🔄 Creating indexes for data retention...');
const logger = require('../services/logger');
    
    // Orders collection indexes
    await db.collection('orders').createIndex(
      { status: 1, updatedAt: 1 },
      { name: 'status_updatedAt_retention' }
    );
    
    await db.collection('orders').createIndex(
      { paymentStatus: 1, updatedAt: 1 },
      { name: 'paymentStatus_updatedAt_retention' }
    );
    
    // InboundMessages collection indexes
    await db.collection('inboundmessages').createIndex(
      { status: 1, processedAt: 1 },
      { name: 'status_processedAt_retention' }
    );
    
    // OutboundMessages collection indexes
    await db.collection('outboundmessages').createIndex(
      { status: 1, sentAt: 1 },
      { name: 'status_sentAt_retention' }
    );
    
    logger.info('✅ Indexes created successfully');
  },

  async down(db, client) {
    logger.info('🔄 Removing retention indexes...');
    
    await db.collection('orders').dropIndex('status_updatedAt_retention');
    await db.collection('orders').dropIndex('paymentStatus_updatedAt_retention');
    await db.collection('inboundmessages').dropIndex('status_processedAt_retention');
    await db.collection('outboundmessages').dropIndex('status_sentAt_retention');
    
    logger.info('✅ Indexes removed successfully');
  }
};
