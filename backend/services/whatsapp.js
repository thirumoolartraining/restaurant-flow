// WhatsApp Service - Meta Cloud API with Outbound Message Tracking
// Phase 5.2: Enhanced with Circuit Breaker
const metaCloud = require('./metaCloud');
const OutboundMessage = require('../models/OutboundMessage');
const idempotencyService = require('./idempotencyService');
const { logger } = require('./correlationContext');
const { executeWithCircuitBreaker } = require('./circuitBreaker');

/**
 * Wrapper to track outbound messages
 * Creates OutboundMessage record before sending, updates status after
 * Includes idempotency check to prevent duplicate messages
 * 
 * Optimized: Single DB write on success (fire-and-forget initial save)
 */
async function trackOutbound(phone, messageType, contentSummary, sendFunction) {
  const normalizedPhone = phone.replace(/\D/g, '');
  
  // Idempotency check - prevent duplicate messages
  const idempotencyCheck = idempotencyService.checkOutboundMessage(
    normalizedPhone,
    messageType,
    contentSummary
  );
  
  if (idempotencyCheck.isDuplicate) {
    logger.info('Duplicate outbound message prevented', {
      phone: normalizedPhone,
      messageType
    });
    
    return {
      duplicate: true,
      message: 'Message already sent (idempotency check)'
    };
  }
  
  // Create outbound message record with 'sending' status directly
  // Skip the intermediate 'pending' save — reduces 1 DB round-trip (~15-30ms)
  const outboundMsg = new OutboundMessage({
    phone: normalizedPhone,
    messageType,
    content: contentSummary,
    status: 'sending'
  });
  
  // Fire-and-forget the initial save — don't await it before calling Meta API
  // The record will be updated with the final status after the API call
  const initialSavePromise = outboundMsg.save().catch(err => {
    logger.error('Failed to save initial outbound record', { phone: normalizedPhone, error: err.message });
  });
  
  try {
    // Call actual send function immediately (don't wait for DB)
    const response = await sendFunction();
    
    // Mark as processed in idempotency cache
    idempotencyCheck.mark();
    
    // Wait for initial save to complete before updating
    await initialSavePromise;
    
    // Update to sent with Meta response — single update operation
    outboundMsg.status = 'sent';
    outboundMsg.sentAt = new Date();
    outboundMsg.metaMessageId = response?.messages?.[0]?.id || response?.id;
    outboundMsg.metaResponse = {
      code: 'success',
      timestamp: new Date()
    };
    await outboundMsg.save();
    
    logger.info('Outbound message sent', {
      phone: normalizedPhone,
      messageType,
      metaMessageId: outboundMsg.metaMessageId
    });
    
    return response;
    
  } catch (error) {
    // Classify failure
    const classification = OutboundMessage.classifyFailure(error);
    
    logger.error('Outbound message failed', {
      phone: normalizedPhone,
      messageType,
      error: error.message,
      classification
    });
    
    outboundMsg.status = classification.isRetryable ? 'failed' : 'policy_violation';
    outboundMsg.failedAt = new Date();
    outboundMsg.failureReason = classification.reason;
    outboundMsg.isRetryable = classification.isRetryable;
    outboundMsg.error = {
      message: error.message,
      code: error.code || error.error?.code,
      httpStatus: error.response?.status
    };
    
    // Calculate next retry time if retryable
    if (classification.isRetryable && outboundMsg.retryCount < outboundMsg.maxRetries) {
      outboundMsg.nextRetryAt = outboundMsg.calculateNextRetry();
    }
    
    await outboundMsg.save();
    
    // Re-throw error for caller to handle
    throw error;
  }
}

