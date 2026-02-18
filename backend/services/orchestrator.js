/**
 * Smart Orchestrator - Phase 3.6
 * Phase 4.1: Enhanced with structured logging
 * Phase 4.2: Enhanced with metrics collection
 * 
 * Purpose: Pure orchestration layer that routes to domain handlers
 * Strategy: Domain-first routing with legacy fallback
 * 
 * This orchestrator:
 * 1. Routes requests to domain handlers when possible
 * 2. Falls back to legacy chatbot.js for complex flows
 * 3. Maintains 100% backward compatibility
 * 4. Enables gradual migration
 */

const chatbot = require('./chatbot');
const domainRegistry = require('./domains/index');
const Customer = require('../models/Customer');
const conversationState = require('./conversationState');
const { logger: correlationLogger } = require('./correlationContext');
const { info, warn, logEvent, startTimer } = require('./logger');
const { recordRequest, recordSuccess, recordFailure, recordResponseTime } = require('./metrics');

// Route configuration: maps intents/states to domain actions
const ROUTE_CONFIG = {
  // Menu routes
  'view_menu': { domain: 'menu', action: 'showFoodTypeSelection' },
  'food_veg': { domain: 'menu', action: 'showCategoriesByFoodType', params: { foodType: 'veg' } },
  'food_nonveg': { domain: 'menu', action: 'showCategoriesByFoodType', params: { foodType: 'non-veg' } },
  'food_egg': { domain: 'menu', action: 'showCategoriesByFoodType', params: { foodType: 'egg' } },
  'food_both': { domain: 'menu', action: 'showCategoriesByFoodType', params: { foodType: 'both' } },
  'food_all': { domain: 'menu', action: 'showCategoriesByFoodType', params: { foodType: 'all' } },
  
  // Cart routes
  'view_cart': { domain: 'cart', action: 'viewCart' },
  'clear_cart': { domain: 'cart', action: 'clearCart' },
  
  // Order routes
  'my_orders': { domain: 'order', action: 'sendMyOrdersMenu' },
  'track_order': { domain: 'order', action: 'trackOrder' },
  'order_history': { domain: 'order', action: 'viewOrderHistory' },
  
  // Payment routes
  'pay_upi': { domain: 'paymentInitiation', action: 'initiateOnlinePayment', params: { serviceType: 'delivery' } },
  'pay_cod': { domain: 'paymentInitiation', action: 'processCODOrder', params: { serviceType: 'delivery' } },
  'pickup_pay_hotel': { domain: 'paymentInitiation', action: 'processPickupOrder' },
  'pickup_pay_upi': { domain: 'paymentInitiation', action: 'initiateOnlinePayment', params: { serviceType: 'pickup' } }
};

// State-based routing
const STATE_ROUTES = {
  'viewing_cart': { domain: 'cart', action: 'viewCart' },
  'select_payment_method': { domain: 'paymentInitiation', action: 'showPaymentOptions' },
  'my_orders_menu': { domain: 'order', action: 'sendMyOrdersMenu' }
};

/**
 * Main orchestration function
 * 
 * @param {string} phone - Customer phone number
 * @param {string|object} message - Message content
 * @param {string} messageType - Message type
 * @param {string|null} selectedId - Button/list selection ID
 * @param {string|null} senderName - Customer name
 * @returns {Promise<void>}
 */
