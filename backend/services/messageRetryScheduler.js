/**
 * Message Retry Scheduler
 * 
 * Purpose: Automatically retry failed inbound messages
 * Runs every 5 minutes to check for retryable failures
 */

const cron = require('node-cron');
const logger = require('./logger');
const messageProcessor = require('./messageProcessor');

let schedulerTask = null;

/**
 * Start the retry scheduler
 */
function start() {
  if (schedulerTask) {
    logger.info('⚠️ [RetryScheduler] Already running');
    return;
  }
  
  // Run every 5 minutes
  schedulerTask = cron.schedule('*/5 * * * *', async () => {
    logger.info('🔄 [RetryScheduler] Running retry job...');
    
    try {
      const result = await messageProcessor.retryFailedMessages(3, 10);
      
      if (result.retried > 0) {
        logger.info(`✅ [RetryScheduler] Completed: ${result.succeeded} succeeded, ${result.failed} failed`);
      }
    } catch (error) {
      logger.error('❌ [RetryScheduler] Error:', error.message);
    }
  });
  
  logger.info('✅ [RetryScheduler] Started - running every 5 minutes');
}

/**
 * Stop the retry scheduler
 */
function stop() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    logger.info('🛑 [RetryScheduler] Stopped');
  }
}

module.exports = {
  start,
  stop
};
