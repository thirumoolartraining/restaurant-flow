const mongoose = require('mongoose');

/**
 * OutboundMessage Model
 * 
 * Purpose: Track all outgoing WhatsApp messages for reliability and audit
 * Enables retry logic, delivery confirmation, and failure analysis
 * 
 * Status Lifecycle:
 * pending → sending → sent → delivered (success path)
 *        → failed (with retry logic for transient failures)
 */
const outboundMessageSchema = new mongoose.Schema({
  // Recipient phone number
  phone: { 
    type: String, 
    required: true
  },
  
  // Message type
  messageType: {
    type: String,
    enum: ['text', 'buttons', 'list', 'image', 'template', 'location', 'cta_url', 'cta_phone'],
    required: true
  },
  
  // Message content (sanitized for storage)
  content: {
    text: String,
    buttons: [{ id: String, text: String }],
    imageUrl: String,
    templateName: String,
    // Store minimal data, not full payload
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'policy_violation'],
    default: 'pending'
  },
  
  // Meta API response
  metaMessageId: { 
    type: String
  },
  
  metaResponse: {
    code: String,
    message: String,
    timestamp: Date
  },
  
  // Failure tracking
  failureReason: {
    type: String,
    enum: [
      // Policy failures (don't retry)
      'invalid_phone',
      'blocked_user',
      'template_rejected',
      'policy_violation',
      'unsupported_message_type',
      
      // Transient failures (retry)
      'rate_limit',
      'network_timeout',
      'api_unavailable',
      'internal_error',
      'unknown'
    ]
  },
  
  isRetryable: { 
    type: Boolean, 
    default: true 
  },
  
  // Retry tracking
  retryCount: { 
    type: Number, 
    default: 0 
  },
  
  maxRetries: { 
    type: Number, 
    default: 3 
  },
  
  nextRetryAt: { 
    type: Date 
  },
  
  lastRetryAt: { 
    type: Date 
  },
  
  // Timestamps
  sentAt: { 
    type: Date 
  },
  
  deliveredAt: { 
    type: Date 
  },
  
  readAt: { 
    type: Date 
  },
  
  failedAt: { 
    type: Date 
  },
  
  // Context (for debugging)
  context: {
    conversationStep: String,
    orderId: String,
    triggeredBy: String, // 'webhook', 'admin', 'scheduler', etc.
  },
  
  // Error details (sanitized)
  error: {
    message: String,
    code: String,
    httpStatus: Number
  }
}, {
  timestamps: true
});

// Indexes for queries
outboundMessageSchema.index({ status: 1, createdAt: -1 });
outboundMessageSchema.index({ phone: 1, createdAt: -1 });
outboundMessageSchema.index({ status: 1, nextRetryAt: 1 }); // For retry scheduler
outboundMessageSchema.index({ metaMessageId: 1 }); // For status updates from Meta

// TTL index - delete successful messages after 7 days
outboundMessageSchema.index({ deliveredAt: 1 }, { 
  expireAfterSeconds: 7 * 24 * 60 * 60, // 7 days
  partialFilterExpression: { status: 'delivered' }
});

// Static method to classify failure type
outboundMessageSchema.statics.classifyFailure = function(error) {
  const errorCode = error.code || error.error?.code;
  const errorMessage = (error.message || error.error?.message || '').toLowerCase();
  const httpStatus = error.response?.status || error.status;
  
  // Policy violations (permanent failures - don't retry)
  const policyFailures = {
    // Phone number issues
    130472: 'invalid_phone', // User's number is part of an experiment
    131030: 'invalid_phone', // Recipient phone number not in allowed list (test mode)
    133000: 'invalid_phone', // Invalid phone number format
    133004: 'invalid_phone', // Phone number not on WhatsApp
    133005: 'invalid_phone', // Phone number not registered
    133006: 'invalid_phone', // Phone number not valid
    
    // User blocking/restrictions
    131031: 'blocked_user', // User cannot receive messages
    131021: 'blocked_user', // Recipient has blocked business
    131026: 'policy_violation', // Message violates WhatsApp policy
    131047: 'template_rejected', // Template message rejected
    131051: 'unsupported_message_type', // Message type not supported
    131052: 'policy_violation', // Media message violates policy
    131053: 'policy_violation', // Re-engagement message outside 24h window
    
    // Template issues
    132000: 'template_rejected', // Template does not exist
    132001: 'template_rejected', // Template paused
    132005: 'template_rejected', // Template deleted
    132007: 'template_rejected', // Template format invalid
    132012: 'template_rejected', // Template parameter count mismatch
    132015: 'template_rejected', // Template parameter format invalid
    132016: 'template_rejected', // Template parameter missing
  };
  
  if (policyFailures[errorCode]) {
    return {
      reason: policyFailures[errorCode],
      isRetryable: false
    };
  }
  
  // Rate limiting (transient - retry with backoff)
  if (errorCode === 130429 || httpStatus === 429 || errorMessage.includes('rate limit')) {
    return {
      reason: 'rate_limit',
      isRetryable: true
    };
  }
  
  // Network/timeout errors (transient)
  if (errorMessage.includes('timeout') || errorMessage.includes('econnreset') || errorMessage.includes('enotfound')) {
    return {
      reason: 'network_timeout',
      isRetryable: true
    };
  }
  
  // API unavailable (transient)
  if (httpStatus >= 500 || errorMessage.includes('service unavailable')) {
    return {
      reason: 'api_unavailable',
      isRetryable: true
    };
  }
  
  // Default to retryable internal error
  return {
    reason: 'internal_error',
    isRetryable: true
  };
};

// Instance method to calculate next retry time (exponential backoff)
outboundMessageSchema.methods.calculateNextRetry = function() {
  const baseDelay = 60 * 1000; // 1 minute
  const maxDelay = 30 * 60 * 1000; // 30 minutes
  
  // Exponential backoff: 1min, 2min, 4min, 8min, 16min, 30min (capped)
  const delay = Math.min(baseDelay * Math.pow(2, this.retryCount), maxDelay);
  
  return new Date(Date.now() + delay);
};

module.exports = mongoose.model('OutboundMessage', outboundMessageSchema);
