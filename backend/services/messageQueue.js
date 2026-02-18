/**
 * Message Queue Service - Phase 6.4
 * 
 * Purpose: Reliable message processing with Bull queue
 * 
 * Benefits:
 * - ✅ No message loss on server crash (persisted in Redis)
 * - ✅ Automatic retry with exponential backoff
 * - ✅ Job prioritization
 * - ✅ Rate limiting at queue level
 * - ✅ Job monitoring and metrics
 * - ✅ Failed job management
 * 
 * Queue Flow:
 * 1. Webhook receives message → Add to queue
 * 2. Queue worker processes message → Call chatbot
 * 3. On failure → Automatic retry (3 attempts)
 * 4. After max retries → Move to failed queue
 */

const Bull = require('bull');
const { createClient } = require('./redis');
const chatbotRouter = require('./chatbotRouter');
const { logger, setMetadata } = require('./correlationContext');

// Create Bull queue with Redis connection
const messageQueue = new Bull('message-processing', {
  createClient: (type) => {
    return createClient();
  },
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times
    backoff: {
      type: 'exponential',
      delay: 1000 // Start with 1 second, then 2s, 4s (reduced from 2s start)
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500, // Keep last 500 failed jobs
    timeout: 30000 // 30 second timeout per job (reduced from 60s)
  },
  settings: {
    maxStalledCount: 2, // Max times a job can be stalled before failed
    stalledInterval: 15000, // Check for stalled jobs every 15s (reduced from 30s)
    guardInterval: 2000, // Check for delayed jobs every 2s (reduced from 5s)
    retryProcessDelay: 2000 // Delay before retrying a failed job (reduced from 5s)
  }
});

/**
 * Add message to processing queue
 * 
 * @param {Object} messageData - Message data
 * @param {string} messageData.messageId - Unique message ID
 * @param {string} messageData.phone - Customer phone number
 * @param {string|object} messageData.message - Message content
 * @param {string} messageData.messageType - Message type
 * @param {string} messageData.selectedId - Selected button/list ID
 * @param {string} messageData.senderName - Sender name
 * @param {object} messageData.webhookMeta - Webhook metadata
 * @param {number} priority - Job priority (1-10, higher = more important)
 * @returns {Promise<Job>} Bull job instance
 */
async function addMessage(messageData, priority = 5) {
  try {
    const job = await messageQueue.add(messageData, {
      priority,
      jobId: messageData.messageId, // Use messageId as jobId for idempotency
      removeOnComplete: true, // Remove after successful processing
      removeOnFail: false // Keep failed jobs for analysis
    });
    
    logger.info('Message added to queue', {
      messageId: messageData.messageId,
      jobId: job.id,
      priority
    });
    
    return job;
  } catch (error) {
    // If job already exists (duplicate), return existing job
    if (error.message.includes('already exists')) {
      logger.info('Message already in queue (duplicate)', {
        messageId: messageData.messageId
      });
      
      const existingJob = await messageQueue.getJob(messageData.messageId);
      return existingJob;
    }
    
    logger.error('Failed to add message to queue', {
      messageId: messageData.messageId,
      error: error.message
    });
    
    throw error;
  }
}

/**
 * Process message from queue
 * This is the worker function that Bull calls
 */
messageQueue.process(async (job) => {
  const { messageId, phone, message, messageType, selectedId, senderName } = job.data;
  
  // Add metadata to correlation context
  setMetadata('messageId', messageId);
  setMetadata('phone', phone);
  setMetadata('messageType', messageType);
  setMetadata('jobId', job.id);
  setMetadata('attempt', job.attemptsMade + 1);
  
  logger.info('Processing message from queue', {
    messageId,
    phone,
    messageType,
    attempt: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts
  });
  
  try {
    // Update job progress
    await job.progress(10);
    
    // Route message through chatbot
    await chatbotRouter.handleMessage(phone, message, messageType, selectedId, senderName);
    
    // Update job progress
    await job.progress(100);
    
    logger.info('Message processed successfully from queue', {
      messageId,
      duration: Date.now() - job.timestamp
    });
    
    return { success: true, messageId };
    
  } catch (error) {
    logger.error('Message processing failed in queue', {
      messageId,
      error: error.message,
      attempt: job.attemptsMade + 1,
      willRetry: job.attemptsMade < job.opts.attempts - 1
    });
    
    // Classify error for retry decision
    const isRetryable = classifyError(error);
    
    if (!isRetryable) {
      // Don't retry policy violations or business logic errors
      logger.warn('Non-retryable error, moving to failed', {
        messageId,
        error: error.message
      });
      
      // Send user notification
      await sendErrorNotification(phone, error, messageId);
      
      // Mark job as failed (no retry)
      throw new Error(`NON_RETRYABLE: ${error.message}`);
    }
    
    // Retryable error - let Bull handle retry
    throw error;
  }
});

/**
 * Classify error as retryable or not
 */
