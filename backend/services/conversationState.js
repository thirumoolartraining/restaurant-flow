/**
 * Conversation State Management
 * 
 * Purpose: Centralized state extraction and manipulation
 * Zero schema changes - works with existing Customer.conversationState
 * 
 * State Structure (from Customer model):
 * {
 *   currentStep: string,
 *   selectedService: string,
 *   selectedCategory: string,
 *   selectedItem: string,
 *   pendingOrderId: string,
 *   foodTypePreference: string,
 *   paymentMethod: string,
 *   lastInteraction: Date,
 *   context: Mixed
 * }
 */

/**
 * Get conversation state from customer
 * Returns default state if not set
 */
function getState(customer) {
  return customer.conversationState || {
    currentStep: 'welcome',
    selectedService: null,
    selectedCategory: null,
    selectedItem: null,
    pendingOrderId: null,
    foodTypePreference: null,
    paymentMethod: null,
    lastInteraction: new Date(),
    context: {}
  };
const logger = require('./logger');
}

/**
 * Update conversation state
 * Returns updated state object (caller must save customer)
 */
function updateState(customer, updates) {
  const state = getState(customer);
  
  // Merge updates
  Object.assign(state, updates);
  
  // Update last interaction
  state.lastInteraction = new Date();
  
  // Attach to customer
  customer.conversationState = state;
  
  return state;
}

/**
 * Transition to new step
 * Validates step name and updates state
 */
function transitionTo(customer, newStep, additionalUpdates = {}) {
  const validSteps = [
    'welcome',
    'main_menu',
    'browsing_category',
    'viewing_item_details',
    'viewing_cart',
    'awaiting_location',
    'select_payment_method',
    'awaiting_payment',
    'order_placed',
    'item_added',
    'offer_not_eligible'
  ];
  
  if (!validSteps.includes(newStep)) {
    logger.warn(`⚠️ Invalid step transition: ${newStep}`);
  }
  
  return updateState(customer, {
    currentStep: newStep,
    ...additionalUpdates
  });
}

/**
 * Clear transient state (after order completion)
 * Keeps persistent data like preferences
 */
function clearTransientState(customer) {
  return updateState(customer, {
    currentStep: 'main_menu',
    selectedService: null,
    selectedCategory: null,
    selectedItem: null,
    pendingOrderId: null,
    paymentMethod: null,
    context: {}
  });
}

/**
 * Get current step
 */
function getCurrentStep(customer) {
  const state = getState(customer);
  return state.currentStep || 'welcome';
}

/**
 * Check if in specific step
 */
function isInStep(customer, step) {
  return getCurrentStep(customer) === step;
}

/**
 * Get context value
 */
function getContext(customer, key, defaultValue = null) {
  const state = getState(customer);
  return state.context?.[key] ?? defaultValue;
}

/**
 * Set context value
 */
function setContext(customer, key, value) {
  const state = getState(customer);
  if (!state.context) {
    state.context = {};
  }
  state.context[key] = value;
  customer.conversationState = state;
  return state;
}

/**
 * Clear context
 */
function clearContext(customer) {
  const state = getState(customer);
  state.context = {};
  customer.conversationState = state;
  return state;
}

/**
 * Get selected item ID
 */
function getSelectedItem(customer) {
  const state = getState(customer);
  return state.selectedItem;
}

/**
 * Set selected item ID
 */
function setSelectedItem(customer, itemId) {
  return updateState(customer, { selectedItem: itemId });
}

/**
 * Clear selected item
 */
function clearSelectedItem(customer) {
  return updateState(customer, { selectedItem: null });
}

/**
 * Get selected category
 */
function getSelectedCategory(customer) {
  const state = getState(customer);
  return state.selectedCategory;
}

/**
 * Set selected category
 */
function setSelectedCategory(customer, category) {
  return updateState(customer, { selectedCategory: category });
}

/**
 * Get pending order ID
 */
function getPendingOrderId(customer) {
  const state = getState(customer);
  return state.pendingOrderId;
}

/**
 * Set pending order ID
 */
function setPendingOrderId(customer, orderId) {
  return updateState(customer, { pendingOrderId: orderId });
}

/**
 * Clear pending order
 */
function clearPendingOrder(customer) {
  return updateState(customer, { pendingOrderId: null });
}

/**
 * Get payment method
 */
function getPaymentMethod(customer) {
  const state = getState(customer);
  return state.paymentMethod;
}

/**
 * Set payment method
 */
function setPaymentMethod(customer, method) {
  return updateState(customer, { paymentMethod: method });
}

/**
 * Get service type (delivery/pickup)
 */
function getServiceType(customer) {
  const state = getState(customer);
  return state.selectedService;
}

/**
 * Set service type
 */
function setServiceType(customer, serviceType) {
  return updateState(customer, { selectedService: serviceType });
}

/**
 * Get food type preference (veg/non-veg/all)
 */
function getFoodTypePreference(customer) {
  const state = getState(customer);
  return state.foodTypePreference;
}

/**
 * Set food type preference
 */
function setFoodTypePreference(customer, foodType) {
  return updateState(customer, { foodTypePreference: foodType });
}

/**
 * Check if state is stale (no interaction for X minutes)
 */
function isStale(customer, maxAgeMinutes = 30) {
  const state = getState(customer);
  if (!state.lastInteraction) return false;
  
  const ageMs = Date.now() - new Date(state.lastInteraction).getTime();
  const ageMinutes = ageMs / (1000 * 60);
  
  return ageMinutes > maxAgeMinutes;
}

/**
 * Reset to welcome if stale
 */
function resetIfStale(customer, maxAgeMinutes = 30) {
  if (isStale(customer, maxAgeMinutes)) {
    logger.info(`🔄 Resetting stale conversation for ${customer.phone}`);
    return clearTransientState(customer);
  }
  return getState(customer);
}

/**
 * Get state summary for logging
 */
function getStateSummary(customer) {
  const state = getState(customer);
  return {
    step: state.currentStep,
    service: state.selectedService,
    category: state.selectedCategory,
    hasItem: !!state.selectedItem,
    hasOrder: !!state.pendingOrderId,
    payment: state.paymentMethod
  };
}

module.exports = {
  // Core state management
  getState,
  updateState,
  setState: updateState, // Alias for API compatibility
  transitionTo,
  clearTransientState,
  
  // Step management
  getCurrentStep,
  isInStep,
  
  // Context management
  getContext,
  setContext,
  clearContext,
  
  // Item selection
  getSelectedItem,
  setSelectedItem,
  clearSelectedItem,
  
  // Category selection
  getSelectedCategory,
  setSelectedCategory,
  
  // Order management
  getPendingOrderId,
  setPendingOrderId,
  clearPendingOrder,
  
  // Payment
  getPaymentMethod,
  setPaymentMethod,
  
  // Service type
  getServiceType,
  setServiceType,
  
  // Food preference
  getFoodTypePreference,
  setFoodTypePreference,
  
  // Staleness
  isStale,
  resetIfStale,
  
  // Utilities
  getStateSummary
};
