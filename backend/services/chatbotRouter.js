/**
 * Chatbot Router - Smart Dispatch Layer (Phase 3.5)
 * 
 * Purpose: Route messages to appropriate domain handlers
 * Strategy: Intent-based routing with fallback to legacy chatbot
 * 
 * Phase 3.5 Goal: Integrate domain handlers while maintaining compatibility
 * 
 * Routing Strategy:
 * 1. Detect intent from message/state
 * 2. Route to appropriate domain handler
 * 3. Fallback to legacy chatbot.js for unhandled cases
 * 4. Gradually migrate all logic to domains
 */

const chatbot = require('./chatbot');
const domainRegistry = require('./domains/index');
const Customer = require('../models/Customer');
const conversationState = require('./conversationState');
const { logger, getCorrelationId, setMetadata, getMetadata } = require('./correlationContext');
const { getIdempotencyLedger, STATUS: IDEMPOTENCY_STATUS } = require('./idempotency/idempotencyLedger');
const { cartMutationKey, orderCreateKey, stableHash } = require('./idempotency/idempotencyKey');


function inferCartAction(selectedId = '', message = '') {
  const text = String(message || '').toLowerCase();
  if (selectedId.startsWith('add_') || /add/.test(text)) return 'add';
  if (selectedId.startsWith('remove_') || /remove/.test(text)) return 'remove';
  if (selectedId === 'clear_cart' || /clear cart|empty cart/.test(text)) return 'clear';
  return null;
}

