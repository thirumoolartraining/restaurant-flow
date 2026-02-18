/**
 * Domain Error Handler
 * 
 * Purpose: Centralized error handling for domain operations
 * - Domain-specific error classification
 * - User-friendly error messages
 * - Error recovery strategies
 * - Error logging with context
 */

const { logger } = require('../correlationContext');
const whatsapp = require('../whatsapp');

/**
 * Domain error types
 */
const ErrorTypes = {
  VALIDATION: 'validation',
  NOT_FOUND: 'not_found',
  PERMISSION: 'permission',
  BUSINESS_RULE: 'business_rule',
  EXTERNAL_SERVICE: 'external_service',
  DATABASE: 'database',
  UNKNOWN: 'unknown'
};

/**
 * Classify domain error
 */
function classifyDomainError(error, domain, action) {
  // Validation errors
  if (error.name === 'ValidationError' || error.message.includes('validation')) {
    return {
      type: ErrorTypes.VALIDATION,
      isRetryable: false,
      userMessage: '❌ Invalid input. Please check your data and try again.'
    };
  }
  
  // Not found errors
  if (error.message.includes('not found') || error.message.includes('does not exist')) {
    return {
      type: ErrorTypes.NOT_FOUND,
      isRetryable: false,
      userMessage: '❌ Item not found. It may have been removed or is no longer available.'
    };
  }
  
  // Permission errors
  if (error.message.includes('permission') || error.message.includes('unauthorized')) {
    return {
      type: ErrorTypes.PERMISSION,
      isRetryable: false,
      userMessage: '❌ You don\'t have permission to perform this action.'
    };
  }
  
  // Business rule violations
  if (error.message.includes('business rule') || error.message.includes('constraint')) {
    return {
      type: ErrorTypes.BUSINESS_RULE,
      isRetryable: false,
      userMessage: `❌ ${error.message}`
    };
  }
  
  // External service errors
  if (error.message.includes('api') || error.message.includes('service')) {
    return {
      type: ErrorTypes.EXTERNAL_SERVICE,
      isRetryable: true,
      userMessage: '⚠️ External service temporarily unavailable. Please try again in a moment.'
    };
  }
  
  // Database errors
  if (error.name === 'MongoError' || error.message.includes('database')) {
    return {
      type: ErrorTypes.DATABASE,
      isRetryable: true,
      userMessage: '⚠️ Database error. Please try again.'
    };
  }
  
  // Unknown errors
  return {
    type: ErrorTypes.UNKNOWN,
    isRetryable: true,
    userMessage: '❌ Something went wrong. Please try again or contact support.'
  };
}

/**
 * Handle domain error
 * Logs error and sends user-friendly message
 */
async function handleDomainError(error, domain, action, customer, phone, context = {}) {
  const classification = classifyDomainError(error, domain, action);
  
  logger.error('Domain operation failed', {
    domain,
    action,
    customerId: customer?._id,
    phone,
    error: {
      message: error.message,
      type: classification.type,
      isRetryable: classification.isRetryable
    },
    context
  });
  
  // Send user-friendly error message
  try {
    await whatsapp.sendMessage(phone, classification.userMessage);
  } catch (notifyError) {
    logger.error('Failed to send error notification', {
      error: notifyError.message
    });
  }
  
  return classification;
}

/**
 * Wrap domain operation with error handling
 */
async function wrapDomainOperation(domain, action, operationFn, customer, phone, context = {}) {
  try {
    logger.debug('Domain operation started', {
      domain,
      action,
      customerId: customer?._id
    });
    
    const result = await operationFn();
    
    logger.debug('Domain operation completed', {
      domain,
      action,
      customerId: customer?._id
    });
    
    return {
      success: true,
      result
    };
    
  } catch (error) {
    const classification = await handleDomainError(
      error,
      domain,
      action,
      customer,
      phone,
      context
    );
    
    return {
      success: false,
      error: classification
    };
  }
}

/**
 * Create domain-specific error
 */
function createDomainError(type, message, details = {}) {
  const error = new Error(message);
  error.domainErrorType = type;
  error.details = details;
  return error;
}

/**
 * Validation error
 */
function validationError(message, field = null) {
  return createDomainError(ErrorTypes.VALIDATION, message, { field });
}

/**
 * Not found error
 */
function notFoundError(resource, identifier = null) {
  return createDomainError(
    ErrorTypes.NOT_FOUND,
    `${resource} not found`,
    { resource, identifier }
  );
}

/**
 * Permission error
 */
function permissionError(action, resource = null) {
  return createDomainError(
    ErrorTypes.PERMISSION,
    `Permission denied for ${action}`,
    { action, resource }
  );
}

/**
 * Business rule error
 */
function businessRuleError(message, rule = null) {
  return createDomainError(
    ErrorTypes.BUSINESS_RULE,
    message,
    { rule }
  );
}

/**
 * Get error recovery strategy
 */
function getRecoveryStrategy(classification) {
  switch (classification.type) {
    case ErrorTypes.VALIDATION:
      return {
        action: 'prompt_correction',
        message: 'Please provide valid input'
      };
      
    case ErrorTypes.NOT_FOUND:
      return {
        action: 'redirect_to_menu',
        message: 'Let\'s start over'
      };
      
    case ErrorTypes.PERMISSION:
      return {
        action: 'redirect_to_home',
        message: 'Returning to main menu'
      };
      
    case ErrorTypes.BUSINESS_RULE:
      return {
        action: 'explain_rule',
        message: 'Please review the requirements'
      };
      
    case ErrorTypes.EXTERNAL_SERVICE:
      return {
        action: 'retry_later',
        message: 'We\'ll retry automatically'
      };
      
    case ErrorTypes.DATABASE:
      return {
        action: 'retry_immediate',
        message: 'Retrying...'
      };
      
    default:
      return {
        action: 'contact_support',
        message: 'Please contact support if this persists'
      };
  }
}

module.exports = {
  ErrorTypes,
  classifyDomainError,
  handleDomainError,
  wrapDomainOperation,
  createDomainError,
  validationError,
  notFoundError,
  permissionError,
  businessRuleError,
  getRecoveryStrategy
};