const whatsapp = {
  async sendMessage(phone, message) {
    return trackOutbound(phone, 'text', { text: message.substring(0, 100) }, 
      () => metaCloud.sendMessage(phone, message)
    );
  },

  async sendButtons(phone, message, buttons, footer = '') {
    return trackOutbound(phone, 'buttons', { 
      text: message.substring(0, 100),
      buttons: buttons.map(b => ({ id: b.id, text: b.text }))
    }, 
      () => metaCloud.sendButtons(phone, message, buttons, footer)
    );
  },

  async sendList(phone, title, description, buttonText, sections, footer = '') {
    return trackOutbound(phone, 'list', { 
      title: title.substring(0, 60),
      sections: sections.length
    }, 
      () => metaCloud.sendList(phone, title, description, buttonText, sections, footer)
    );
  },

  async sendTemplateButtons(phone, message, buttons, footer = '') {
    return trackOutbound(phone, 'buttons', { 
      text: message.substring(0, 100)
    }, 
      () => metaCloud.sendTemplateButtons(phone, message, buttons, footer)
    );
  },

  async sendOrder(phone, order, items, paymentUrl, imageUrl = null) {
    return trackOutbound(phone, 'text', { 
      orderId: order.orderId,
      itemCount: items.length
    }, 
      () => metaCloud.sendOrder(phone, order, items, paymentUrl, imageUrl)
    );
  },

  async sendImage(phone, imageUrl, caption = '') {
    return trackOutbound(phone, 'image', { 
      imageUrl: imageUrl.substring(0, 100),
      caption: caption.substring(0, 100)
    }, 
      () => metaCloud.sendImage(phone, imageUrl, caption)
    );
  },

  async sendImageWithButtons(phone, imageUrl, message, buttons, footer = '') {
    return trackOutbound(phone, 'image', { 
      imageUrl: imageUrl.substring(0, 100),
      text: message.substring(0, 100)
    }, 
      () => metaCloud.sendImageWithButtons(phone, imageUrl, message, buttons, footer)
    );
  },

  async sendLocationRequest(phone, message) {
    return trackOutbound(phone, 'location', { 
      text: message.substring(0, 100)
    }, 
      () => metaCloud.sendLocationRequest(phone, message)
    );
  },

  async sendCtaUrl(phone, message, buttonText, url, footer = '') {
    return trackOutbound(phone, 'cta_url', { 
      text: message.substring(0, 100),
      url: url.substring(0, 100)
    }, 
      () => metaCloud.sendCtaUrl(phone, message, buttonText, url, footer)
    );
  },

  async sendImageWithCtaUrl(phone, imageUrl, message, buttonText, url, footer = '') {
    return trackOutbound(phone, 'cta_url', { 
      imageUrl: imageUrl.substring(0, 100),
      text: message.substring(0, 100)
    }, 
      () => metaCloud.sendImageWithCtaUrl(phone, imageUrl, message, buttonText, url, footer)
    );
  },

  async sendImageWithCtaUrlOriginal(phone, imageUrl, message, buttonText, url, footer = '') {
    return trackOutbound(phone, 'cta_url', { 
      imageUrl: imageUrl.substring(0, 100)
    }, 
      () => metaCloud.sendImageWithCtaUrlOriginal(phone, imageUrl, message, buttonText, url, footer)
    );
  },

  async sendCtaPhone(phone, message, buttonText, phoneNumber, footer = '') {
    return trackOutbound(phone, 'cta_phone', { 
      text: message.substring(0, 100)
    }, 
      () => metaCloud.sendCtaPhone(phone, message, buttonText, phoneNumber, footer)
    );
  },

  async sendImageWithCtaPhone(phone, imageUrl, message, buttonText, phoneNumber, footer = '') {
    return metaCloud.sendImageWithCtaPhone(phone, imageUrl, message, buttonText, phoneNumber, footer);
  },

  // Template messages - work outside 24-hour window
  async sendMarketingTemplate(phone, templateName, imageUrl, bodyParams = [], buttonUrl = null) {
    return metaCloud.sendMarketingTemplate(phone, templateName, imageUrl, bodyParams, buttonUrl);
  },

  async sendSimpleTemplate(phone, templateName = 'hello_world', languageCode = 'en_US') {
    return metaCloud.sendSimpleTemplate(phone, templateName, languageCode);
  },

  // Template management - Meta Business API
  async createMessageTemplate(templateName, headerImageUrl, bodyText, footerText, ctaUrl, ctaLabel) {
    return metaCloud.createMessageTemplate(templateName, headerImageUrl, bodyText, footerText, ctaUrl, ctaLabel);
  },

  async getTemplateStatus(templateName) {
    return metaCloud.getTemplateStatus(templateName);
  },

  async deleteMessageTemplate(templateName) {
    return metaCloud.deleteMessageTemplate(templateName);
  }
};

module.exports = whatsapp;
