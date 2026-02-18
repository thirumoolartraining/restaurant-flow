/**
 * Shared Domain Utilities - Phase 6.1
 * 
 * Central export point for all shared utilities used across domain handlers
 * 
 * Purpose:
 * - Reduce code duplication
 * - Standardize common patterns
 * - Improve maintainability
 * - Enable easier testing
 * 
 * Usage:
 * const { messageHelpers, formatHelpers, validationHelpers } = require('./shared');
 * 
 * Or import specific helpers:
 * const { sendEmptyCartMessage } = require('./shared/messageHelpers');
 */

const messageHelpers = require('./messageHelpers');
const formatHelpers = require('./formatHelpers');
const validationHelpers = require('./validationHelpers');

module.exports = {
  messageHelpers,
  formatHelpers,
  validationHelpers,
  
  // Re-export commonly used functions for convenience
  ...messageHelpers,
  ...formatHelpers,
  ...validationHelpers
};
