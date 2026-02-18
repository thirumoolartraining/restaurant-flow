/**
 * Correlation Context Service
 * 
 * Purpose: Track requests across service boundaries
 * - Generate correlation IDs for each request
 * - Propagate IDs through async operations
 * - Enable distributed tracing
 * - Structured logging with context
 * 
 * Uses Node.js AsyncLocalStorage for context propagation
 */

const { AsyncLocalStorage } = require('async_hooks');
const winstonLogger = require('./logger');
const crypto = require('crypto');

const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Generate unique correlation ID
 */
function generateCorrelationId() {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Initialize correlation context for request
 */
function initContext(correlationId = null, metadata = {}) {
  const context = {
    correlationId: correlationId || generateCorrelationId(),
    startTime: Date.now(),
    metadata: {
      ...metadata,
      createdAt: new Date().toISOString()
    }
  };
  
  return context;
}

/**
 * Run function with correlation context
 */
function runWithContext(context, fn) {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get current correlation context
 */
function getContext() {
  return asyncLocalStorage.getStore();
}

/**
 * Get correlation ID from current context
 */
function getCorrelationId() {
  const context = getContext();
  return context?.correlationId || 'no-correlation-id';
}

/**
 * Get metadata from current context
 */
function getMetadata(key = null) {
  const context = getContext();
  if (!context?.metadata) return null;
  
  return key ? context.metadata[key] : context.metadata;
}

/**
 * Set metadata in current context
 */
function setMetadata(key, value) {
  const context = getContext();
  if (!context) return;
  
  if (!context.metadata) {
    context.metadata = {};
  }
  
  context.metadata[key] = value;
}

/**
 * Get request duration
 */
function getDuration() {
  const context = getContext();
  if (!context?.startTime) return 0;
  
  return Date.now() - context.startTime;
}

/**
 * Structured logging with correlation context
 */
function log(level, message, data = {}) {
  const context = getContext();
  const correlationId = context?.correlationId || 'no-context';
  const duration = context ? getDuration() : 0;
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    correlationId,
    duration,
    message,
    ...data,
    metadata: context?.metadata
  };
  
  const prefix = `[${correlationId.substring(0, 12)}]`;
  
  switch (level) {
    case 'error':
      winstonLogger.error(prefix + ' ' + message, logEntry);
      break;
    case 'warn':
      winstonLogger.warn(prefix + ' ' + message, logEntry);
      break;
    case 'info':
      winstonLogger.info(prefix + ' ' + message, logEntry);
      break;
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        winstonLogger.debug(prefix + ' ' + message, logEntry);
      }
      break;
    default:
      winstonLogger.info(prefix + ' ' + message, logEntry);
  }
  
  return logEntry;
}

/**
 * Convenience logging methods
 */
const logger = {
  error: (message, data) => log('error', message, data),
  warn: (message, data) => log('warn', message, data),
  info: (message, data) => log('info', message, data),
  debug: (message, data) => log('debug', message, data)
};

/**
 * Express middleware to initialize correlation context
 */
function correlationMiddleware(req, res, next) {
  // Check for existing correlation ID in headers
  const existingId = req.headers['x-correlation-id'];
  
  const context = initContext(existingId, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', context.correlationId);
  
  // Run request handler with context
  runWithContext(context, () => {
    logger.info('Request started', {
      method: req.method,
      path: req.path
    });
    
    // Log response when finished
    res.on('finish', () => {
      logger.info('Request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: getDuration()
      });
    });
    
    next();
  });
}

/**
 * Wrap async function with correlation context propagation
 */
function wrapAsync(fn) {
  return async (...args) => {
    const context = getContext();
    if (!context) {
      // No context, run normally
      return fn(...args);
    }
    
    // Propagate context
    return runWithContext(context, () => fn(...args));
  };
}

/**
 * Get context summary for debugging
 */
function getContextSummary() {
  const context = getContext();
  
  if (!context) {
    return { hasContext: false };
  }
  
  return {
    hasContext: true,
    correlationId: context.correlationId,
    duration: getDuration(),
    metadata: context.metadata
  };
}

module.exports = {
  // Context management
  initContext,
  runWithContext,
  getContext,
  getCorrelationId,
  
  // Metadata
  getMetadata,
  setMetadata,
  
  // Utilities
  getDuration,
  generateCorrelationId,
  
  // Logging
  log,
  logger,
  
  // Middleware
  correlationMiddleware,
  
  // Async wrapping
  wrapAsync,
  
  // Debugging
  getContextSummary
};
