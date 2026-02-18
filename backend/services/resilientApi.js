/**
 * Resilient API Wrapper
 * Phase 5.2: Circuit Breaker Integration
 * 
 * Purpose: Wrap external API calls with circuit breaker protection
 * Provides resilient wrappers for WhatsApp, Razorpay, Sheets, etc.
 */

const { registerCircuitBreaker, executeWithCircuitBreaker } = require('./circuitBreaker');
const { warn } = require('./logger');

/**
 * Create a resilient wrapper for WhatsApp API
 * @param {Object} metaCloud - Original metaCloud service
 * @returns {Object} Wrapped service with circuit breaker
 */
function createResilientWhatsApp(metaCloud) {
  // Fallback for WhatsApp - log and return graceful error
  const whatsappFallback = {
    handler: () => {
      warn('WhatsApp circuit breaker fallback triggered', {
        service: 'whatsapp',
        action: 'fallback'
      });
      return {
        success: false,
        error: 'WhatsApp service temporarily unavailable',
        fallback: true
      };
    },
    message: 'WhatsApp service unavailable, using fallback'
  };
  
  return {
    async sendText(phone, message) {
      return executeWithCircuitBreaker(
        'whatsapp',
        () => metaCloud.sendText(phone, message),
        [],
        whatsappFallback
      );
    },
    
    async sendImage(phone, imageUrl, caption) {
      return executeWithCircuitBreaker(
        'whatsapp',
        () => metaCloud.sendImage(phone, imageUrl, caption),
        [],
        whatsappFallback
      );
    },
    
    async sendButtons(phone, message, buttons, footer) {
      return executeWithCircuitBreaker(
        'whatsapp',
        () => metaCloud.sendButtons(phone, message, buttons, footer),
        [],
        whatsappFallback
      );
    },
    
    async sendList(phone, message, buttonText, sections, footer) {
      return executeWithCircuitBreaker(
        'whatsapp',
        () => metaCloud.sendList(phone, message, buttonText, sections, footer),
        [],
        whatsappFallback
      );
    },
    
    async sendLocation(phone, latitude, longitude, name, address) {
      return executeWithCircuitBreaker(
        'whatsapp',
        () => metaCloud.sendLocation(phone, latitude, longitude, name, address),
        [],
        whatsappFallback
      );
    },
    
    async sendCtaUrl(phone, message, buttonText, url, footer) {
      return executeWithCircuitBreaker(
        'whatsapp',
        () => metaCloud.sendCtaUrl(phone, message, buttonText, url, footer),
        [],
        whatsappFallback
      );
    },
    
    async sendCtaPhone(phone, message, buttonText, phoneNumber, footer) {
      return executeWithCircuitBreaker(
        'whatsapp',
        () => metaCloud.sendCtaPhone(phone, message, buttonText, phoneNumber, footer),
        [],
        whatsappFallback
      );
    },
    
    async sendImageWithCtaPhone(phone, imageUrl, message, buttonText, phoneNumber, footer) {
      return executeWithCircuitBreaker(
        'whatsapp',
        () => metaCloud.sendImageWithCtaPhone(phone, imageUrl, message, buttonText, phoneNumber, footer),
        [],
        whatsappFallback
      );
    },
    
    async sendMarketingTemplate(phone, templateName, imageUrl, bodyParams, buttonUrl) {
      return executeWithCircuitBreaker(
        'whatsapp',
        () => metaCloud.sendMarketingTemplate(phone, templateName, imageUrl, bodyParams, buttonUrl),
        [],
        whatsappFallback
      );
    },
    
    async sendSimpleTemplate(phone, templateName, languageCode) {
      return executeWithCircuitBreaker(
        'whatsapp',
        () => metaCloud.sendSimpleTemplate(phone, templateName, languageCode),
        [],
        whatsappFallback
      );
    }
  };
}

/**
 * Create a resilient wrapper for Razorpay API
 * @param {Object} razorpay - Original razorpay service
 * @returns {Object} Wrapped service with circuit breaker
 */
