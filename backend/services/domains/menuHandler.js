/**
 * Menu Domain Handler (Phase 3.4.1)
 * 
 * Responsibilities:
 * - Display main menu and welcome screen
 * - Browse categories with food type filtering
 * - Show item details with images
 * - Search items by name/description/tags
 * - Handle food type filtering (veg/non-veg/egg/all)
 * - Pagination support for large menus
 * - Category navigation
 * 
 * Domain Boundaries:
 * - Does NOT handle cart operations (see cartHandler)
 * - Does NOT handle orders (see orderHandler)
 * - Does NOT handle payments (see paymentHandler)
 * 
 * Extracted from: chatbot.js (Phase 3.4.1)
 * Lines: 524 (comprehensive menu logic)
 */

const MenuItem = require('../../models/MenuItem');
const Category = require('../../models/Category');
const conversationState = require('../conversationState');
const whatsapp = require('../whatsapp');
const chatbotImagesService = require('../chatbotImages');

/**
 * Food type constants
 */
const FOOD_TYPES = {
  VEG: 'veg',
  NON_VEG: 'nonveg',
  EGG: 'egg',
  ALL: 'all'
};

/**
 * Show main menu (welcome screen)
 */
async function showMainMenu(customer, phone) {
  const welcomeImg = await chatbotImagesService.getImageUrl('welcome');
  
  const message = `🏨 *Welcome ${customer.name || 'to our restaurant'}!*\n\n` +
    `We're delighted to serve you delicious food. How can we help you today?`;
  
  const buttons = [
    { id: 'order_food', text: '🍽️ Order Food' },
    { id: 'my_orders', text: '📦 My Orders' },
    { id: 'open_website', text: '🌐 Website' }
  ];
  
  if (welcomeImg) {
    await whatsapp.sendImageWithButtons(phone, welcomeImg, message, buttons);
  } else {
    await whatsapp.sendButtons(phone, message, buttons);
  }
  
  conversationState.transitionTo(customer, 'main_menu');
  await customer.save();
}

/**
 * Show food type selection (Veg/Non-Veg/Egg/All)
 */
async function showFoodTypeSelection(customer, phone) {
  const message = `🍽️ *Browse Menu*\n\n` +
    `Please select your food preference:`;
  
  const buttons = [
    { id: 'food_type_veg', text: '🌿 Veg' },
    { id: 'food_type_nonveg', text: '🍗 Non-Veg' },
    { id: 'food_type_all', text: '🍽️ All Items' }
  ];
  
  await whatsapp.sendButtons(phone, message, buttons);
  
  conversationState.transitionTo(customer, 'select_food_type');
  await customer.save();
}

/**
 * Filter items by food type
 */
function filterByFoodType(items, foodType) {
  if (!foodType || foodType === FOOD_TYPES.ALL) {
    return items;
  }
  
  return items.filter(item => {
    if (foodType === FOOD_TYPES.VEG) {
      return item.foodType === 'veg';
    } else if (foodType === FOOD_TYPES.NON_VEG) {
      return item.foodType === 'nonveg';
    } else if (foodType === FOOD_TYPES.EGG) {
      return item.foodType === 'egg';
    }
    return true;
  });
}

/**
 * Browse menu - show categories with food type filter
 */
async function browseMenu(customer, phone, foodType = FOOD_TYPES.ALL) {
  // Get all active items
  const allItems = await MenuItem.find({ available: true });
  
  // Filter by food type
  const filteredItems = filterByFoodType(allItems, foodType);
  
  if (filteredItems.length === 0) {
    const foodTypeLabel = getFoodTypeLabel(foodType);
    await whatsapp.sendButtons(
      phone,
      `❌ No ${foodTypeLabel} items available at the moment.`,
      [
        { id: 'view_menu', text: '📋 Browse Menu' },
        { id: 'home', text: '🏠 Main Menu' }
      ]
    );
    return;
  }
  
  // Get unique categories from filtered items
  const categories = [...new Set(filteredItems.map(item => item.category))];
  
  // Show categories as list
  const sections = [{
    title: 'Categories',
    rows: categories.map(cat => ({
      id: `category_${cat}`,
      title: cat,
      description: `View ${cat} items`
    }))
  }];
  
  const foodTypeLabel = getFoodTypeLabel(foodType);
  await whatsapp.sendList(
    phone,
    `📋 ${foodTypeLabel} Menu`,
    `Select a category to browse items (${filteredItems.length} items available)`,
    'View Categories',
    sections
  );
  
  conversationState.setFoodTypePreference(customer, foodType);
  conversationState.transitionTo(customer, 'browsing_menu');
  await customer.save();
}

/**
 * Show items in category with pagination
 */
