/**
 * Structured Logger Service
 * Phase 4.1: Observability - Structured Logging
 * Phase 6.5: Enhanced with daily rotation and production logging
 * 
 * Purpose: Centralized logging with structured output, log levels, and context
 * Features:
 * - Environment-aware log levels (dev vs production)
 * - Structured JSON logging for production
 * - Human-readable console for development
 * - Request correlation IDs
 * - Performance timing
 * - Error tracking with stack traces
 * - Daily log rotation (Phase 6.5)
 * - Separate error logs (Phase 6.5)
 */

const winston = require('winston');
const path = require('path');
require('winston-daily-rotate-file'); // Phase 6.5: Daily rotation

// Determine environment
const isDevelopment = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Custom format for development (human-readable)
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = '\n' + JSON.stringify(meta, null, 2);
    }
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// Custom format for production (JSON)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: logLevel,
  format: isDevelopment ? devFormat : prodFormat,
  defaultMeta: { 
    service: 'restaurant-whatsapp-bot',
    environment: process.env.NODE_ENV || 'development',
    version: '6.5'
  },
  transports: [
    // Console output
    new winston.transports.Console({
      stderrLevels: ['error']
    })
  ]
});

// Add file transports for production with daily rotation
if (!isDevelopment) {
  // Error logs - daily rotation
  logger.add(new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, '../logs/error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize: '20m', // 20MB per file
    maxFiles: '14d', // Keep 14 days
    zippedArchive: true, // Compress old logs
    format: prodFormat
  }));
  
  // Combined logs - daily rotation
  logger.add(new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, '../logs/combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '7d', // Keep 7 days
    zippedArchive: true,
    format: prodFormat
  }));
  
  // Info logs - daily rotation
  logger.add(new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, '../logs/info-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'info',
    maxSize: '20m',
    maxFiles: '3d', // Keep 3 days
    zippedArchive: true,
    format: prodFormat
  }));
}

/**
 * Create child logger with additional context
 * @param {Object} context - Additional context to include in all logs
 * @returns {Object} Child logger instance
 */
function createChildLogger(context) {
  return logger.child(context);
}

/**
 * Log with correlation ID for request tracking
 * @param {string} correlationId - Request correlation ID
 * @returns {Object} Logger with correlation context
 */
function withCorrelation(correlationId) {
  return logger.child({ correlationId });
}

/**
 * Log domain action execution
 * @param {string} domain - Domain name
 * @param {string} action - Action name
 * @param {Object} meta - Additional metadata
 */
function logDomainAction(domain, action, meta = {}) {
  logger.info(`Domain action: ${domain}.${action}`, {
    domain,
    action,
    ...meta
  });
}

/**
 * Log external API call
 * @param {string} service - Service name (razorpay, whatsapp, sheets)
 * @param {string} operation - Operation name
 * @param {Object} meta - Additional metadata
 */
function logApiCall(service, operation, meta = {}) {
  logger.info(`API call: ${service}.${operation}`, {
    service,
    operation,
    type: 'external_api',
    ...meta
  });
}

/**
 * Log performance timing
 * @param {string} operation - Operation name
 * @param {number} durationMs - Duration in milliseconds
 * @param {Object} meta - Additional metadata
 */
function logPerformance(operation, durationMs, meta = {}) {
  const level = durationMs > 1000 ? 'warn' : 'info';
  logger[level](`Performance: ${operation}`, {
    operation,
    durationMs,
    type: 'performance',
    ...meta
  });
}

/**
 * Log business event
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function logEvent(event, data = {}) {
  logger.info(`Event: ${event}`, {
    event,
    type: 'business_event',
    ...data
  });
}

/**
 * Log error with context
 * @param {string} message - Error message
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
function logError(message, error, context = {}) {
  logger.error(message, {
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name
    },
    ...context
  });
}

/**
 * Create performance timer
 * @param {string} operation - Operation name
 * @returns {Function} End function to call when operation completes
 */
function startTimer(operation) {
  const start = Date.now();
  return (meta = {}) => {
    const duration = Date.now() - start;
    logPerformance(operation, duration, meta);
    return duration;
  };
}

// Export logger and utility functions
module.exports = {
  // Winston logger instance
  logger,
  
  // Utility functions
  createChildLogger,
  withCorrelation,
  logDomainAction,
  logApiCall,
  logPerformance,
  logEvent,
  logError,
  startTimer,
  
  // Direct access to log levels
  debug: logger.debug.bind(logger),
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger),
  
  // Metadata
  getMetadata: () => ({
    version: '6.5',
    phase: 'Phase 6.5: Enhanced Logging',
    features: [
      'Environment-aware log levels',
      'Structured JSON for production',
      'Human-readable for development',
      'Correlation ID support',
      'Performance timing',
      'Error tracking',
      'Daily log rotation',
      'Compressed archives',
      'Separate error logs'
    ]
  })
};
