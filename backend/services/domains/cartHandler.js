/**
 * Cart Domain Handler - Phase 3.4.2
 * 
 * Responsibilities:
 * - Add items to cart with quantity management
 * - Remove items from cart
 * - View cart with formatted display
 * - Clear cart
 * - Update quantities
 * - Cart validation and availability checks
 * - Intent detection for cart operations
 * 
 * Domain Boundaries:
 * - Does NOT handle order placement (Order Domain)
 * - Does NOT handle payment processing (Payment Domain)
 * - Does NOT handle location selection (Location Domain)
 * - Uses conversationState service for state management
 * 
 * Enhanced with:
 * - Idempotency for cart operations
 * - Transaction support for consistency
 * - Intent detection patterns
 * - Helper functions for formatting
 */

const MenuItem = require('../../models/MenuItem');
const conversationState = require('../conversationState');
const whatsapp = require('../whatsapp');
const idempotencyService = require('../idempotencyService');
const transactionManager = require('../transactionManager');
const { logger } = require('../correlationContext');

// Cart intent patterns
const CART_INTENTS = {
  SIMPLE_CART: /^(cart|basket)$/i,
  FULL_CART: /(view|show|check|see|my).*(cart|basket|order)/i,
  CLEAR_CART: /(clear|empty|remove all|delete all).*(cart|basket)/i,
  REMOVE_ITEM: /remove\s+(\d+)/i
};

/**
 * Add item to cart
 */
async function addToCart(customer, phone, params) {
  const { itemId, quantity = 1 } = params;
  
  // Idempotency check - prevent duplicate adds
  const idempotencyCheck = idempotencyService.checkCartOperation(
    customer._id.toString(),
    'add',
    itemId,
    quantity
  );
  
  if (idempotencyCheck.isDuplicate) {
    logger.info('Duplicate cart add prevented', {
      customerId: customer._id,
      itemId,
      quantity
    });
    
    await whatsapp.sendMessage(phone, '✅ Item already in cart!');
    return;
  }
  
  const item = await MenuItem.findById(itemId);
  
  if (!item || !item.available) {
    await whatsapp.sendMessage(phone, '❌ Item not available.');
    return;
  }
  
  // Use transaction for consistency
  try {
    await transactionManager.execute(async (session) => {
      // Check if item already in cart
      const existingIndex = customer.cart.findIndex(
        c => c.menuItem?.toString() === itemId
      );
      
      if (existingIndex >= 0) {
        customer.cart[existingIndex].quantity += quantity;
        customer.cart[existingIndex].addedAt = new Date();
      } else {
        customer.cart.push({
          menuItem: itemId,
          quantity,
          addedAt: new Date()
        });
      }
      
      await customer.save({ session });
    });
    
    // Mark operation as processed
    idempotencyCheck.mark();
    
    logger.info('Item added to cart', {
      customerId: customer._id,
      itemId,
      quantity,
      cartSize: customer.cart.length
    });
    
    const message = `✅ *${item.name}* added to cart!\n\n` +
      `Quantity: ${quantity}\n` +
      `Price: ₹${item.price * quantity}\n\n` +
      `Cart total: ${customer.cart.length} item(s)`;
    
    await whatsapp.sendButtons(phone, message, [
      { id: 'view_cart', text: '🛒 View Cart' },
      { id: 'view_menu', text: '📋 Continue Shopping' },
      { id: 'checkout', text: '✅ Checkout' }
    ]);
    
    conversationState.clearSelectedItem(customer);
    conversationState.transitionTo(customer, 'item_added');
    await customer.save();
    
  } catch (error) {
    logger.error('Failed to add item to cart', {
      customerId: customer._id,
      itemId,
      error: error.message
    });
    
    await whatsapp.sendMessage(phone, '❌ Failed to add item to cart. Please try again.');
  }
}

/**
 * View cart
 */
async function viewCart(customer, phone) {
  if (!customer.cart || customer.cart.length === 0) {
    await whatsapp.sendMessage(phone, '🛒 Your cart is empty.\n\nStart adding items from our menu!');
    await whatsapp.sendButtons(phone, 'What would you like to do?', [
      { id: 'view_menu', text: '📋 Browse Menu' },
      { id: 'home', text: '🏠 Main Menu' }
    ]);
    return;
  }
  
  // Populate cart items
  await customer.populate('cart.menuItem');
  
  let message = '🛒 *Your Cart*\n\n';
  let total = 0;
  
  customer.cart.forEach((cartItem, index) => {
    const item = cartItem.menuItem;
    if (item) {
      const itemTotal = item.price * cartItem.quantity;
      total += itemTotal;
      message += `${index + 1}. ${item.name}\n`;
      message += `   Qty: ${cartItem.quantity} × ₹${item.price} = ₹${itemTotal}\n\n`;
    }
  });
  
  message += `💰 *Total: ₹${total}*`;
  
  const buttons = [
    { id: 'checkout', text: '✅ Proceed to Checkout' },
    { id: 'view_menu', text: '📋 Add More Items' },
    { id: 'clear_cart', text: '🗑️ Clear Cart' }
  ];
  
  await whatsapp.sendButtons(phone, message, buttons);
  
  conversationState.transitionTo(customer, 'viewing_cart');
  await customer.save();
}

