/**
 * Chatbot Orchestrator - Phase 6.2
 * 
 * Purpose: Lightweight orchestration layer that delegates to domain handlers
 * Reduces legacy chatbot.js handleMessage from 1486 lines to ~100 lines
 * 
 * Responsibilities:
 * - Holiday mode check
 * - Customer initialization
 * - Category/menu filtering
 * - Intent detection and routing
 * - Location handling delegation
 * - State management coordination
 * 
 * Does NOT:
 * - Handle business logic (delegated to domains)
 * - Send WhatsApp messages directly (domains handle this)
 * - Manage cart/order operations (domains handle this)
 */

const Customer = require('../models/Customer');
const MenuItem = require('../models/MenuItem');
const Category = require('../models/Category');
const Settings = require('../models/Settings');
const whatsapp = require('./whatsapp');
const whatsappBroadcast = require('./whatsappBroadcast');
const googleSheets = require('./googleSheets');
const chatbotImagesService = require('./chatbotImages');
const chatbotRouter = require('./chatbotRouter');
const conversationState = require('./conversationState');
const { logger } = require('./correlationContext');

// Import domain handlers
const menuHandler = require('./domains/menuHandler');
const cartHandler = require('./domains/cartHandler');
const orderHandler = require('./domains/orderHandler');
const locationHandler = require('./domains/locationHandler');
const paymentInitiationHandler = require('./domains/paymentInitiationHandler');
const paymentCompletionHandler = require('./domains/paymentCompletionHandler');

// Import shared utilities
const { sendWithOptionalImage } = require('./domains/shared');

/**
 * Check if holiday mode is enabled
 */
async function checkHolidayMode(phone) {
  const holidayMode = await Settings.getValue('holidayMode', false);
  
  if (holidayMode) {
    logger.info('Holiday mode active', { phone });
    
    await whatsapp.sendMessage(phone, 
      `🏖️ *Holiday Notice*\n\n` +
      `Dear Customer,\n\n` +
      `We are currently closed for today. We apologize for any inconvenience caused.\n\n` +
      `We will be back soon to serve you delicious food! 🍽️\n\n` +
      `Thank you for your understanding. 🙏`
    );
    
    return true;
  }
  
  return false;
}

/**
 * Initialize or get customer
 */
async function initializeCustomer(phone, senderName) {
  let customer = await Customer.findOne({ phone });
  
  if (!customer) {
    customer = new Customer({ 
      phone, 
      name: senderName || null,
      conversationState: { currentStep: 'welcome' }, 
      cart: [] 
    });
    await customer.save();
    logger.info('New customer created', { phone, name: senderName });
  } else if (senderName && (!customer.name || customer.name === 'Unknown' || customer.name === 'Customer')) {
    customer.name = senderName;
    await customer.save();
    logger.info('Customer name updated', { phone, name: senderName });
  }
  
  // Save WhatsApp contact for broadcast (non-blocking)
  whatsappBroadcast.addContact(phone, customer.name || senderName, new Date()).catch(err => {
    logger.error('Failed to save WhatsApp contact', { error: err.message });
  });
  
  // Save customer to Google Sheets (non-blocking)
  googleSheets.addOrUpdateCustomer(phone, customer.name || senderName, customer.deliveryAddress?.address).catch(err => {
    logger.error('Failed to save customer to Google Sheets', { error: err.message });
  });
  
  return customer;
}

/**
 * Get available menu items based on category schedules
 */
async function getAvailableMenuItems() {
  const allCategories = await Category.find({ isActive: true });
  
  // Get scheduled categories that are currently ACTIVE
  const scheduledActiveCategories = allCategories
    .filter(c => c.schedule?.enabled && !c.isPaused && !c.isSoldOut)
    .map(c => c.name);
  
  // Get scheduled categories that are LOCKED
  const scheduledLockedCategories = allCategories
    .filter(c => c.schedule?.enabled && (c.isPaused || c.isSoldOut))
    .map(c => c.name);
  
  const allMenuItems = await MenuItem.find({ available: true });
  
  const menuItems = allMenuItems.filter(item => {
    const itemCategories = Array.isArray(item.category) ? item.category : [item.category];
    
    // Check if item has any scheduled category that is ACTIVE
    const hasScheduledActiveCategory = itemCategories.some(cat => 
      scheduledActiveCategories.includes(cat)
    );
    if (hasScheduledActiveCategory) return true;
    
    // Check if item has any scheduled category that is LOCKED
    const hasScheduledLockedCategory = itemCategories.some(cat => 
      scheduledLockedCategories.includes(cat)
    );
    if (hasScheduledLockedCategory) return false;
    
    // Item has no scheduled categories - check if any non-scheduled category is active
    const hasActiveNonScheduledCategory = itemCategories.some(cat => {
      const category = allCategories.find(c => c.name === cat);
      return category && !category.schedule?.enabled && !category.isPaused && !category.isSoldOut;
    });
    
    return hasActiveNonScheduledCategory;
  });
  
  logger.info('Menu items filtered', {
    total: allMenuItems.length,
    available: menuItems.length,
    filtered: allMenuItems.length - menuItems.length,
    scheduledActive: scheduledActiveCategories.length,
    scheduledLocked: scheduledLockedCategories.length
  });
  
  return menuItems;
}

/**
 * Handle location message
 */
async function handleLocationMessage(phone, customer, locationData) {
  logger.info('Location received', { phone, locationData });
  
  // Delegate to location handler
  const result = await locationHandler.handleLocation(customer, phone, locationData);
  
  if (result.success) {
    logger.info('Location processed successfully', { phone });
  } else {
    logger.warn('Location processing failed', { phone, reason: result.reason });
  }
  
  return result;
}

/**
 * Main orchestrator - handles incoming messages
 */
async function handleMessage(phone, message, messageType = 'text', selectedId = null, senderName = null) {
  try {
    // 1. Check holiday mode
    const isHoliday = await checkHolidayMode(phone);
    if (isHoliday) return;
    
    // 2. Initialize customer
    const customer = await initializeCustomer(phone, senderName);
    
    // 3. Get available menu items
    const menuItems = await getAvailableMenuItems();
    
    // 4. Get conversation state
    const state = customer.conversationState || { currentStep: 'welcome' };
    
    // 5. Handle location messages
    if (messageType === 'location') {
      const locationData = typeof message === 'object' ? message : {};
      await handleLocationMessage(phone, customer, locationData);
      return;
    }
    
    // 6. Prepare message for routing
    const msg = typeof message === 'string' ? message.toLowerCase().trim() : '';
    const selection = selectedId || msg;
    
    logger.info('Message received', { 
      phone, 
      message: msg.substring(0, 50), 
      messageType, 
      currentStep: state.currentStep 
    });
    
    // 7. Route to appropriate domain handler
    const routingContext = {
      customer,
      phone,
      message: msg,
      selection,
      messageType,
      selectedId,
      state,
      menuItems
    };
    
    await chatbotRouter.route(routingContext);
    
  } catch (error) {
    logger.error('Orchestrator error', { 
      phone, 
      error: error.message, 
      stack: error.stack 
    });
    
    // Send generic error message
    await whatsapp.sendButtons(phone, 
      `❌ Something went wrong. Please try again or contact support.`,
      [
        { id: 'home', text: '🏠 Main Menu' },
        { id: 'help', text: '❓ Help' }
      ]
    );
  }
}

module.exports = {
  handleMessage,
  checkHolidayMode,
  initializeCustomer,
  getAvailableMenuItems,
  handleLocationMessage
};
