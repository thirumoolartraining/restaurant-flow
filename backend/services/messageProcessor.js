/**
 * Message Processor - Envelope Layer (Phase 1)
 * 
 * Purpose: Wrap chatbot routing with reliability infrastructure
 * - Idempotency checking (prevent duplicate processing via InboundMessage model)
 * - Global error handling (production-safe error messages)
 * - Failure classification (policy vs transient errors)
 * - Structured logging with context
 * - Automatic retry scheduling for transient failures
 * 
 * Phase 3.2 Update: Routes through chatbotRouter instead of direct chatbot call
 * 
 * CRITICAL: This layer does NOT modify chatbot business logic
 * It's a pure infrastructure wrapper - chatbot.js remains unchanged
 * 
 * Usage: Called from webhook.js instead of direct chatbot.handleMessage()
 * Monitoring: GET /api/webhook/stats, POST /api/webhook/retry-failed
 */

const InboundMessage = require('../models/InboundMessage');
const chatbotRouter = require('./chatbotRouter'); // Phase 3.2: Use router instead of direct chatbot
const { logger, setMetadata } = require('./correlationContext');

/**
 * Sanitize error for production logging
 * Removes sensitive data, keeps useful debugging info
 */
function sanitizeError(error) {
  return {
    message: error.message || 'Unknown error',
    code: error.code || error.name || 'UNKNOWN_ERROR',
    type: error.constructor.name,
    // Include stack trace only in development
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    // Include HTTP status if available
    httpStatus: error.response?.status || error.status,
    // Include API error details if available
    apiError: error.response?.data?.error ? {
      code: error.response.data.error.code,
      message: error.response.data.error.message,
      type: error.response.data.error.type
    } : undefined
  };
}

/**
 * Classify error as retryable or not
 */
function classifyError(error) {
  const errorMessage = (error.message || '').toLowerCase();
  const errorCode = error.code || error.error?.code;
  
  // Database errors - usually transient
  if (errorMessage.includes('mongo') || errorMessage.includes('connection')) {
    return { isRetryable: true, category: 'database' };
  }
  
  // Network errors - transient
  if (errorMessage.includes('timeout') || errorMessage.includes('econnreset') || errorMessage.includes('network')) {
    return { isRetryable: true, category: 'network' };
  }
  
  // WhatsApp API errors - check specific codes
  if (errorCode) {
    // Policy violations - permanent
    const policyErrors = [130472, 131031, 131026, 131047, 131051, 133000, 133004];
    if (policyErrors.includes(errorCode)) {
      return { isRetryable: false, category: 'policy_violation' };
    }
    
    // Rate limiting - transient
    if (errorCode === 130429) {
      return { isRetryable: true, category: 'rate_limit' };
    }
  }
  
  // Business logic errors - usually not retryable
  if (errorMessage.includes('not found') || errorMessage.includes('invalid')) {
    return { isRetryable: false, category: 'business_logic' };
  }
  
  // Default: assume transient and retryable
  return { isRetryable: true, category: 'unknown' };
}

/**
 * Process incoming WhatsApp message with idempotency and error handling
 * 
 * @param {string} messageId - Unique message ID from Meta API
 * @param {string} phone - Customer phone number
 * @param {string|object} message - Message content (text or location object)
 * @param {string} messageType - Type: 'text', 'button', 'list', 'location', 'audio'
 * @param {string|null} selectedId - Selected button/list item ID
 * @param {string|null} senderName - Sender's name from Meta API
 * @param {object} webhookMeta - Webhook metadata for tracking
 * 
 * @returns {Promise<{success: boolean, duplicate: boolean, error?: object}>}
 */