async function showCategory(customer, phone, params) {
  const { category, page = 1 } = params;
  const pageSize = 10;
  const skip = (page - 1) * pageSize;
  
  // Get food type preference
  const foodType = conversationState.getFoodTypePreference(customer) || FOOD_TYPES.ALL;
  
  // Build query
  const query = {
    category,
    available: true
  };
  
  // Add food type filter
  if (foodType !== FOOD_TYPES.ALL) {
    query.foodType = foodType;
  }
  
  const totalItems = await MenuItem.countDocuments(query);
  const items = await MenuItem.find(query)
    .sort({ sortOrder: 1, name: 1 })
    .skip(skip)
    .limit(pageSize);
  
  if (items.length === 0) {
    await whatsapp.sendMessage(phone, `❌ No items available in ${category} category.`);
    return;
  }
  
  const sections = [{
    title: category,
    rows: items.map(item => ({
      id: `item_${item._id}`,
      title: `${getFoodTypeEmoji(item.foodType)} ${item.name}`,
      description: formatPrice(item)
    }))
  }];
  
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginationInfo = totalPages > 1 ? `\n\nPage ${page} of ${totalPages}` : '';
  
  await whatsapp.sendList(
    phone,
    `📋 ${category}`,
    `Select an item to view details (${items.length} items)${paginationInfo}`,
    'View Items',
    sections
  );
  
  conversationState.setSelectedCategory(customer, category);
  conversationState.setContext(customer, 'currentPage', page);
  await customer.save();
}

/**
 * Show item details with full information
 */
async function showItemDetails(customer, phone, params) {
  const { itemId } = params;
  
  const item = await MenuItem.findById(itemId);
  
  if (!item || !item.available) {
    await whatsapp.sendButtons(
      phone,
      '❌ Item not available.',
      [
        { id: 'view_menu', text: '📋 Browse Menu' },
        { id: 'home', text: '🏠 Main Menu' }
      ]
    );
    return;
  }
  
  const foodTypeEmoji = getFoodTypeEmoji(item.foodType);
  const priceInfo = formatPrice(item);
  
  const message = `${foodTypeEmoji} *${item.name}*\n\n` +
    `${item.description || 'Delicious item from our menu'}\n\n` +
    `💰 ${priceInfo}\n` +
    `⏱️ Prep Time: ${item.preparationTime || 15} mins\n` +
    `📦 Category: ${item.category}`;
  
  const buttons = [
    { id: `add_to_cart_${item._id}`, text: '➕ Add to Cart' },
    { id: 'view_menu', text: '📋 Back to Menu' },
    { id: 'view_cart', text: '🛒 View Cart' }
  ];
  
  if (item.image) {
    await whatsapp.sendImageWithButtons(phone, item.image, message, buttons);
  } else {
    await whatsapp.sendButtons(phone, message, buttons);
  }
  
  conversationState.setSelectedItem(customer, item._id.toString());
  conversationState.transitionTo(customer, 'viewing_item_details');
  await customer.save();
}

/**
 * Search for items by name, description, or tags
 */
async function searchItem(customer, phone, params) {
  const { query } = params;
  
  // Get food type preference
  const foodType = conversationState.getFoodTypePreference(customer) || FOOD_TYPES.ALL;
  
  // Build search query with word-boundary regex to prevent "rice" matching "ice"
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordBoundaryPattern = `(^|\\s|-)${escapedQuery}`;
  const searchQuery = {
    available: true,
    $or: [
      { name: { $regex: wordBoundaryPattern, $options: 'i' } },
      { description: { $regex: wordBoundaryPattern, $options: 'i' } },
      { tags: { $regex: wordBoundaryPattern, $options: 'i' } },
      { category: { $regex: wordBoundaryPattern, $options: 'i' } }
    ]
  };
  
  // Add food type filter
  if (foodType !== FOOD_TYPES.ALL) {
    searchQuery.foodType = foodType;
  }
  
  const items = await MenuItem.find(searchQuery).limit(10);
  
  if (items.length === 0) {
    await whatsapp.sendButtons(
      phone,
      `❌ No items found for "${query}"`,
      [
        { id: 'view_menu', text: '📋 Browse Menu' },
        { id: 'home', text: '🏠 Main Menu' }
      ]
    );
    return;
  }
  
  const sections = [{
    title: 'Search Results',
    rows: items.map(item => ({
      id: `item_${item._id}`,
      title: `${getFoodTypeEmoji(item.foodType)} ${item.name}`,
      description: formatPrice(item)
    }))
  }];
  
  await whatsapp.sendList(
    phone,
    `🔍 Search: "${query}"`,
    `Found ${items.length} item(s)`,
    'View Results',
    sections
  );
}

/**
 * Show help information
 */