function createResilientRazorpay(razorpay) {
  // No fallback for payments - must fail explicitly
  return {
    async createOrder(amount, currency, receipt, notes) {
      return executeWithCircuitBreaker(
        'razorpay',
        () => razorpay.createOrder(amount, currency, receipt, notes),
        []
      );
    },
    
    async verifyPaymentSignature(orderId, paymentId, signature) {
      return executeWithCircuitBreaker(
        'razorpay',
        () => razorpay.verifyPaymentSignature(orderId, paymentId, signature),
        []
      );
    },
    
    async fetchPayment(paymentId) {
      return executeWithCircuitBreaker(
        'razorpay',
        () => razorpay.fetchPayment(paymentId),
        []
      );
    },
    
    async createRefund(paymentId, amount, notes) {
      return executeWithCircuitBreaker(
        'razorpay',
        () => razorpay.createRefund(paymentId, amount, notes),
        []
      );
    }
  };
}

/**
 * Create a resilient wrapper for Google Sheets API
 * @param {Object} sheets - Original sheets service
 * @returns {Object} Wrapped service with circuit breaker
 */
function createResilientSheets(sheets) {
  // Fallback for sheets - log and continue without sheets
  const sheetsFallback = {
    handler: () => {
      warn('Google Sheets circuit breaker fallback triggered', {
        service: 'sheets',
        action: 'fallback'
      });
      return {
        success: false,
        error: 'Google Sheets temporarily unavailable',
        fallback: true
      };
    },
    message: 'Google Sheets unavailable, continuing without sync'
  };
  
  return {
    async appendRow(sheetName, values) {
      return executeWithCircuitBreaker(
        'sheets',
        () => sheets.appendRow(sheetName, values),
        [],
        sheetsFallback
      );
    },
    
    async getRows(sheetName, range) {
      return executeWithCircuitBreaker(
        'sheets',
        () => sheets.getRows(sheetName, range),
        [],
        sheetsFallback
      );
    },
    
    async updateRow(sheetName, rowIndex, values) {
      return executeWithCircuitBreaker(
        'sheets',
        () => sheets.updateRow(sheetName, rowIndex, values),
        [],
        sheetsFallback
      );
    }
  };
}

/**
 * Create a resilient wrapper for Cloudinary API
 * @param {Object} cloudinary - Original cloudinary service
 * @returns {Object} Wrapped service with circuit breaker
 */
function createResilientCloudinary(cloudinary) {
  // Fallback for cloudinary - return placeholder or error
  const cloudinaryFallback = {
    handler: () => {
      warn('Cloudinary circuit breaker fallback triggered', {
        service: 'cloudinary',
        action: 'fallback'
      });
      return {
        success: false,
        error: 'Image service temporarily unavailable',
        fallback: true
      };
    },
    message: 'Cloudinary unavailable, using fallback'
  };
  
  return {
    async uploadImage(buffer, folder) {
      return executeWithCircuitBreaker(
        'cloudinary',
        () => cloudinary.uploadImage(buffer, folder),
        [],
        cloudinaryFallback
      );
    },
    
    async deleteImage(publicId) {
      return executeWithCircuitBreaker(
        'cloudinary',
        () => cloudinary.deleteImage(publicId),
        [],
        cloudinaryFallback
      );
    }
  };
}

/**
 * Create a resilient wrapper for Groq AI API
 * @param {Object} groq - Original groq service
 * @returns {Object} Wrapped service with circuit breaker
 */
function createResilientGroq(groq) {
  // Fallback for groq - return error message
  const groqFallback = {
    handler: () => {
      warn('Groq AI circuit breaker fallback triggered', {
        service: 'groq',
        action: 'fallback'
      });
      return {
        success: false,
        error: 'AI service temporarily unavailable',
        fallback: true,
        text: 'Voice transcription unavailable'
      };
    },
    message: 'Groq AI unavailable, using fallback'
  };
  
  return {
    async transcribeAudio(audioUrl) {
      return executeWithCircuitBreaker(
        'groq',
        () => groq.transcribeAudio(audioUrl),
        [],
        groqFallback
      );
    }
  };
}

module.exports = {
  createResilientWhatsApp,
  createResilientRazorpay,
  createResilientSheets,
  createResilientCloudinary,
  createResilientGroq
};