async function processInboundMessage(messageId, phone, message, messageType, selectedId, senderName, webhookMeta = {}) {
  const startTime = Date.now();
  
  // Normalize phone number (remove non-digits)
  const normalizedPhone = phone.replace(/\D/g, '');
  
  // Add metadata to correlation context
  setMetadata('messageId', messageId);
  setMetadata('phone', normalizedPhone);
  setMetadata('messageType', messageType);
  
  logger.info('Processing inbound message', {
    messageId,
    phone: normalizedPhone,
    messageType
  });
  
  let inboundMessage; // Declare outside try block for error handler access
  
  try {
    // ========== STEP 1: IDEMPOTENCY CHECK ==========
    // Try to insert new InboundMessage record
    // If duplicate (unique index violation), skip processing
    
    try {
      inboundMessage = new InboundMessage({
        messageId,
        phone: normalizedPhone,
        messageType,
        content: typeof message === 'string' ? { text: message } : message,
        status: 'received',
        webhookPayload: {
          entryId: webhookMeta.entryId,
          changeId: webhookMeta.changeId,
          timestamp: webhookMeta.timestamp
        }
      });
      
      await inboundMessage.save();
      
      logger.info('New message received', { messageId });
      
    } catch (saveError) {
      // Check if error is duplicate key (E11000)
      if (saveError.code === 11000 || saveError.message.includes('duplicate key')) {
        logger.info('Duplicate message detected', { messageId });
        
        return {
          success: true,
          duplicate: true,
          message: 'Message already processed (idempotency check)'
        };
      }
      
      // Other database errors - throw to be caught by outer handler
      throw saveError;
    }
    
    // ========== STEP 2: UPDATE STATUS TO PROCESSING ==========
    inboundMessage.status = 'processing';
    await inboundMessage.save();
    
    // ========== STEP 3: ROUTE MESSAGE (BUSINESS LOGIC) ==========
    // Phase 3.2: Route through chatbotRouter instead of direct chatbot call
    // This maintains 100% behavioral compatibility while establishing router layer
    
    logger.debug('Routing message', { messageId });
    
    await chatbotRouter.handleMessage(phone, message, messageType, selectedId, senderName);
    
    // ========== STEP 4: MARK AS PROCESSED ==========
    inboundMessage.status = 'processed';
    inboundMessage.processedAt = new Date();
    await inboundMessage.save();
    
    const duration = Date.now() - startTime;
    logger.info('Message processed successfully', { messageId, duration });
    
    return {
      success: true,
      duplicate: false,
      duration
    };
    
  } catch (error) {
    // ========== GLOBAL ERROR HANDLER ==========
    
    const duration = Date.now() - startTime;
    const sanitized = sanitizeError(error);
    const classification = classifyError(error);
    
    logger.error('Message processing failed', {
      messageId,
      error: sanitized,
      classification,
      duration
    });
    
    // Update InboundMessage with error details
    if (inboundMessage) {
      inboundMessage.status = 'failed';
      inboundMessage.error = {
        message: sanitized.message,
        code: sanitized.code,
        isRetryable: classification.isRetryable
      };
      inboundMessage.retryCount += 1;
      inboundMessage.lastRetryAt = new Date();
      
      try {
        await inboundMessage.save();
      } catch (saveError) {
        logger.error(`❌ [MessageProcessor] Failed to save error state:`, saveError.message);
      }
    }
    
    // Send user-friendly error message (production-safe)
    // Don't expose internal errors to users
    try {
      const whatsapp = require('./whatsapp');
      
      let userMessage;
      
      if (classification.category === 'policy_violation') {
        userMessage = `❌ Sorry, we couldn't process your message due to WhatsApp restrictions. Please contact support if this persists.`;
      } else if (classification.category === 'rate_limit') {
        userMessage = `⏳ We're experiencing high traffic. Please try again in a few minutes.`;
      } else if (classification.isRetryable) {
        userMessage = `⚠️ We're experiencing technical difficulties. We'll retry processing your message automatically. Please wait a moment.`;
      } else {
        userMessage = `❌ Sorry, something went wrong. Please try again or contact support.\n\nError ID: ${messageId.substring(0, 8)}`;
      }
      
      await whatsapp.sendMessage(phone, userMessage);
      
    } catch (notifyError) {
      logger.error(`❌ [MessageProcessor] Failed to send error notification:`, notifyError.message);
    }
    
    return {
      success: false,
      duplicate: false,
      error: {
        ...sanitized,
        classification,
        messageId
      },
      duration
    };
  }
}

