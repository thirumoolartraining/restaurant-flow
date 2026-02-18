/**
 * Domain Registry
 * Phase 4.1: Enhanced with structured logging
 * Phase 4.2: Enhanced with metrics collection
 * 
 * Central registry of all domain handlers
 * Provides clean interface for chatbot orchestrator
 */

const { logDomainAction, logError, startTimer } = require('../logger');
const { recordDomainAction } = require('../metrics');
const menuHandler = require('./menuHandler');
const cartHandler = require('./cartHandler');
const orderHandler = require('./orderHandler');
const locationHandler = require('./locationHandler');
const paymentInitiationHandler = require('./paymentInitiationHandler');
const paymentCompletionHandler = require('./paymentCompletionHandler');

/**
 * Domain handlers registry
 */
const domains = {
  menu: menuHandler,
  cart: cartHandler,
  order: orderHandler,
  location: locationHandler,
  paymentInitiation: paymentInitiationHandler,
  paymentCompletion: paymentCompletionHandler
};

/**
 * Execute domain action
 * 
 * @param {string} domain - Domain name
 * @param {string} action - Action name
 * @param {Object} customer - Customer document
 * @param {string} phone - Customer phone
 * @param {Object} params - Action parameters
 * @returns {Promise<Object|null>} Redirect instruction or null
 */
async function execute(domain, action, customer, phone, params = {}) {
  const endTimer = startTimer(`${domain}.${action}`);
  
  try {
    const handler = domains[domain];
    
    if (!handler) {
      const error = new Error(`Domain not found: ${domain}`);
      logError(`Unknown domain: ${domain}`, error, { domain, action });
      recordDomainAction(domain, action, false);
      throw error;
    }
    
    const actionFn = handler[action];
    
    if (!actionFn) {
      const error = new Error(`Action not found: ${domain}.${action}`);
      logError(`Unknown action: ${domain}.${action}`, error, { domain, action });
      recordDomainAction(domain, action, false);
      throw error;
    }
    
    logDomainAction(domain, action, { phone: phone.slice(-4) }); // Log last 4 digits only
    
    // Execute action
    const result = await actionFn(customer, phone, params);
    
    // Check if action wants to redirect to another domain
    if (result && result.redirect) {
      logDomainAction('redirect', `${result.redirect}.${result.action}`, { 
        from: `${domain}.${action}`,
        to: `${result.redirect}.${result.action}`
      });
      recordDomainAction(domain, action, true);
      return result;
    }
    
    endTimer({ success: true });
    recordDomainAction(domain, action, true);
    return null;
    
  } catch (error) {
    endTimer({ success: false, error: error.message });
    recordDomainAction(domain, action, false);
    logError(`Domain execution failed: ${domain}.${action}`, error, { 
      domain, 
      action, 
      phone: phone.slice(-4) 
    });
    throw error;
  }
}

/**
 * Check if domain exists
 */
function hasDomain(domainName) {
  return !!domains[domainName];
}

/**
 * Check if action exists in domain
 */
function hasAction(domainName, actionName) {
  const handler = domains[domainName];
  return handler && typeof handler[actionName] === 'function';
}

module.exports = {
  execute,
  hasDomain,
  hasAction,
  domains
};
