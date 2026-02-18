/**
 * Migration: Create indexes for InboundMessage and OutboundMessage
 * Created: 2026-02-05
 * 
 * Purpose: Create basic indexes for message collections
 */

module.exports = {
  async up(db, client) {
    logger.info('🔄 Creating message collection indexes...');
const logger = require('../services/logger');
    
    try {
      // InboundMessages collection indexes
      await db.collection('inboundmessages').createIndex(
        { messageId: 1 },
        { unique: true, name: 'messageId_unique' }
      );
      logger.info('✅ Created messageId_unique index');
    } catch (error) {
      if (error.code === 85 || error.message.includes('already exists')) {
        logger.info('⏭️ messageId_unique index already exists, skipping');
      } else {
        throw error;
      }
    }
    
    try {
      await db.collection('inboundmessages').createIndex(
        { from: 1, timestamp: -1 },
        { name: 'from_timestamp' }
      );
      logger.info('✅ Created from_timestamp index');
    } catch (error) {
      if (error.code === 85 || error.message.includes('already exists')) {
        logger.info('⏭️ from_timestamp index already exists, skipping');
      } else {
        throw error;
      }
    }
    
    try {
      await db.collection('inboundmessages').createIndex(
        { status: 1 },
        { name: 'inbound_status' }
      );
      logger.info('✅ Created inbound_status index');
    } catch (error) {
      if (error.code === 85 || error.message.includes('already exists')) {
        logger.info('⏭️ inbound_status index already exists, skipping');
      } else {
        throw error;
      }
    }
    
    // OutboundMessages collection indexes
    try {
      await db.collection('outboundmessages').createIndex(
        { to: 1, timestamp: -1 },
        { name: 'to_timestamp' }
      );
      logger.info('✅ Created to_timestamp index');
    } catch (error) {
      if (error.code === 85 || error.message.includes('already exists')) {
        logger.info('⏭️ to_timestamp index already exists, skipping');
      } else {
        throw error;
      }
    }
    
    try {
      await db.collection('outboundmessages').createIndex(
        { status: 1 },
        { name: 'outbound_status' }
      );
      logger.info('✅ Created outbound_status index');
    } catch (error) {
      if (error.code === 85 || error.message.includes('already exists')) {
        logger.info('⏭️ outbound_status index already exists, skipping');
      } else {
        throw error;
      }
    }
    
    logger.info('✅ Message indexes migration complete');
  },

  async down(db, client) {
    logger.info('🔄 Removing message indexes...');
    
    try {
      await db.collection('inboundmessages').dropIndex('messageId_unique');
    } catch (error) {
      logger.info('⏭️ messageId_unique index not found, skipping');
    }
    
    try {
      await db.collection('inboundmessages').dropIndex('from_timestamp');
    } catch (error) {
      logger.info('⏭️ from_timestamp index not found, skipping');
    }
    
    try {
      await db.collection('inboundmessages').dropIndex('inbound_status');
    } catch (error) {
      logger.info('⏭️ inbound_status index not found, skipping');
    }
    
    try {
      await db.collection('outboundmessages').dropIndex('to_timestamp');
    } catch (error) {
      logger.info('⏭️ to_timestamp index not found, skipping');
    }
    
    try {
      await db.collection('outboundmessages').dropIndex('outbound_status');
    } catch (error) {
      logger.info('⏭️ outbound_status index not found, skipping');
    }
    
    logger.info('✅ Message indexes removed successfully');
  }
};