function extractItemId(selectedId = '') {
  const match = String(selectedId).match(/(?:item_|add_|remove_)([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// Intent to domain mapping
const INTENT_DOMAIN_MAP = {
  // Menu intents
  'view_menu': 'menu',
  'browse_menu': 'menu',
  'search_menu': 'menu',
  'food_veg': 'menu',
  'food_nonveg': 'menu',
  'food_egg': 'menu',
  'food_both': 'menu',
  'food_all': 'menu',
  
  // Cart intents
  'view_cart': 'cart',
  'add_to_cart': 'cart',
  'clear_cart': 'cart',
  'cart': 'cart',
  
  // Order intents
  'my_orders': 'order',
  'track_order': 'order',
  'cancel_order': 'order',
  'order_history': 'order',
  
  // Location intents
  'share_location': 'location',
  'delivery_address': 'location',
  
  // Payment intents
  'pay_upi': 'paymentInitiation',
  'pay_cod': 'paymentInitiation',
  'pickup_pay_hotel': 'paymentInitiation',
  'pickup_pay_upi': 'paymentInitiation',
  'checkout': 'paymentInitiation'
};

// State to domain mapping
const STATE_DOMAIN_MAP = {
  'browsing_menu': 'menu',
  'viewing_item_details': 'menu',
  'select_food_type_order': 'menu',
  'select_category': 'menu',
  
  'viewing_cart': 'cart',
  'cart_options': 'cart',
  
  'my_orders_menu': 'order',
  'select_cancel': 'order',
  'select_track': 'order',
  
  'awaiting_location': 'location',
  
  'select_payment_method': 'paymentInitiation',
  'awaiting_payment': 'paymentCompletion'
};

/**
 * Route incoming message to appropriate handler
 * 
 * @param {string} phone - Customer phone number
 * @param {string|object} message - Message content (text or location object)
 * @param {string} messageType - Message type: 'text', 'button', 'list', 'location', 'audio', 'image'
 * @param {string|null} selectedId - Button/list selection ID
 * @param {string|null} senderName - Customer name from WhatsApp
 * @returns {Promise<void>}
 */
async function handleMessage(phone, message, messageType = 'text', selectedId = null, senderName = null) {
  let targetDomain = null;
  let previousState = null;
  let cartDedupKey = null;
  let orderDedupKey = null;
  let ledger = null;

  try {
    // Get customer and state
    const customer = await Customer.findOne({ phone });
    const state = customer ? conversationState.getState(customer) : null;
    previousState = state?.currentStep || null;
    
    // Determine target domain
    targetDomain = detectDomain(message, messageType, selectedId, state);
    const messageId = getMetadata('messageId') || null;
    const customerId = customer?._id ? String(customer._id) : null;
    ledger = getIdempotencyLedger();
    
    if (targetDomain && domainRegistry.hasDomain(targetDomain)) {
      setMetadata('targetDomain', targetDomain);
      logger.info('Routing to domain', {
        phone,
        domain: targetDomain,
        messageType,
        selectedId,
        correlationId: getCorrelationId()
      });
      
      // Route to domain handler
      // Note: Domain handlers have different signatures, so we still delegate to chatbot
      // for now, but log the routing decision for monitoring
      // Full domain routing will be implemented in Phase 3.6
    }
    
    if (targetDomain === 'cart' && customerId && messageId) {
      const cartAction = inferCartAction(selectedId, message);
      if (cartAction) {
        const cartKey = cartMutationKey({
          customerId,
          messageId,
          action: cartAction,
          itemId: extractItemId(selectedId)
        });
        cartDedupKey = cartKey;
        const cartGuard = await ledger.tryStart(cartKey, { metadata: { correlationId: getCorrelationId(), phone, messageId, selectedId } });
        if (cartGuard.status !== IDEMPOTENCY_STATUS.STARTED) {
          logger.info('Cart mutation deduplicated at router', {
            correlationId: getCorrelationId(),
            messageId,
            selectedId,
            customerId,
            key: cartKey,
            state: cartGuard.status
          });
          return;
        }
      }
    }

    if (targetDomain === 'paymentInitiation' && customerId && messageId && (selectedId === 'checkout' || selectedId === 'pay_upi' || selectedId === 'pay_cod')) {
      const cartHash = stableHash(JSON.stringify(customer.cart || []));
      const orderKey = orderCreateKey({ customerId, messageId, cartHash });
      orderDedupKey = orderKey;
      const orderGuard = await ledger.tryStart(orderKey, { metadata: { correlationId: getCorrelationId(), phone, messageId, selectedId } });
      if (orderGuard.status !== IDEMPOTENCY_STATUS.STARTED) {
        logger.info('Checkout/order trigger deduplicated at router', {
          correlationId: getCorrelationId(),
          messageId,
          selectedId,
          customerId,
          key: orderKey,
          state: orderGuard.status
        });
        return;
      }
    }

    // Fallback to legacy chatbot (Phase 3.6 will remove this)
    const result = await chatbot.handleMessage(phone, message, messageType, selectedId, senderName);

    if (cartDedupKey) {
      await ledger.markProcessed(cartDedupKey, {
        correlationId: getCorrelationId(),
        phone,
        messageId: getMetadata('messageId') || null,
        processedAt: new Date().toISOString()
      });
    }

    if (orderDedupKey) {
      await ledger.markProcessed(orderDedupKey, {
        correlationId: getCorrelationId(),
        phone,
        messageId: getMetadata('messageId') || null,
        processedAt: new Date().toISOString()
      });
    }

    const updatedCustomer = await Customer.findOne({ phone });
    const nextState = updatedCustomer ? conversationState.getState(updatedCustomer)?.currentStep || null : null;
    logger.info('Downstream chatbot handler completed', {
      phone,
      messageType,
      selectedId,
      domain: targetDomain || 'legacy',
      correlationId: getCorrelationId(),
      messageId: getMetadata('messageId') || null,
      previousState,
      nextState
    });
    return result;
    
  } catch (error) {
    logger.error('Router error', {
      error: error.message,
      phone,
      messageType,
      correlationId: getCorrelationId()
    });
    

    if (cartDedupKey) {
      await ledger.markFailed(cartDedupKey, {
        correlationId: getCorrelationId(),
        phone,
        messageId: getMetadata('messageId') || null,
        failedAt: new Date().toISOString(),
        error: error.message
      });
    }

    if (orderDedupKey) {
      await ledger.markFailed(orderDedupKey, {
        correlationId: getCorrelationId(),
        phone,
        messageId: getMetadata('messageId') || null,
        failedAt: new Date().toISOString(),
        error: error.message
      });
    }

    // Fallback to legacy chatbot on error
    const result = await chatbot.handleMessage(phone, message, messageType, selectedId, senderName);

    if (cartDedupKey) {
      await ledger.markProcessed(cartDedupKey, {
        correlationId: getCorrelationId(),
        phone,
        messageId: getMetadata('messageId') || null,
        processedAt: new Date().toISOString()
      });
    }

    if (orderDedupKey) {
      await ledger.markProcessed(orderDedupKey, {
        correlationId: getCorrelationId(),
        phone,
        messageId: getMetadata('messageId') || null,
        processedAt: new Date().toISOString()
      });
    }

    const updatedCustomer = await Customer.findOne({ phone });
    const nextState = updatedCustomer ? conversationState.getState(updatedCustomer)?.currentStep || null : null;
    logger.info('Downstream chatbot handler completed', {
      phone,
      messageType,
      selectedId,
      domain: targetDomain || 'legacy',
      correlationId: getCorrelationId(),
      messageId: getMetadata('messageId') || null,
      previousState,
      nextState
    });
    return result;
  }
}

/**
 * Detect which domain should handle the message
 * 
 * @param {string|object} message - Message content
 * @param {string} messageType - Message type
 * @param {string|null} selectedId - Button/list selection ID
 * @param {Object|null} state - Conversation state
 * @returns {string|null} Domain name or null
 */
function detectDomain(message, messageType, selectedId, state) {
  // 1. Check button/list selection ID
  if (selectedId && INTENT_DOMAIN_MAP[selectedId]) {
    return INTENT_DOMAIN_MAP[selectedId];
  }
  
  // 2. Check conversation state
  if (state?.currentStep && STATE_DOMAIN_MAP[state.currentStep]) {
    return STATE_DOMAIN_MAP[state.currentStep];
  }
  
  // 3. Check message type
  if (messageType === 'location') {
    return 'location';
  }
  
  // 4. Check text message for intents
  if (typeof message === 'string') {
    const lowerMessage = message.toLowerCase().trim();
    
    // Menu intents
    if (/menu|food|items|browse|veg|non-veg|egg/.test(lowerMessage)) {
      return 'menu';
    }
    
    // Cart intents
    if (/cart|basket/.test(lowerMessage)) {
      return 'cart';
    }
    
    // Order intents
    if (/order|track|cancel|status/.test(lowerMessage)) {
      return 'order';
    }
  }
  
  // 5. Default: no specific domain detected
  return null;
}

/**
 * Get router statistics (for monitoring)
 * 
 * @returns {Object} Router statistics
 */
function getStats() {
  return {
    routerVersion: '3.5',
    routingStrategy: 'intent-based-with-fallback',
    domainsExtracted: 6,
    totalDomains: 6,
    domainsIntegrated: 6,
    fallbackEnabled: true
  };
}

/**
 * Check if a domain can handle a specific action
 * 
 * @param {string} domain - Domain name
 * @param {string} action - Action name
 * @returns {boolean}
 */
function canHandle(domain, action) {
  return domainRegistry.hasAction(domain, action);
}

module.exports = {
  handleMessage,
  getStats,
  detectDomain,
  canHandle
};