/**
 * Remove item from cart
 */
async function removeFromCart(customer, phone, params) {
  const { itemId } = params;
  
  // Idempotency check
  const idempotencyCheck = idempotencyService.checkCartOperation(
    customer._id.toString(),
    'remove',
    itemId
  );
  
  if (idempotencyCheck.isDuplicate) {
    logger.info('Duplicate cart remove prevented', {
      customerId: customer._id,
      itemId
    });
    return;
  }
  
  const index = customer.cart.findIndex(
    c => c.menuItem?.toString() === itemId
  );
  
  if (index === -1) {
    await whatsapp.sendMessage(phone, '❌ Item not found in cart.');
    return;
  }
  
  try {
    await transactionManager.execute(async (session) => {
      customer.cart.splice(index, 1);
      await customer.save({ session });
    });
    
    // Mark operation as processed
    idempotencyCheck.mark();
    
    logger.info('Item removed from cart', {
      customerId: customer._id,
      itemId,
      cartSize: customer.cart.length
    });
    
    await whatsapp.sendMessage(phone, '✅ Item removed from cart.');
    
    // Show updated cart
    await viewCart(customer, phone);
    
  } catch (error) {
    logger.error('Failed to remove item from cart', {
      customerId: customer._id,
      itemId,
      error: error.message
    });
    
    await whatsapp.sendMessage(phone, '❌ Failed to remove item. Please try again.');
  }
}

/**
 * Clear cart
 */
async function clearCart(customer, phone) {
  // Idempotency check
  const idempotencyCheck = idempotencyService.checkCartOperation(
    customer._id.toString(),
    'clear',
    'all'
  );
  
  if (idempotencyCheck.isDuplicate) {
    logger.info('Duplicate cart clear prevented', {
      customerId: customer._id
    });
    return;
  }
  
  try {
    await transactionManager.execute(async (session) => {
      customer.cart = [];
      await customer.save({ session });
    });
    
    // Mark operation as processed
    idempotencyCheck.mark();
    
    logger.info('Cart cleared', {
      customerId: customer._id
    });
    
    await whatsapp.sendMessage(phone, '🗑️ Cart cleared successfully.');
    
    await whatsapp.sendButtons(phone, 'What would you like to do next?', [
      { id: 'view_menu', text: '📋 Browse Menu' },
      { id: 'home', text: '🏠 Main Menu' }
    ]);
    
    conversationState.transitionTo(customer, 'main_menu');
    await customer.save();
    
  } catch (error) {
    logger.error('Failed to clear cart', {
      customerId: customer._id,
      error: error.message
    });
    
    await whatsapp.sendMessage(phone, '❌ Failed to clear cart. Please try again.');
  }
}

/**
 * Handle cart actions (from viewing_cart state)
 */
async function handleCartAction(customer, phone, params) {
  const { message } = params;
  
  // Check if user wants to remove item by number
  const match = message.match(/remove\s+(\d+)/i);
  if (match) {
    const itemNumber = parseInt(match[1]) - 1;
    if (itemNumber >= 0 && itemNumber < customer.cart.length) {
      const itemId = customer.cart[itemNumber].menuItem?.toString();
      if (itemId) {
        return { redirect: 'cart', action: 'removeFromCart', params: { itemId } };
      }
    }
  }
  
  // Default: show cart again
  await viewCart(customer, phone);
}

/**
 * Check cart availability - verify all items are still available
 */
async function checkCartAvailability(customer, phone) {
  if (!customer.cart || customer.cart.length === 0) {
    return { available: true, unavailableItems: [] };
  }
  
  await customer.populate('cart.menuItem');
  
  const unavailableItems = [];
  
  for (const cartItem of customer.cart) {
    const item = cartItem.menuItem;
    if (!item || !item.available) {
      unavailableItems.push({
        id: item?._id,
        name: item?.name || 'Unknown Item'
      });
    }
  }
  
  if (unavailableItems.length > 0) {
    logger.warn('Cart has unavailable items', {
      customerId: customer._id,
      unavailableCount: unavailableItems.length
    });
    
    let message = '⚠️ *Some items in your cart are no longer available:*\n\n';
    unavailableItems.forEach(item => {
      message += `❌ ${item.name}\n`;
    });
    message += '\nPlease remove them before checkout.';
    
    await whatsapp.sendMessage(phone, message);
    
    return { available: false, unavailableItems };
  }
  
  return { available: true, unavailableItems: [] };
}

/**
 * Update item quantity in cart
 */
