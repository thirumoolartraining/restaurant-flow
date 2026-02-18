/**
 * Webhook Signature Verification Middleware
 * 
 * Purpose: Verify Meta WhatsApp webhook signatures
 * Security: Prevents unauthorized webhook calls
 * 
 * Meta sends X-Hub-Signature-256 header with HMAC-SHA256 signature
 * We verify this against the raw request body
 * 
 * CRITICAL: Requires raw body buffer (not parsed JSON)
 */

const crypto = require('crypto');
const logger = require('../services/logger');

/**
 * Verify Meta webhook signature
 * 
 * @param {Request} req - Express request (must have rawBody)
 * @param {Response} res - Express response
 * @param {Function} next - Next middleware
 */
function verifyWebhookSignature(req, res, next) {
  // Skip verification in development if explicitly disabled
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_WEBHOOK_VERIFICATION === 'true') {
    logger.warn('⚠️ Webhook signature verification SKIPPED (development mode)');
    return next();
  }
  
  try {
    // Get signature from header
    const signature = req.headers['x-hub-signature-256'];
    
    if (!signature) {
      logger.error('❌ Webhook signature missing');
      return res.status(401).json({ 
        error: 'Webhook signature required',
        code: 'NO_SIGNATURE'
      });
    }
    
    // Get app secret
    const appSecret = process.env.META_APP_SECRET;
    
    if (!appSecret) {
      logger.error('❌ META_APP_SECRET not configured');
      return res.status(500).json({ 
        error: 'Server configuration error',
        code: 'NO_APP_SECRET'
      });
    }
    
    // Get raw body
    const rawBody = req.rawBody;
    
    if (!rawBody) {
      logger.error('❌ Raw body not available for signature verification');
      return res.status(500).json({ 
        error: 'Cannot verify signature - raw body missing',
        code: 'NO_RAW_BODY'
      });
    }
    
    // Calculate expected signature
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');
    
    // Compare signatures (timing-safe comparison)
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      logger.error('❌ Webhook signature length mismatch');
      return res.status(401).json({ 
        error: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE'
      });
    }
    
    // Timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    
    if (!isValid) {
      logger.error('❌ Webhook signature verification failed');
      return res.status(401).json({ 
        error: 'Invalid webhook signature',
        code: 'SIGNATURE_MISMATCH'
      });
    }
    
    // Signature valid
    logger.info('✅ Webhook signature verified');
    next();
    
  } catch (error) {
    logger.error('❌ Webhook verification error:', error);
    return res.status(500).json({ 
      error: 'Signature verification failed',
      code: 'VERIFICATION_ERROR'
    });
  }
}

/**
 * Middleware to capture raw body for signature verification
 * Must be applied BEFORE express.json() middleware
 * 
 * Usage in server.js:
 * app.use('/api/webhook/meta', captureRawBody);
 * app.use(express.json());
 */
function captureRawBody(req, res, next) {
  req.rawBody = '';
  
  req.on('data', (chunk) => {
    req.rawBody += chunk.toString();
  });
  
  req.on('end', () => {
    next();
  });
}

module.exports = {
  verifyWebhookSignature,
  captureRawBody
};
