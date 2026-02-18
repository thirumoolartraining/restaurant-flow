const WhatsAppContact = require('../models/WhatsAppContact');
const Customer = require('../models/Customer');
const whatsapp = require('./whatsapp');
const googleSheets = require('./googleSheets');
const logger = require('./logger');

// Template name for broadcast offers - must be created in WhatsApp Business Manager
// If you don't have a custom template, we'll use 'hello_world' which is pre-approved for all accounts
const OFFER_TEMPLATE_NAME = process.env.WHATSAPP_OFFER_TEMPLATE || 'hello_world';

// Check if using a test WhatsApp number
// Test numbers (like 15550001234, or numbers starting with 1555) have restrictions
const isTestNumber = () => {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  // Meta test phone number IDs are typically different from production
  // You can set this env var to 'true' if using a test number
  return process.env.WHATSAPP_TEST_MODE === 'true';
};

const whatsappBroadcast = {
  // Apply an offer to a customer's activeOffers list
  // This is called when a targeted offer is broadcast to the customer
  async applyOfferToCustomer(phone, offerData) {
    try {
      // Find customer by phone
      const customer = await Customer.findOne({ phone });
      if (!customer) {
        logger.info('[WhatsApp Broadcast] Customer not found for phone, skipping offer apply', { phone });
        return false;
      }
      
      // Initialize activeOffers if not exists
      if (!customer.activeOffers) {
        customer.activeOffers = [];
      }
      
      // Check if offer already exists
      const existingOfferIndex = customer.activeOffers.findIndex(
        o => o.offerId?.toString() === offerData.offerId?.toString()
      );
      
      if (existingOfferIndex >= 0) {
        // Update existing offer
        customer.activeOffers[existingOfferIndex] = {
          ...offerData,
          appliedAt: new Date()
        };
        logger.info('[WhatsApp Broadcast] Updated existing offer', { phone });
      } else {
        // Add new offer
        customer.activeOffers.push({
          ...offerData,
          appliedAt: new Date()
        });
        logger.info('[WhatsApp Broadcast] Applied new offer', { phone });
      }
      
      await customer.save();
      return true;
    } catch (error) {
      logger.error(`[WhatsApp Broadcast] Error applying offer to ${phone}`, { error: error.message, stack: error.stack });
      return false;
    }
  },

  // Add or update a WhatsApp contact - Now saves to Google Sheets (cost-saving)
  async addContact(phone, name = null, orderDate = new Date()) {
    try {
      // Save to Google Sheets (primary storage)
      await googleSheets.addOrUpdateWhatsAppContact({
        phone,
        name,
        firstOrderDate: orderDate,
        lastOrderDate: orderDate,
        totalOrders: 1,
        isActive: true
      });
      
      // Also save to MongoDB for backward compatibility (can be removed later)
      const contact = await WhatsAppContact.findOne({ phone });
      
      if (contact) {
        contact.name = name || contact.name;
        contact.lastOrderDate = orderDate;
        contact.totalOrders += 1;
        await contact.save();
        return contact;
      } else {
        const newContact = new WhatsAppContact({
          phone,
          name,
          firstOrderDate: orderDate,
          lastOrderDate: orderDate,
          totalOrders: 1
        });
        await newContact.save();
        return newContact;
      }
    } catch (error) {
      logger.error('[WhatsApp Broadcast] Error adding contact', { error: error.message, stack: error.stack });
      return null;
    }
  },

  // Sync all existing customers to WhatsApp contacts (both MongoDB and Sheets)
  async syncExistingCustomers() {
    try {
      logger.info('[WhatsApp Broadcast] Syncing existing customers to Google Sheets...');
      
      // Get all customers with phone numbers from MongoDB
      const customers = await Customer.find({ 
        phone: { $exists: true, $ne: null, $ne: '' } 
      });
      
      logger.info('[WhatsApp Broadcast] Found customers with phone numbers', { count: customers.length });
      
      let synced = 0;
      
      // Sync each customer to Google Sheets
      for (const customer of customers) {
        if (customer.phone && customer.phone.trim() !== '') {
          await googleSheets.addOrUpdateWhatsAppContact({
            phone: customer.phone,
            name: customer.name || '',
            firstOrderDate: customer.createdAt,
            lastOrderDate: customer.updatedAt || customer.createdAt,
            totalOrders: customer.totalOrders || 1,
            isActive: true
          });
          synced++;
        }
      }
      
      logger.info('[WhatsApp Broadcast] Synced customers to Google Sheets', { synced, total: customers.length });
      return { success: true, synced, total: customers.length };
    } catch (error) {
      logger.error('[WhatsApp Broadcast] Error syncing customers', { error: error.message, stack: error.stack });
      return { success: false, error: error.message };
    }
  },

  // Get all active WhatsApp contacts from Google Sheets customers sheet
  async getAllContacts(includeOldCustomers = true) {
    try {
      if (includeOldCustomers) {
        // Sync any new customers first
        await this.syncExistingCustomers();
      }
      
      // Fetch from Google Sheets customers sheet (primary source)
      const { customers, error } = await googleSheets.getAllCustomers();
      
      if (!error && customers.length > 0) {
        logger.info('[WhatsApp Broadcast] Found customers from Google Sheets', { count: customers.length });
        // Map to expected format — include lastOrderDate for 24h window check
        return customers.map(c => ({
          phone: c.phone,
          name: c.name,
          totalOrders: c.ordersCount,
          lastOrderDate: c.lastOrderDate || null,
          isActive: true
        }));
      }
      
      // Fallback to MongoDB if sheets fail
      logger.info('[WhatsApp Broadcast] Falling back to MongoDB for contacts...');
      const contacts = await WhatsAppContact.find({ isActive: true }).sort({ lastOrderDate: -1 });
      logger.info('[WhatsApp Broadcast] Found active contacts from MongoDB', { count: contacts.length });
      return contacts;
    } catch (error) {
      logger.error('[WhatsApp Broadcast] Error getting contacts', { error: error.message, stack: error.stack });
      return [];
    }
  },

  // Send offer image to WhatsApp contacts (supports targeting)
  // Uses interactive messages for users within 24-hour window
  // Falls back to template messages for users outside 24-hour window (even if they sent "hi" months ago)
  // targetedCustomers: array of phone numbers to send to (null = send to all)
  // offerId: optional offer ID to include claim button for eligibility check
  // offerData: full offer data to apply to targeted customers' activeOffers
  async sendOfferToAll(offerImageUrl, offerTitle, offerDescription, offerType, targetedCustomers = null, offerId = null, offerData = null) {
    try {
      // Look up the offer to get its approved template name (if any)
      let approvedTemplateName = null;
      if (offerId) {
        try {
          const Offer = require('../models/Offer');
          const offer = await Offer.findById(offerId);
          if (offer && offer.templateStatus === 'approved' && offer.templateName) {
            approvedTemplateName = offer.templateName;
            logger.info('[WhatsApp Broadcast] Using approved template for old customers', { template: approvedTemplateName });
          }
        } catch (e) {
          logger.warn('[WhatsApp Broadcast] Could not fetch offer template info', { error: e.message });
        }
      }

      // Ensure all customers are synced before sending (includes old customers who sent "hi" or any message)
      logger.info('[WhatsApp Broadcast] Syncing ALL customers (including old customers) before sending...');
      await this.syncExistingCustomers();
      
      let contacts = await this.getAllContacts(true); // Include old customers
      
      // Filter contacts if targeting specific customers
      const isTargetedOffer = targetedCustomers && Array.isArray(targetedCustomers) && targetedCustomers.length > 0;
      if (isTargetedOffer) {
        logger.info('[WhatsApp Broadcast] Filtering to targeted customers', { count: targetedCustomers.length });
        const targetSet = new Set(targetedCustomers.map(p => p.replace(/\D/g, ''))); // Normalize phone numbers
        const contactPhoneSet = new Set(contacts.map(c => c.phone.replace(/\D/g, '')));
        
        // Filter existing contacts to only targeted ones
        contacts = contacts.filter(contact => {
          const normalizedPhone = contact.phone.replace(/\D/g, '');
          return targetSet.has(normalizedPhone);
        });
        
        // Add any targeted customers who are missing from the contacts list
        // These are customers in the DB but not in Google Sheets — still need to receive the offer
        for (const targetPhone of targetedCustomers) {
          const normalized = targetPhone.replace(/\D/g, '');
          if (!contactPhoneSet.has(normalized)) {
            contacts.push({ phone: normalized, name: '', totalOrders: 0, lastOrderDate: null, isActive: true });
            logger.info('[WhatsApp Broadcast] Added missing targeted customer', { phone: normalized });
          }
        }
        
        logger.info('[WhatsApp Broadcast] Final targeted contacts', { count: contacts.length, fromSheets: contacts.length - (targetedCustomers.length - contactPhoneSet.size) });
      }
      
      if (contacts.length === 0) {
        return { success: false, message: 'No contacts found', sent: 0, failed: 0, total: 0 };
      }

      let sent = 0;
      let failed = 0;
      let sentViaTemplate = 0;
      let sentViaInteractive = 0;
      const failedContacts = [];
      const successContacts = [];

      // Build message for interactive messages
      let message = `🎉 *New Offer!*\n\n`;
      if (offerType) {
        message += `🏷️ *${offerType}*\n\n`;
      }
      if (offerTitle) {
        message += `*${offerTitle}*\n\n`;
      }
      if (offerDescription) {
        message += `${offerDescription}\n\n`;
      }
      
      // Add exclusive tag for targeted offers
      if (isTargetedOffer) {
        message += `✨ *Exclusive offer for you!* ✨\n\n`;
      }
      message += `Order now and enjoy this amazing deal! 🍽️`;

      // Website URL - for targeted offers, use special claim page with offerId and phone for discount
      const baseWebsiteUrl = 'https://restarunt-bot.vercel.app';
      // We'll add phone to URL in the loop per-customer for targeted offers
      const defaultWebsiteUrl = (isTargetedOffer && offerId) 
        ? `${baseWebsiteUrl}/offer/${offerId}` 
        : `${baseWebsiteUrl}/offers`;

      logger.info('[WhatsApp Broadcast] Sending offer to contacts', { count: contacts.length });
      logger.info('[WhatsApp Broadcast] Offer URL', { url: defaultWebsiteUrl });
      logger.info('[WhatsApp Broadcast] Note: Customers outside 24h window will receive via approved template');
      logger.info('[WhatsApp Broadcast] Approved template', { template: approvedTemplateName || 'None' });
      logger.info('[WhatsApp Broadcast] Fallback template', { template: OFFER_TEMPLATE_NAME || 'None' });

      // Send to each contact with delay to avoid rate limiting
      // For customers within 24h window: sends interactive message directly
      // For customers outside 24h window: uses approved marketing template directly (no hello_world needed)
      
      // Pre-fetch last inbound message times for accurate 24h window detection
      // The 24h window is based on when the customer last SENT a message, not last order
      const InboundMessage = require('../models/InboundMessage');
      const normalizedPhones = contacts.map(c => c.phone.replace(/\D/g, ''));
      const lastMessages = await InboundMessage.aggregate([
        { $match: { phone: { $in: normalizedPhones } } },
        { $group: { _id: '$phone', lastMessageAt: { $max: '$receivedAt' } } }
      ]).catch((err) => {
        logger.warn('[WhatsApp Broadcast] Could not fetch inbound messages', { error: err.message });
        return [];
      });
      const lastMessageMap = {};
      for (const lm of lastMessages) {
        if (lm._id) {
          lastMessageMap[lm._id.replace(/\D/g, '')] = lm.lastMessageAt;
        }
      }
      logger.info('[WhatsApp Broadcast] Pre-fetched last message times', { count: Object.keys(lastMessageMap).length });

      for (const contact of contacts) {
        // Generate per-customer URL with phone for targeted offers
        let websiteUrl = defaultWebsiteUrl;
        if (isTargetedOffer && offerId && contact.phone) {
          // Encode phone number for URL (remove + and spaces)
          const encodedPhone = encodeURIComponent(contact.phone.replace(/[^0-9]/g, ''));
          websiteUrl = `${baseWebsiteUrl}/offer/${offerId}?p=${encodedPhone}`;
        }
        
        // Check if customer is outside 24h window using last INBOUND message (most accurate)
        // The WhatsApp 24h window is based on the customer's last message to the business
        const normalizedPhone = contact.phone.replace(/\D/g, '');
        const lastMsgTime = lastMessageMap[normalizedPhone] || null;
        const lastInteraction = lastMsgTime || (contact.lastOrderDate ? new Date(contact.lastOrderDate) : null);
        
        let hoursSinceLastInteraction = Infinity; // Default to outside 24h (safe — use template)
        if (lastInteraction && !isNaN(new Date(lastInteraction).getTime())) {
          hoursSinceLastInteraction = Math.floor((new Date() - new Date(lastInteraction)) / (1000 * 60 * 60));
        }
        const isOutside24h = hoursSinceLastInteraction >= 24;
        
        if (isOutside24h) {
          logger.info('[WhatsApp Broadcast] Customer outside 24h window, using template', { phone: contact.phone, name: contact.name || 'Unknown', hoursSinceLastInteraction, source: lastMsgTime ? 'inbound_message' : 'last_order_date' });
        } else {
          logger.info('[WhatsApp Broadcast] Customer within 24h window, using interactive', { phone: contact.phone, name: contact.name || 'Unknown', hoursSinceLastInteraction });
        }
        
        // Determine which template to use for outside-24h customers (declared outside try so catch can access it)
        const templateToUse = approvedTemplateName || (OFFER_TEMPLATE_NAME !== 'hello_world' ? OFFER_TEMPLATE_NAME : null);
        
        try {
          // If customer is outside 24h window, use approved template directly
          if (isOutside24h && templateToUse) {
            logger.info('[WhatsApp Broadcast] Sending approved template to old customer', { phone: contact.phone, name: contact.name || 'Unknown', template: templateToUse });
            
            // Send the approved marketing template directly — no hello_world hack needed
            await whatsapp.sendMarketingTemplate(
              contact.phone,
              templateToUse,
              offerImageUrl,
              [offerTitle || 'Special Offer', offerDescription || 'Check out our latest deals!'],
              null
            );
            sent++;
            sentViaTemplate++;
            successContacts.push({ phone: contact.phone, method: 'template', name: contact.name });
            logger.info('[WhatsApp Broadcast] Sent via template', { phone: contact.phone, name: contact.name || 'Unknown' });
            
            // Apply offer to customer's activeOffers if this is a targeted offer
            if (isTargetedOffer && offerData) {
              await this.applyOfferToCustomer(contact.phone, offerData);
            }
            
          } else {
            // Customer is within 24h window, send interactive message with CTA URL
            // Both targeted and non-targeted offers now use CTA URL to website
            // Eligibility check happens when they try to checkout via WhatsApp
            if (offerImageUrl) {
              await whatsapp.sendImageWithCtaUrlOriginal(
                contact.phone, 
                offerImageUrl, 
                message, 
                '🎁 Claim Offer', 
                websiteUrl,
                'Tap to order now!'
              );
            } else {
              await whatsapp.sendCtaUrl(
                contact.phone, 
                message, 
                '🎁 Claim Offer', 
                websiteUrl,
                'Tap to order now!'
              );
            }
            sent++;
            sentViaInteractive++;
            successContacts.push({ phone: contact.phone, method: 'interactive', name: contact.name });
            logger.info('[WhatsApp Broadcast] Sent CTA', { phone: contact.phone, name: contact.name || 'Unknown' });
            
            // Apply offer to customer's activeOffers if this is a targeted offer
            if (isTargetedOffer && offerData) {
              await this.applyOfferToCustomer(contact.phone, offerData);
            }
          }
        } catch (error) {
          const errorMessage = error.response?.data?.error?.message || error.message || '';
          const errorCode = error.response?.data?.error?.code;
          
          // Check if error is due to 24-hour window (error code 131047 or message contains relevant text)
          // Also check for test number recipient restrictions (error code 131030)
          const is24HourError = errorCode === 131047 || 
                               errorMessage.includes('24 hour') || 
                               errorMessage.includes('re-engage') ||
                               errorMessage.includes('outside the allowed window');
          
          const isTemplateRequiredError = errorMessage.includes('template') && !errorMessage.includes('not found');
          
          // Test number restriction - can only send to test recipients
          const isTestRecipientError = errorCode === 131030 || 
                                       errorMessage.includes('test') ||
                                       errorMessage.includes('recipient') ||
                                       errorMessage.includes('not a valid');
          
          // For test numbers, if recipient is not added, try template method
          if (isTestRecipientError && templateToUse) {
            // Try sending via approved template
            try {
              logger.info('[WhatsApp Broadcast] Test recipient restriction, trying approved template', { phone: contact.phone, name: contact.name || 'Unknown', template: templateToUse });
              
              await whatsapp.sendMarketingTemplate(
                contact.phone,
                templateToUse,
                offerImageUrl,
                [offerTitle || 'Special Offer', offerDescription || 'Check out our latest deals!'],
                null
              );
              sent++;
              sentViaTemplate++;
              successContacts.push({ phone: contact.phone, method: 'template', name: contact.name });
              logger.info('[WhatsApp Broadcast] Sent via template', { phone: contact.phone, name: contact.name || 'Unknown' });
            } catch (templateError) {
              failed++;
              const templateErrorMsg = templateError.response?.data?.error?.message || templateError.message;
              failedContacts.push({ 
                phone: contact.phone,
                name: contact.name,
                error: templateErrorMsg,
                reason: 'test_recipient_template_failed'
              });
              logger.error('[WhatsApp Broadcast] Template also failed', { phone: contact.phone, name: contact.name || 'Unknown', error: templateErrorMsg });
            }
          } else if ((is24HourError || isTemplateRequiredError) && templateToUse) {
            // Try sending via approved template (works outside 24-hour window)
            try {
              logger.info('[WhatsApp Broadcast] 24h window expired, trying approved template', { phone: contact.phone, name: contact.name || 'Unknown', template: templateToUse });
              
              await whatsapp.sendMarketingTemplate(
                contact.phone,
                templateToUse,
                offerImageUrl,
                [offerTitle || 'Special Offer', offerDescription || 'Check out our latest deals!'],
                null
              );
              sent++;
              sentViaTemplate++;
              successContacts.push({ phone: contact.phone, method: 'template', name: contact.name });
              logger.info('[WhatsApp Broadcast] Sent via template', { phone: contact.phone, name: contact.name || 'Unknown' });
            } catch (templateError) {
              failed++;
              const templateErrorMsg = templateError.response?.data?.error?.message || templateError.message;
              failedContacts.push({ 
                phone: contact.phone,
                name: contact.name,
                error: templateErrorMsg,
                reason: 'template_failed'
              });
              logger.error('[WhatsApp Broadcast] Template also failed', { phone: contact.phone, name: contact.name || 'Unknown', error: templateErrorMsg });
            }
          } else if ((is24HourError || isTemplateRequiredError) && !templateToUse) {
            // No approved template available
            failed++;
            failedContacts.push({ 
              phone: contact.phone,
              name: contact.name,
              error: '24-hour window expired and no approved template available. Create an offer first — the template will be auto-submitted to Meta for approval.',
              reason: '24h_no_template'
            });
            logger.warn('[WhatsApp Broadcast] 24h window expired, no approved template', { phone: contact.phone, name: contact.name || 'Unknown' });
          } else if (isTestRecipientError && !templateToUse) {
            // Test number restriction and no template to try
            failed++;
            failedContacts.push({ 
              phone: contact.phone,
              name: contact.name,
              error: 'Test number restriction: Can only send to registered test recipients. Add this number as a test recipient in Meta Business Manager or switch to a production WhatsApp number.',
              reason: 'test_recipient_restriction'
            });
            logger.warn('[WhatsApp Broadcast] Test recipient restriction, no template to try', { phone: contact.phone, name: contact.name || 'Unknown' });
          } else {
            // Other error
            failed++;
            failedContacts.push({ 
              phone: contact.phone,
              name: contact.name,
              error: errorMessage,
              reason: 'other_error'
            });
            logger.error('[WhatsApp Broadcast] Failed to send', { phone: contact.phone, name: contact.name || 'Unknown', error: errorMessage });
          }
        }
        
        // Reduced delay for rate limiting (500ms between messages for reliability)
        // Meta Cloud API allows ~80 messages/second for business tier
        // 500ms provides safe margin for template messages to be accepted
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      logger.info('[WhatsApp Broadcast] BROADCAST SUMMARY', {
        totalContacts: contacts.length,
        sent,
        sentViaInteractive,
        sentViaTemplate,
        failed,
        approvedTemplate: approvedTemplateName || 'None',
        fallbackTemplate: OFFER_TEMPLATE_NAME || 'None'
      });
      
      return {
        success: true,
        total: contacts.length,
        sent,
        sentViaInteractive,
        sentViaTemplate,
        failed,
        failedContacts,
        successContacts,
        templateUsed: approvedTemplateName || OFFER_TEMPLATE_NAME || null
      };
    } catch (error) {
      logger.error('[WhatsApp Broadcast] Error sending offer', { error: error.message, stack: error.stack });
      return { success: false, error: error.message, sent: 0, failed: 0 };
    }
  },

  // Get contact statistics
  async getStats() {
    try {
      const total = await WhatsAppContact.countDocuments({ isActive: true });
      const totalInactive = await WhatsAppContact.countDocuments({ isActive: false });
      
      return {
        total,
        active: total,
        inactive: totalInactive
      };
    } catch (error) {
      logger.error('[WhatsApp Broadcast] Error getting stats', { error: error.message, stack: error.stack });
      return { total: 0, active: 0, inactive: 0 };
    }
  },

  // Send offer to a single phone number (for testing)
  async sendOfferToSingle(phone, offerImageUrl, offerTitle, offerDescription, offerType) {
    try {
      // Build message
      let message = `🎉 *New Offer!*\n\n`;
      if (offerType) {
        message += `🏷️ *${offerType}*\n\n`;
      }
      if (offerTitle) {
        message += `*${offerTitle}*\n\n`;
      }
      if (offerDescription) {
        message += `${offerDescription}\n\n`;
      }
      message += `Order now and enjoy this amazing deal! 🍽️`;

      const websiteUrl = 'https://restarunt-bot.vercel.app/offers';

      logger.info('[WhatsApp Broadcast] Testing send', { phone });

      try {
        // Try sending interactive message first
        if (offerImageUrl) {
          await whatsapp.sendImageWithCtaUrlOriginal(
            phone, 
            offerImageUrl, 
            message, 
            'View Offer', 
            websiteUrl,
            'Tap to order now!'
          );
        } else {
          await whatsapp.sendCtaUrl(
            phone, 
            message, 
            'View Offer', 
            websiteUrl,
            'Tap to order now!'
          );
        }
        
        logger.info('[WhatsApp Broadcast] Test send successful', { phone });
        return {
          success: true,
          message: 'Offer sent successfully',
          phone,
          method: 'interactive'
        };
      } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.message || '';
        const errorCode = error.response?.data?.error?.code;
        
        logger.error('[WhatsApp Broadcast] Test send failed', {
          phone,
          errorCode,
          error: errorMessage,
          fullError: error.response?.data
        });

        // Check specific error types
        const is24HourError = errorCode === 131047 || 
                             errorMessage.includes('24 hour') || 
                             errorMessage.includes('re-engage') ||
                             errorMessage.includes('outside the allowed window');
        
        const isTemplateRequiredError = errorMessage.includes('template') && !errorMessage.includes('not found');
        
        let reason = 'unknown';
        let suggestion = '';
        
        if (is24HourError || isTemplateRequiredError) {
          // Try using approved template to send directly
          const templateName = OFFER_TEMPLATE_NAME !== 'hello_world' ? OFFER_TEMPLATE_NAME : null;
          
          if (templateName) {
            logger.info('[WhatsApp Broadcast] 24h window expired, trying approved template', { phone, template: templateName });
            
            try {
              await whatsapp.sendMarketingTemplate(
                phone,
                templateName,
                offerImageUrl,
                [offerTitle || 'Special Offer', offerDescription || 'Check out our latest deals!'],
                null
              );
              
              logger.info('[WhatsApp Broadcast] Test send successful via approved template', { phone });
              return {
                success: true,
                message: 'Offer sent successfully using approved template',
                phone,
                method: 'approved_template'
              };
            } catch (templateErr) {
              reason = '24_hour_window';
              suggestion = 'Failed to send via approved template. Ensure the offer template is approved by Meta before sending.';
              return {
                success: false,
                message: 'Failed to send offer',
                phone,
                error: templateErr.response?.data?.error?.message || templateErr.message,
                errorCode: templateErr.response?.data?.error?.code,
                reason,
                suggestion
              };
            }
          } else {
            reason = '24_hour_window';
            suggestion = 'Customer is outside the 24-hour messaging window and no approved template is available. Create an offer first — the template will be auto-submitted to Meta for approval.';
            return {
              success: false,
              message: 'Failed to send offer — no approved template',
              phone,
              error: errorMessage,
              errorCode,
              reason,
              suggestion
            };
          }
        } else if (errorCode === 131030 || errorMessage.includes('not a valid')) {
          reason = 'invalid_recipient';
          suggestion = 'This phone number is not a valid WhatsApp number or not registered on WhatsApp.';
        } else if (errorMessage.includes('test')) {
          reason = 'test_number_restriction';
          suggestion = 'You are using a test WhatsApp number. Test numbers can only send messages to phone numbers registered as test recipients in Meta Business Manager.';
        }

        return {
          success: false,
          message: 'Failed to send offer',
          phone,
          error: errorMessage,
          errorCode,
          reason,
          suggestion
        };
      }
    } catch (error) {
      logger.error('[WhatsApp Broadcast] Test send error', { error: error.message, stack: error.stack });
      return { success: false, error: error.message, phone };
    }
  }
};

module.exports = whatsappBroadcast;