async function updateQuantity(customer, phone, params) {
  const { itemId, quantity } = params;
  
  if (!quantity || quantity < 1) {
    await whatsapp.sendMessage(phone, '❌ Invalid quantity. Please specify a number greater than 0.');
    return;
  }
  
  const index = customer.cart.findIndex(
    c => c.menuItem?.toString() === itemId
  );
  
  if (index === -1) {
    await whatsapp.sendMessage(phone, '❌ Item not found in cart.');
    return;
  }
  
  try {
    await transactionManager.execute(async (session) => {
      customer.cart[index].quantity = quantity;
      customer.cart[index].addedAt = new Date();
      await customer.save({ session });
    });
    
    logger.info('Cart quantity updated', {
      customerId: customer._id,
      itemId,
      newQuantity: quantity
    });
    
    await whatsapp.sendMessage(phone, `✅ Quantity updated to ${quantity}`);
    await viewCart(customer, phone);
    
  } catch (error) {
    logger.error('Failed to update quantity', {
      customerId: customer._id,
      itemId,
      error: error.message
    });
    
    await whatsapp.sendMessage(phone, '❌ Failed to update quantity. Please try again.');
  }
}

/**
 * Get cart total
 */
async function getCartTotal(customer) {
  if (!customer.cart || customer.cart.length === 0) {
    return 0;
  }
  
  await customer.populate('cart.menuItem');
  
  let total = 0;
  customer.cart.forEach(cartItem => {
    const item = cartItem.menuItem;
    if (item && item.available) {
      total += item.price * cartItem.quantity;
    }
  });
  
  return total;
}

/**
 * Get cart item count
 */
function getCartItemCount(customer) {
  if (!customer.cart || customer.cart.length === 0) {
    return 0;
  }
  
  return customer.cart.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Format cart for display
 */
async function formatCart(customer) {
  if (!customer.cart || customer.cart.length === 0) {
    return { message: '🛒 Your cart is empty.', total: 0, itemCount: 0 };
  }
  
  await customer.populate('cart.menuItem');
  
  let message = '🛒 *Your Cart*\n\n';
  let total = 0;
  let itemCount = 0;
  
  customer.cart.forEach((cartItem, index) => {
    const item = cartItem.menuItem;
    if (item) {
      const itemTotal = item.price * cartItem.quantity;
      total += itemTotal;
      itemCount += cartItem.quantity;
      
      message += `${index + 1}. ${item.name}\n`;
      message += `   Qty: ${cartItem.quantity} × ₹${item.price} = ₹${itemTotal}\n`;
      
      if (!item.available) {
        message += `   ⚠️ *Not Available*\n`;
      }
      
      message += '\n';
    }
  });
  
  message += `💰 *Total: ₹${total}*\n`;
  message += `📦 *Items: ${itemCount}*`;
  
  return { message, total, itemCount };
}

/**
 * Detect cart intent from message
 */
function detectCartIntent(message) {
  if (CART_INTENTS.SIMPLE_CART.test(message)) {
    return 'view_cart';
  }
  
  if (CART_INTENTS.FULL_CART.test(message)) {
    return 'view_cart';
  }
  
  if (CART_INTENTS.CLEAR_CART.test(message)) {
    return 'clear_cart';
  }
  
  const removeMatch = message.match(CART_INTENTS.REMOVE_ITEM);
  if (removeMatch) {
    return { intent: 'remove_item', itemNumber: parseInt(removeMatch[1]) };
  }
  
  return null;
}

/**
 * Check if message is a simple cart keyword
 */
function isSimpleCartKeyword(message) {
  return CART_INTENTS.SIMPLE_CART.test(message);
}

/**
 * Check if message is a cart intent
 */
function isCartIntent(message) {
  return detectCartIntent(message) !== null;
}

/**
 * Send cart options menu
 */
async function sendCartOptionsMenu(customer, phone) {
  const hasItems = customer.cart && customer.cart.length > 0;
  
  const buttons = hasItems
    ? [
        { id: 'view_cart', text: '🛒 View Cart' },
        { id: 'checkout', text: '✅ Checkout' },
        { id: 'clear_cart', text: '🗑️ Clear Cart' }
      ]
    : [
        { id: 'view_menu', text: '📋 Browse Menu' },
        { id: 'home', text: '🏠 Main Menu' }
      ];
  
  await whatsapp.sendButtons(phone, 'Cart Options:', buttons);
  
  conversationState.transitionTo(customer, 'cart_options');
  await customer.save();
}

module.exports = {
  // Core cart operations
  addToCart,
  viewCart,
  removeFromCart,
  clearCart,
  updateQuantity,
  
  // Cart utilities
  checkCartAvailability,
  getCartTotal,
  getCartItemCount,
  formatCart,
  
  // Intent detection
  detectCartIntent,
  isSimpleCartKeyword,
  isCartIntent,
  
  // UI helpers
  handleCartAction,
  sendCartOptionsMenu
};