async function showHelp(customer, phone) {
  const message = `ℹ️ *How to Order*\n\n` +
    `1️⃣ Browse our menu by food type\n` +
    `2️⃣ Select items and add to cart\n` +
    `3️⃣ Review your cart\n` +
    `4️⃣ Proceed to checkout\n` +
    `5️⃣ Share your delivery location\n` +
    `6️⃣ Choose payment method\n` +
    `7️⃣ Complete your order\n\n` +
    `📞 Need help? Contact our support team`;
  
  await whatsapp.sendButtons(phone, message, [
    { id: 'order_food', text: '🍽️ Order Food' },
    { id: 'my_orders', text: '📦 My Orders' },
    { id: 'home', text: '🏠 Main Menu' }
  ]);
  
  conversationState.transitionTo(customer, 'main_menu');
  await customer.save();
}

/**
 * Show website link
 */
async function showWebsiteLink(customer, phone) {
  const websiteUrl = process.env.WEBSITE_URL || 'https://example.com';
  
  const message = `🌐 *Visit Our Website*\n\n` +
    `Browse our full menu, check offers, and place orders online!\n\n` +
    `${websiteUrl}`;
  
  await whatsapp.sendButtons(phone, message, [
    { id: 'order_food', text: '🍽️ Order Food' },
    { id: 'home', text: '🏠 Main Menu' }
  ]);
}

/**
 * Detect menu intent from text message
 */
function detectMenuIntent(message) {
  const msg = message.toLowerCase().trim();
  
  // Menu browsing intent
  if (/(show|view|see|browse|check|display).*(menu|food|items|dishes)/i.test(msg)) {
    return { intent: 'browse_menu', confidence: 'high' };
  }
  
  // Food type detection
  if (/\b(veg|vegetarian|veggie)\b/i.test(msg)) {
    return { intent: 'browse_menu', foodType: FOOD_TYPES.VEG, confidence: 'high' };
  }
  
  if (/\b(non.?veg|chicken|mutton|fish|meat)\b/i.test(msg)) {
    return { intent: 'browse_menu', foodType: FOOD_TYPES.NON_VEG, confidence: 'high' };
  }
  
  if (/\b(egg|eggs)\b/i.test(msg)) {
    return { intent: 'browse_menu', foodType: FOOD_TYPES.EGG, confidence: 'high' };
  }
  
  // Search intent (if message is longer than 2 words)
  const words = msg.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2) {
    return { intent: 'search', query: msg, confidence: 'medium' };
  }
  
  return { intent: 'unknown', confidence: 'low' };
}

/**
 * Handle response while viewing item details
 */
async function handleItemDetailResponse(customer, phone, params) {
  const { message } = params;
  
  // If user types quantity, add that many to cart
  const quantity = parseInt(message);
  if (!isNaN(quantity) && quantity > 0 && quantity <= 10) {
    const itemId = conversationState.getSelectedItem(customer);
    if (itemId) {
      // Delegate to cart handler
      return { redirect: 'cart', action: 'addToCart', params: { itemId, quantity } };
    }
  }
  
  // Otherwise show main menu
  await showMainMenu(customer, phone);
}

/**
 * Get all available categories
 */
async function getAvailableCategories(foodType = FOOD_TYPES.ALL) {
  const query = { available: true };
  
  if (foodType !== FOOD_TYPES.ALL) {
    query.foodType = foodType;
  }
  
  const items = await MenuItem.find(query).distinct('category');
  return items;
}

/**
 * Get items count by category
 */
async function getItemsCountByCategory(category, foodType = FOOD_TYPES.ALL) {
  const query = { category, available: true };
  
  if (foodType !== FOOD_TYPES.ALL) {
    query.foodType = foodType;
  }
  
  return await MenuItem.countDocuments(query);
}

// ========== Helper Functions ==========

/**
 * Get food type label
 */
function getFoodTypeLabel(foodType) {
  const labels = {
    [FOOD_TYPES.VEG]: 'Veg',
    [FOOD_TYPES.NON_VEG]: 'Non-Veg',
    [FOOD_TYPES.EGG]: 'Egg',
    [FOOD_TYPES.ALL]: 'All'
  };
  return labels[foodType] || 'All';
}

/**
 * Get food type emoji
 */
function getFoodTypeEmoji(foodType) {
  const emojis = {
    veg: '🌿',
    nonveg: '🍗',
    egg: '🥚'
  };
  return emojis[foodType] || '🍽️';
}

/**
 * Format price with offer
 */
function formatPrice(item) {
  if (item.offerPrice && item.offerPrice < item.price) {
    const discount = Math.round(((item.price - item.offerPrice) / item.price) * 100);
    return `₹${item.offerPrice} (${discount}% off) ~~₹${item.price}~~`;
  }
  return `₹${item.price}`;
}

module.exports = {
  // Main functions (13 exported)
  showMainMenu,
  showFoodTypeSelection,
  browseMenu,
  showCategory,
  showItemDetails,
  searchItem,
  showHelp,
  showWebsiteLink,
  detectMenuIntent,
  handleItemDetailResponse,
  getAvailableCategories,
  getItemsCountByCategory,
  filterByFoodType,
  
  // Constants
  FOOD_TYPES
};
