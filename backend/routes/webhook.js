const express = require('express');
const logger = require('../services/logger');
const chatbot = require('../services/chatbot');
const whatsapp = require('../services/whatsapp');
const googleSheets = require('../services/googleSheets');
const metaCloud = require('../services/metaCloud');
const groqAi = require('../services/groqAi');
const pushNotification = require('../services/pushNotification');
const authMiddleware = require('../middleware/auth');
const { webhookRateLimiter } = require('../middleware/rateLimiter');
const router = express.Router();

// ============================================================
// TEST/DEBUG ROUTES - Protected with auth, disabled in production
// ============================================================

// Test Google Sheets connection (admin only)
router.get('/test-sheets', authMiddleware, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoints disabled in production' });
  }
  try {
    const testOrder = {
      orderId: 'TEST' + Date.now(),
      customer: { phone: '1234567890', name: 'Test Customer' },
      items: [{ name: 'Test Item', quantity: 1, price: 100 }],
      totalAmount: 100,
      serviceType: 'delivery',
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      status: 'pending',
      deliveryAddress: { address: 'Test Address', latitude: 0, longitude: 0 }
    };

    const result = await googleSheets.addOrder(testOrder);
    res.json({ success: result, message: result ? 'Test order added to Google Sheet!' : 'Failed to add order' });
  } catch (error) {
    logger.error('Google Sheets test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint - send a test message (admin only)
router.get('/test/:phone', authMiddleware, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoints disabled in production' });
  }
  try {
    const { phone } = req.params;
    await whatsapp.sendMessage(phone, '✅ Test message from your Restaurant Bot!');
    res.json({ success: true, message: 'Test message sent to ' + phone });
  } catch (error) {
    logger.error('Test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint - send welcome menu with buttons (admin only)
router.get('/test-menu/:phone', authMiddleware, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoints disabled in production' });
  }
  try {
    const { phone } = req.params;
    await chatbot.handleMessage(phone, 'hi', 'text', null);
    res.json({ success: true, message: 'Welcome menu sent to ' + phone });
  } catch (error) {
    logger.error('Test menu error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Simulate incoming message (admin only, dev only)
router.post('/simulate', authMiddleware, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoints disabled in production' });
  }
  try {
    const { phone, message, selectedId } = req.body;
    const messageType = selectedId ? 'list' : 'text';
    await chatbot.handleMessage(phone, message || '', messageType, selectedId || null);
    res.json({ success: true, message: 'Simulated message processed' });
  } catch (error) {
    logger.error('Simulate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint to check customer state (admin only, dev only)
router.get('/debug/:phone', authMiddleware, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Debug endpoints disabled in production' });
  }
  try {
    const Customer = require('../models/Customer');
    const customer = await Customer.findOne({ phone: req.params.phone }).populate('cart.menuItem');
    if (!customer) {
      return res.json({ error: 'Customer not found' });
    }
    res.json({
      phone: customer.phone,
      cart: customer.cart,
      conversationState: customer.conversationState
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check for webhook
router.get('/whatsapp', (req, res) => {
  res.json({ status: 'Webhook is active', timestamp: new Date().toISOString() });
});

// Meta WhatsApp Cloud API webhook verification
router.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Verify token MUST come from env - no insecure fallback
  const verifyToken = process.env.META_VERIFY_TOKEN;
  if (!verifyToken) {
    logger.error('❌ META_VERIFY_TOKEN not configured');
    return res.sendStatus(500);
  }

  logger.info('🔐 Webhook verification attempt:', { mode, token, expectedToken: verifyToken, challenge: challenge ? 'present' : 'missing' });

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('✅ Meta webhook verified');
    res.status(200).send(challenge);
  } else if (!mode && !token) {
    // Simple health check (no verification params)
    res.json({ status: 'Webhook endpoint active', timestamp: new Date().toISOString() });
  } else {
    logger.info('❌ Meta webhook verification failed - token mismatch');
    res.sendStatus(403);
  }
});

// Meta WhatsApp Cloud API webhook endpoint (rate limited)
router.post('/meta', webhookRateLimiter, async (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    logger.info('📥 Webhook POST received');
  }
  
  // 1. Respond to Meta IMMEDIATELY to avoid timeouts (prevents 'single tick' issue)
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          // ========== TEMPLATE STATUS UPDATES ==========
          if (change.field === 'message_template_status_update') {
            const value = change.value || {};
            const event = (value.event || '').toUpperCase(); // APPROVED, REJECTED, PENDING, etc.
            const tplName = value.message_template_name;
            const tplId = value.message_template_id;
            const reason = value.reason || value.rejected_reason || null;

            logger.info('Template status webhook received', { event, tplName, tplId, reason });

            if (tplName) {
              try {
                const Offer = require('../models/Offer');
                const statusMap = { 'APPROVED': 'approved', 'REJECTED': 'rejected', 'PENDING': 'pending' };
                const mappedStatus = statusMap[event] || 'pending';

                const updateFields = { templateStatus: mappedStatus };
                if (mappedStatus === 'approved') updateFields.templateApprovedAt = new Date();
                if (mappedStatus === 'rejected') updateFields.templateRejectionReason = reason || 'Rejected by Meta';

                const updated = await Offer.findOneAndUpdate(
                  { templateName: tplName },
                  updateFields,
                  { new: true }
                );

                if (updated) {
                  logger.info('Offer template status updated via webhook', { offerId: updated._id, tplName, status: mappedStatus });
                  // Emit SSE event so frontend can refresh
                  const eventEmitter = require('../services/eventEmitter');
                  eventEmitter.emit('dataUpdate', { type: 'offers', templateUpdate: { offerId: updated._id, status: mappedStatus } });

                  // Send push notification to all admin users
                  try {
                    const User = require('../models/User');
                    const admins = await User.find({ role: 'admin', pushToken: { $ne: null } }).select('pushToken');
                    for (const admin of admins) {
                      await pushNotification.sendOfferTemplateNotification(admin.pushToken, {
                        offerId: updated._id.toString(),
                        offerTitle: updated.title,
                        status: mappedStatus,
                        reason: reason || updated.templateRejectionReason
                      });
                    }
                    logger.info('Push notifications sent to admins for template status', { adminCount: admins.length, status: mappedStatus });
                  } catch (pushErr) {
                    logger.error('Failed to send push notification for template status', { error: pushErr.message });
                  }
                } else {
                  logger.warn('No offer found for template name', { tplName });
                }
              } catch (tplErr) {
                logger.error('Error handling template status webhook', { error: tplErr.message });
              }
            }
            continue;
          }

          if (change.field === 'messages') {
            const value = change.value;

            // Process status updates (delivery receipts, read receipts)
            // Updates OutboundMessage records with deliveredAt/readAt/failedAt timestamps
            if (value.statuses) {
              for (const status of value.statuses) {
                try {
                  const OutboundMessage = require('../models/OutboundMessage');
                  const metaMessageId = status.id;
                  const statusValue = status.status; // sent, delivered, read, failed
                  const statusTimestamp = status.timestamp 
                    ? new Date(parseInt(status.timestamp) * 1000)
                    : new Date();

                  const updateFields = {};
                  
                  if (statusValue === 'delivered') {
                    updateFields.status = 'delivered';
                    updateFields.deliveredAt = statusTimestamp;
                  } else if (statusValue === 'read') {
                    updateFields.status = 'read';
                    updateFields.readAt = statusTimestamp;
                  } else if (statusValue === 'failed') {
                    const errorInfo = status.errors?.[0];
                    updateFields.status = 'failed';
                    updateFields.failedAt = statusTimestamp;
                    if (errorInfo) {
                      updateFields['error.message'] = errorInfo.message || errorInfo.title;
                      updateFields['error.code'] = String(errorInfo.code || '');
                    }
                  }
                  // 'sent' status = Meta accepted, we already track that

                  if (Object.keys(updateFields).length > 0) {
                    // Fire-and-forget — don't block webhook response processing
                    OutboundMessage.findOneAndUpdate(
                      { metaMessageId },
                      { $set: updateFields },
                      { new: true }
                    ).catch(err => {
                      logger.error('Failed to update outbound status', {
                        metaMessageId,
                        status: statusValue,
                        error: err.message
                      });
                    });
                  }
                } catch (statusErr) {
                  logger.error('Error processing status update', { error: statusErr.message });
                }
              }
              // Also check if this payload has messages — some webhooks contain both
              if (!value.messages || value.messages.length === 0) {
                continue;
              }
            }

            // Extract contact name from Meta API contacts array
            const contacts = value.contacts || [];
            const contactsMap = {};
            for (const contact of contacts) {
              if (contact.wa_id && contact.profile?.name) {
                contactsMap[contact.wa_id] = contact.profile.name;
              }
            }

            for (const message of value.messages || []) {
              const phone = message.from;
              const senderName = contactsMap[phone] || null;
              let text = '';
              let messageType = 'text';
              let selectedId = null;

              if (message.type === 'text') {
                text = message.text?.body || '';
              } else if (message.type === 'interactive') {
                if (message.interactive?.type === 'button_reply') {
                  selectedId = message.interactive.button_reply?.id || '';
                  text = message.interactive.button_reply?.title || '';
                  messageType = 'button';
                } else if (message.interactive?.type === 'list_reply') {
                  selectedId = message.interactive.list_reply?.id || '';
                  text = message.interactive.list_reply?.title || '';
                  messageType = 'list';
                }
              } else if (message.type === 'location') {
                messageType = 'location';
                text = {
                  latitude: message.location?.latitude,
                  longitude: message.location?.longitude,
                  name: message.location?.name || '',
                  address: message.location?.address || ''
                };
              } else if (message.type === 'audio') {
                // Handle voice message
                messageType = 'voice';
                const audioId = message.audio?.id;
                logger.info('🎤 Voice message received, audio ID:', audioId);
                
                if (audioId) {
                  try {
                    // Download and transcribe the audio
                    const audioBuffer = await metaCloud.downloadMedia(audioId);
                    let transcription = await groqAi.transcribeAudio(audioBuffer, message.audio?.mime_type || 'audio/ogg');
                    
                    if (transcription && transcription.trim()) {
                      // Normalize transcription to fix common voice recognition mistakes
                      const rawTranscription = transcription.trim();
                      transcription = groqAi.normalizeTranscription(rawTranscription);
                      
                      text = transcription;
                      messageType = 'text'; // Treat as text after transcription
                      logger.info('🎤 Voice transcribed:', rawTranscription);
                      logger.info('🎤 Normalized to:', text);
                    } else {
                      // Transcription failed, send error message
                      await whatsapp.sendButtons(phone, 
                        "🎤 Sorry, I couldn't understand your voice message. Please try again or type your message.",
                        [
                          { id: 'home', text: 'Main Menu' },
                          { id: 'help', text: 'Help' }
                        ]
                      );
                      continue;
                    }
                  } catch (err) {
                    logger.error('❌ Voice processing error:', err.message);
                    await whatsapp.sendButtons(phone,
                      "🎤 Sorry, I couldn't process your voice message. Please type your message instead.",
                      [
                        { id: 'home', text: 'Main Menu' },
                        { id: 'help', text: 'Help' }
                      ]
                    );
                    continue;
                  }
                }
              }

              const hasContent = text || selectedId || messageType === 'location';
              if (phone && hasContent) {
                // Process message in the background
                chatbot.handleMessage(phone, text, messageType, selectedId, senderName)
                  .catch(err => logger.error('❌ Async Chatbot Error:', err));
              }
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error('❌ Meta webhook async processing error:', error);
  }
});

module.exports = router;