async function handleMessage(phone, message, messageType = 'text', selectedId = null, senderName = null) {
  const endTimer = startTimer('orchestrator.handleMessage');
  recordRequest(messageType);
  
  try {
    // Get or create customer
    let customer = await Customer.findOne({ phone });
    if (!customer) {
      info('New customer, routing to legacy chatbot', { phone: phone.slice(-4) });
      const duration = endTimer({ route: 'legacy', reason: 'new_customer' });
      recordResponseTime('orchestrator', duration);
      recordResponseTime('legacy', duration);
      recordSuccess();
      return await chatbot.handleMessage(phone, message, messageType, selectedId, senderName);
    }
    
    // Get conversation state
    const state = conversationState.getState(customer);
    
    // Try to route to domain handler
    const route = determineRoute(selectedId, state, message, messageType);
    
    if (route && route.useDomain) {
      info('Routing to domain', {
        phone: phone.slice(-4),
        domain: route.domain,
        action: route.action,
        selectedId
      });
      
      try {
        // Execute domain action
        const result = await domainRegistry.execute(
          route.domain,
          route.action,
          customer,
          phone,
          route.params || {}
        );
        
        // Handle redirects between domains
        if (result && result.redirect) {
          info('Domain redirect', {
            from: route.domain,
            to: result.redirect,
            action: result.action
          });
          
          await domainRegistry.execute(
            result.redirect,
            result.action,
            customer,
            phone,
            result.params || {}
          );
        }
        
        const duration = endTimer({ route: 'domain', domain: route.domain, action: route.action });
        recordResponseTime('orchestrator', duration);
        recordResponseTime('domain', duration, `${route.domain}.${route.action}`);
        recordSuccess();
        return;
        
      } catch (domainError) {
        warn('Domain execution error, falling back to legacy', {
          error: domainError.message,
          domain: route.domain,
          action: route.action
        });
        
        // Fall through to legacy chatbot
      }
    }
    
    // Fallback to legacy chatbot for complex flows
    info('Using legacy chatbot', {
      phone: phone.slice(-4),
      messageType,
      selectedId,
      reason: route ? 'domain_error' : 'no_route'
    });
    
    const duration = endTimer({ route: 'legacy', reason: route ? 'domain_error' : 'no_route' });
    recordResponseTime('orchestrator', duration);
    recordResponseTime('legacy', duration);
    recordSuccess();
    return await chatbot.handleMessage(phone, message, messageType, selectedId, senderName);
    
  } catch (error) {
    const duration = endTimer({ route: 'error', error: error.message });
    recordResponseTime('orchestrator', duration);
    recordFailure();
    warn('Orchestrator error, falling back to legacy', {
      error: error.message,
      phone: phone.slice(-4),
      messageType
    });
    
    // Always fallback to legacy chatbot on error
    return await chatbot.handleMessage(phone, message, messageType, selectedId, senderName);
  }
}

/**
 * Determine routing decision
 * 
 * @param {string|null} selectedId - Button/list selection
 * @param {Object|null} state - Conversation state
 * @param {string|object} message - Message content
 * @param {string} messageType - Message type
 * @returns {Object|null} Route configuration or null
 */
function determineRoute(selectedId, state, message, messageType) {
  // 1. Check button/list selection
  if (selectedId && ROUTE_CONFIG[selectedId]) {
    return {
      useDomain: true,
      ...ROUTE_CONFIG[selectedId]
    };
  }
  
  // 2. Check conversation state
  if (state?.currentStep && STATE_ROUTES[state.currentStep]) {
    return {
      useDomain: true,
      ...STATE_ROUTES[state.currentStep]
    };
  }
  
  // 3. Check message type
  if (messageType === 'location') {
    return {
      useDomain: true,
      domain: 'location',
      action: 'handleLocation',
      params: { locationData: message }
    };
  }
  
  // 4. Check text intents (simple patterns)
  if (typeof message === 'string') {
    const lowerMessage = message.toLowerCase().trim();
    
    // Simple cart intent
    if (lowerMessage === 'cart' || lowerMessage === 'view cart') {
      return {
        useDomain: true,
        domain: 'cart',
        action: 'viewCart'
      };
    }
    
    // Simple menu intent
    if (lowerMessage === 'menu' || lowerMessage === 'view menu') {
      return {
        useDomain: true,
        domain: 'menu',
        action: 'showFoodTypeSelection'
      };
    }
  }
  
  // 5. No clear route - use legacy chatbot
  return {
    useDomain: false,
    reason: 'complex_flow'
  };
}

/**
 * Get orchestrator statistics
 * 
 * @returns {Object} Statistics
 */
function getStats() {
  return {
    version: '3.6',
    strategy: 'domain-first-with-fallback',
    domainsAvailable: 6,
    routesConfigured: Object.keys(ROUTE_CONFIG).length,
    stateRoutes: Object.keys(STATE_ROUTES).length,
    fallbackEnabled: true,
    legacyChatbotActive: true
  };
}

/**
 * Add new route configuration
 * 
 * @param {string} intent - Intent or selection ID
 * @param {string} domain - Domain name
 * @param {string} action - Action name
 * @param {Object} params - Optional parameters
 */
function addRoute(intent, domain, action, params = {}) {
  ROUTE_CONFIG[intent] = { domain, action, params };
  logger.info('Route added', { intent, domain, action });
}

/**
 * Check if orchestrator can handle a request
 * 
 * @param {string} selectedId - Button/list selection
 * @param {Object} state - Conversation state
 * @returns {boolean}
 */
function canHandle(selectedId, state) {
  if (selectedId && ROUTE_CONFIG[selectedId]) {
    return true;
  }
  
  if (state?.currentStep && STATE_ROUTES[state.currentStep]) {
    return true;
  }
  
  return false;
}

module.exports = {
  handleMessage,
  getStats,
  addRoute,
  canHandle,
  determineRoute
};
