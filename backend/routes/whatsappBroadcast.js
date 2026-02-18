const express = require('express');
const logger = require('../services/logger');
const router = express.Router();
const whatsappBroadcast = require('../services/whatsappBroadcast');
const authMiddleware = require('../middleware/auth');
const { adminRateLimiter } = require('../middleware/rateLimiter');

// Apply admin rate limiting
router.use(adminRateLimiter);

// Get all WhatsApp contacts
router.get('/contacts', authMiddleware, async (req, res) => {
  try {
    const contacts = await whatsappBroadcast.getAllContacts();
    res.json({ success: true, contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get WhatsApp contacts statistics
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await whatsappBroadcast.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync existing customers to WhatsApp contacts
router.post('/sync', authMiddleware, async (req, res) => {
  try {
    const result = await whatsappBroadcast.syncExistingCustomers();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send offer to WhatsApp contacts (supports targeting)
router.post('/send-offer', authMiddleware, async (req, res) => {
  try {
    const { offerImageUrl, offerTitle, offerDescription, offerType, offerId } = req.body;
    
    if (!offerImageUrl && !offerTitle && !offerDescription) {
      return res.status(400).json({ 
        success: false, 
        error: 'At least one of offerImageUrl, offerTitle, or offerDescription is required' 
      });
    }

    logger.info(`[WhatsApp Broadcast] Starting offer broadcast...`);
    logger.info(`[WhatsApp Broadcast] Offer: ${offerTitle || 'No title'}`);
    logger.info(`[WhatsApp Broadcast] Type: ${offerType || 'No type'}`);
    logger.info(`[WhatsApp Broadcast] Offer ID: ${offerId || 'None (all customers)'}`);

    // Get targeting info if offerId is provided
    let targetedCustomers = null;
    let targetType = 'all';
    let offerData = null; // Full offer data for applying to customers
    
    if (offerId) {
      const Offer = require('../models/Offer');
      const offer = await Offer.findById(offerId);
      if (offer) {
        targetType = offer.targetType || 'all';
        // Check for any targeted offer type (not just top_percentage)
        const isTargeted = ['top_percentage', 'min_spent', 'min_orders'].includes(targetType);
        if (isTargeted && offer.targetedCustomers && offer.targetedCustomers.length > 0) {
          targetedCustomers = offer.targetedCustomers;
          logger.info(`[WhatsApp Broadcast] Targeting ${targetedCustomers.length} specific customers (${targetType})`);
          
          // Store full offer data for applying to customers
          offerData = {
            offerId: offer._id,
            offerType: offer.offerType,
            title: offer.title,
            discountType: offer.discountType,
            discountValue: offer.discountValue,
            percentage: offer.percentage,
            appliedItems: offer.appliedItems || [],
            appliedCategories: offer.appliedCategories || [],
            validUntil: offer.validUntil
          };
        } else if (isTargeted && (!offer.targetedCustomers || offer.targetedCustomers.length === 0)) {
          // Targeted offer but no eligible customers
          logger.info(`[WhatsApp Broadcast] No eligible customers for ${targetType} targeting`);
          return res.json({
            success: false,
            message: 'No eligible customers found for this targeting criteria. Please adjust your targeting settings.',
            total: 0,
            sent: 0,
            failed: 0
          });
        }
      }
    }

    // Send offers (with optional targeting)
    const result = await whatsappBroadcast.sendOfferToAll(
      offerImageUrl, 
      offerTitle, 
      offerDescription, 
      offerType,
      targetedCustomers,
      offerId, // Pass offerId for claim button
      offerData // Pass full offer data to apply to customers
    );
    
    logger.info('[WhatsApp Broadcast] Offer sending completed:', {
      total: result.total,
      sent: result.sent,
      sentViaInteractive: result.sentViaInteractive,
      sentViaTemplate: result.sentViaTemplate,
      failed: result.failed,
      targetType
    });
    
    // Build detailed message for admin
    let message = '';
    if (targetedCustomers && targetedCustomers.length > 0) {
      message = `🎯 Targeted offer sent!\n`;
    }
    if (result.sent > 0) {
      message += `Successfully sent to ${result.sent} customers!\n`;
      if (result.sentViaInteractive > 0) {
        message += `• ${result.sentViaInteractive} via interactive message\n`;
      }
      if (result.sentViaTemplate > 0) {
        message += `• ${result.sentViaTemplate} via template (24h window expired)\n`;
      }
    }
    
    if (result.failed > 0) {
      message += `\nFailed: ${result.failed} customers\n`;
      
      // Group failures by reason
      const failureReasons = {};
      (result.failedContacts || []).forEach(fc => {
        const reason = fc.reason || 'unknown';
        failureReasons[reason] = (failureReasons[reason] || 0) + 1;
      });
      
      Object.entries(failureReasons).forEach(([reason, count]) => {
        if (reason === '24h_no_template') {
          message += `• ${count} outside 24h window (no template configured)\n`;
        } else if (reason === 'test_recipient_restriction') {
          message += `• ${count} test number restrictions\n`;
        } else if (reason === 'template_failed') {
          message += `• ${count} template send failed\n`;
        } else {
          message += `• ${count} other errors\n`;
        }
      });
    }
    
    if (!result.templateConfigured && result.failed > 0) {
      message += `\n⚠️ Tip: Configure WHATSAPP_OFFER_TEMPLATE in .env to reach customers outside 24h window`;
    }
    
    res.json({
      success: result.success && result.sent > 0,
      message: message.trim(),
      total: result.total,
      sent: result.sent,
      sentViaInteractive: result.sentViaInteractive || 0,
      sentViaTemplate: result.sentViaTemplate || 0,
      failed: result.failed,
      failedContacts: result.failedContacts || [],
      successContacts: result.successContacts || [],
      templateConfigured: result.templateConfigured,
      targetType
    });

  } catch (error) {
    logger.error('[WhatsApp Broadcast] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test send offer to a single phone number
router.post('/test-send', authMiddleware, async (req, res) => {
  try {
    const { phone, offerImageUrl, offerTitle, offerDescription, offerType } = req.body;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number is required for test' 
      });
    }

    logger.info(`[WhatsApp Broadcast] Testing offer send to ${phone}...`);

    const result = await whatsappBroadcast.sendOfferToSingle(phone, offerImageUrl, offerTitle, offerDescription, offerType);
    
    res.json(result);

  } catch (error) {
    logger.error('[WhatsApp Broadcast] Test send error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