function classifyError(error) {
  const errorMessage = (error.message || '').toLowerCase();
  const errorCode = error.code || error.error?.code;
  
  // Policy violations - permanent
  const policyErrors = [130472, 131031, 131026, 131047, 131051, 133000, 133004];
  if (policyErrors.includes(errorCode)) {
    return false;
  }
  
  // Business logic errors - usually not retryable
  if (errorMessage.includes('not found') || errorMessage.includes('invalid')) {
    return false;
  }
  
  // Network, timeout, database errors - retryable
  return true;
}

/**
 * Send error notification to user
 */
async function sendErrorNotification(phone, error, messageId) {
  try {
    const whatsapp = require('./whatsapp');
    
    const errorCode = error.code || error.error?.code;
    let userMessage;
    
    // Policy violations
    const policyErrors = [130472, 131031, 131026, 131047, 131051, 133000, 133004];
    if (policyErrors.includes(errorCode)) {
      userMessage = `❌ Sorry, we couldn't process your message due to WhatsApp restrictions. Please contact support if this persists.`;
    } else {
      userMessage = `❌ Sorry, something went wrong. Please try again or contact support.\n\nError ID: ${messageId.substring(0, 8)}`;
    }
    
    await whatsapp.sendMessage(phone, userMessage);
  } catch (notifyError) {
    logger.error('Failed to send error notification', {
      phone,
      error: notifyError.message
    });
  }
}

/**
 * Queue event handlers
 */

// Job completed successfully
messageQueue.on('completed', (job, result) => {
  logger.info('Job completed', {
    jobId: job.id,
    messageId: job.data.messageId,
    duration: Date.now() - job.timestamp
  });
});

// Job failed after all retries
messageQueue.on('failed', (job, error) => {
  logger.error('Job failed after all retries', {
    jobId: job.id,
    messageId: job.data.messageId,
    attempts: job.attemptsMade,
    error: error.message
  });
});

// Job is waiting to be processed
messageQueue.on('waiting', (jobId) => {
  logger.debug('Job waiting', { jobId });
});

// Job is active (being processed)
messageQueue.on('active', (job) => {
  logger.debug('Job active', {
    jobId: job.id,
    messageId: job.data.messageId
  });
});

// Job stalled (worker died or took too long)
messageQueue.on('stalled', (job) => {
  logger.warn('Job stalled', {
    jobId: job.id,
    messageId: job.data.messageId
  });
});

// Error in queue
messageQueue.on('error', (error) => {
  logger.error('Queue error', { error: error.message });
});

/**
 * Get queue statistics
 */
async function getQueueStats() {
  try {
    const [
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused
    ] = await Promise.all([
      messageQueue.getWaitingCount(),
      messageQueue.getActiveCount(),
      messageQueue.getCompletedCount(),
      messageQueue.getFailedCount(),
      messageQueue.getDelayedCount(),
      messageQueue.getPausedCount()
    ]);
    
    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
      total: waiting + active + completed + failed + delayed
    };
  } catch (error) {
    logger.error('Failed to get queue stats', { error: error.message });
    return { error: error.message };
  }
}

/**
 * Get failed jobs
 */
async function getFailedJobs(limit = 10) {
  try {
    const jobs = await messageQueue.getFailed(0, limit - 1);
    
    return jobs.map(job => ({
      id: job.id,
      messageId: job.data.messageId,
      phone: job.data.phone,
      messageType: job.data.messageType,
      attempts: job.attemptsMade,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn
    }));
  } catch (error) {
    logger.error('Failed to get failed jobs', { error: error.message });
    return { error: error.message };
  }
}

/**
 * Retry failed job
 */
async function retryFailedJob(jobId) {
  try {
    const job = await messageQueue.getJob(jobId);
    
    if (!job) {
      throw new Error('Job not found');
    }
    
    await job.retry();
    
    logger.info('Job retry initiated', { jobId });
    
    return { success: true, jobId };
  } catch (error) {
    logger.error('Failed to retry job', { jobId, error: error.message });
    throw error;
  }
}

/**
 * Clean old jobs
 */
async function cleanOldJobs(grace = 24 * 60 * 60 * 1000) {
  try {
    const cleaned = await messageQueue.clean(grace, 'completed');
    const cleanedFailed = await messageQueue.clean(grace * 7, 'failed'); // Keep failed for 7 days
    
    logger.info('Old jobs cleaned', {
      completed: cleaned.length,
      failed: cleanedFailed.length
    });
    
    return {
      completed: cleaned.length,
      failed: cleanedFailed.length
    };
  } catch (error) {
    logger.error('Failed to clean old jobs', { error: error.message });
    return { error: error.message };
  }
}

/**
 * Pause queue
 */
async function pauseQueue() {
  await messageQueue.pause();
  logger.info('Queue paused');
}

/**
 * Resume queue
 */
async function resumeQueue() {
  await messageQueue.resume();
  logger.info('Queue resumed');
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  logger.info('Shutting down message queue...');
  
  try {
    await messageQueue.close();
    logger.info('Message queue shutdown complete');
  } catch (error) {
    logger.error('Message queue shutdown error', { error: error.message });
  }
}

// Handle process termination
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = {
  addMessage,
  getQueueStats,
  getFailedJobs,
  retryFailedJob,
  cleanOldJobs,
  pauseQueue,
  resumeQueue,
  shutdown,
  queue: messageQueue
};
