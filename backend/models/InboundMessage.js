const mongoose = require('mongoose');

/**
 * InboundMessage Model
 * 
 * Purpose: Idempotency tracking for incoming WhatsApp messages
 * Prevents duplicate processing when Meta sends the same webhook multiple times
 * 
 * Unique Index: (phone, messageId) ensures each message is processed exactly once
 */
const inboundMessageSchema = new mongoose.Schema({
  // WhatsApp message identifier from Meta API
  messageId: { 
    type: String, 
    required: true
  },
  
  // Customer phone number (normalized)
  phone: { 
    type: String, 
    required: true
  },
  
  // Message metadata
  messageType: { 
    type: String, 
    enum: ['text', 'button', 'list', 'location', 'audio', 'image', 'video', 'document'],
    required: true 
  },
  
  // Raw message content (for debugging)
  content: { 
    type: mongoose.Schema.Types.Mixed 
  },
  
  // Processing status
  status: {
    type: String,
    enum: ['received', 'processing', 'processed', 'failed'],
    default: 'received'
  },
  
  // Processing timestamps
  receivedAt: { 
    type: Date, 
    default: Date.now
  },
  
  processedAt: { 
    type: Date 
  },
  
  // Error tracking (if processing failed)
  error: {
    message: String,
    stack: String,
    code: String,
    isRetryable: Boolean
  },
  
  // Retry tracking
  retryCount: { 
    type: Number, 
    default: 0 
  },
  
  lastRetryAt: { 
    type: Date 
  },
  
  // Meta webhook metadata
  webhookPayload: {
    entryId: String,
    changeId: String,
    timestamp: Number
  }
}, {
  timestamps: true
});

// Compound unique index for idempotency
// Ensures (phone + messageId) combination is unique
inboundMessageSchema.index({ phone: 1, messageId: 1 }, { unique: true });

// Index for cleanup queries (remove old processed messages)
inboundMessageSchema.index({ status: 1, receivedAt: 1 });

// TTL index - automatically delete processed messages after 30 days
inboundMessageSchema.index({ receivedAt: 1 }, { 
  expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
  partialFilterExpression: { status: 'processed' }
});

module.exports = mongoose.model('InboundMessage', inboundMessageSchema);