/**
 * Retry failed messages (called by scheduler)
 * 
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} batchSize - Number of messages to retry in one batch
 */
async function retryFailedMessages(maxRetries = 3, batchSize = 10) {
  logger.info(`🔄 [MessageProcessor] Starting retry job (max retries: ${maxRetries}, batch: ${batchSize})`);
  
  try {
    // Find failed messages that are retryable and haven't exceeded max retries
    const failedMessages = await InboundMessage.find({
      status: 'failed',
      'error.isRetryable': true,
      retryCount: { $lt: maxRetries },
      // Only retry messages from last 24 hours
      receivedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
    .sort({ receivedAt: 1 }) // Oldest first
    .limit(batchSize);
    
    if (failedMessages.length === 0) {
      logger.info(`✅ [MessageProcessor] No failed messages to retry`);
      return { retried: 0, succeeded: 0, failed: 0 };
    }
    
    logger.info(`🔄 [MessageProcessor] Found ${failedMessages.length} messages to retry`);
    
    let succeeded = 0;
    let failed = 0;
    
    for (const msg of failedMessages) {
      try {
        logger.info(`🔄 [MessageProcessor] Retrying message ${msg.messageId} (attempt ${msg.retryCount + 1})`);
        
        // Reset status to received for reprocessing
        msg.status = 'received';
        msg.retryCount += 1;
        msg.lastRetryAt = new Date();
        await msg.save();
        
        // Reprocess the message
        const messageContent = msg.content?.text || msg.content;
        await chatbot.handleMessage(
          msg.phone,
          messageContent,
          msg.messageType,
          null, // selectedId not stored
          null  // senderName not stored
        );
        
        // Mark as processed
        msg.status = 'processed';
        msg.processedAt = new Date();
        await msg.save();
        
        succeeded++;
        logger.info(`✅ [MessageProcessor] Retry succeeded for message ${msg.messageId}`);
        
      } catch (retryError) {
        failed++;
        
        const classification = classifyError(retryError);
        
        msg.status = 'failed';
        msg.error = {
          message: retryError.message,
          code: retryError.code,
          isRetryable: classification.isRetryable
        };
        await msg.save();
        
        logger.error(`❌ [MessageProcessor] Retry failed for message ${msg.messageId}:`, retryError.message);
      }
    }
    
    logger.info(`✅ [MessageProcessor] Retry job complete: ${succeeded} succeeded, ${failed} failed`);
    
    return {
      retried: failedMessages.length,
      succeeded,
      failed
    };
    
  } catch (error) {
    logger.error(`❌ [MessageProcessor] Retry job error:`, error.message);
    throw error;
  }
}

/**
 * Get processing statistics (for monitoring)
 */
async function getStats(timeRange = 24) {
  const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
  
  const [total, processed, failed, duplicates] = await Promise.all([
    InboundMessage.countDocuments({ receivedAt: { $gte: since } }),
    InboundMessage.countDocuments({ status: 'processed', receivedAt: { $gte: since } }),
    InboundMessage.countDocuments({ status: 'failed', receivedAt: { $gte: since } }),
    InboundMessage.countDocuments({ 
      receivedAt: { $gte: since },
      // Approximate duplicate detection by counting retries
      retryCount: { $gt: 0 }
    })
  ]);
  
  return {
    timeRange: `${timeRange}h`,
    total,
    processed,
    failed,
    duplicates,
    successRate: total > 0 ? ((processed / total) * 100).toFixed(2) + '%' : 'N/A'
  };
}

module.exports = {
  processInboundMessage,
  retryFailedMessages,
  getStats
};
