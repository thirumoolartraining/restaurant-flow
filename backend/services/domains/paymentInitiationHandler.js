/**
 * Payment Initiation Domain Handler - Phase 3.4.5
 * 
 * Responsibilities:
 * - Show payment method options (UPI/COD/Pay at Hotel)
 * - Initiate UPI/online payment with Razorpay
 * - Process COD (Cash on Delivery) orders
 * - Process pickup orders with payment at hotel
 * - Create orders with pending payment status
 * - Generate payment links
 * 
 * Domain Boundaries:
 * - Does NOT handle payment verification (Payment Completion Domain)
 * - Does NOT handle cart management (Cart Domain)
 * - Does NOT handle location (Location Domain)
 * - DOES create orders (this is the order creation domain)
 * - Uses conversationState service for state management
 */

const Order = require('../../models/Order');
const Customer = require('../../models/Customer');
const DashboardStats = require('../../models/DashboardStats');
const User = require('../../models/User');
const conversationState = require('../conversationState');
const whatsapp = require('../whatsapp');
const razorpayService = require('../razorpay');
const googleSheets = require('../googleSheets');
const pushNotification = require('../pushNotification');
const whatsappBroadcast = require('../whatsappBroadcast');
const chatbotImagesService = require('../chatbotImages');
const { logger } = require('../correlationContext');
const dataEvents = require('../eventEmitter');

// Payment method constants
const PAYMENT_METHODS = {
  UPI: 'upi',
  COD: 'cod',
  ONLINE: 'online'
};

// Service type constants
const SERVICE_TYPES = {
  DELIVERY: 'delivery',
  PICKUP: 'pickup'
};

/**
 * Generate order ID
 */
function generateOrderId(serviceType = 'delivery') {
  const prefix = serviceType === 'pickup' ? 'PKP' : 'DLV';
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}${timestamp}${random}`;
}

/**
 * Calculate delivery charge
 */
async function calculateDeliveryCharge(latitude, longitude) {
  try {
    const Settings = require('../../models/Settings');
    const restaurantLocation = await Settings.getValue('restaurantLocation');
    const deliverySettings = await Settings.getValue('deliverySettings');
    
    if (!restaurantLocation?.latitude || !restaurantLocation?.longitude) {
      return { charge: 0, distance: null };
    }
    
    if (!deliverySettings) {
      return { charge: 0, distance: null };
    }
    
    // Calculate straight-line distance (Haversine)
    const R = 6371; // Earth's radius in km
    const dLat = (latitude - restaurantLocation.latitude) * Math.PI / 180;
    const dLon = (longitude - restaurantLocation.longitude) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(restaurantLocation.latitude * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    const freeRadius = deliverySettings.freeDeliveryRadius || 5;
    const extraCharge = deliverySettings.extraDeliveryCharge || 0;
    const baseCharge = deliverySettings.baseDeliveryCharge || 0;
    const noFreeDelivery = deliverySettings.noFreeDelivery || false;
    
    if (noFreeDelivery) {
      return { charge: baseCharge, distance: Math.round(distance * 100) / 100 };
    }
    
    if (distance <= freeRadius) {
      return { charge: 0, distance: Math.round(distance * 100) / 100 };
    }
    
    return { charge: extraCharge, distance: Math.round(distance * 100) / 100 };
  } catch (error) {
    logger.error('Failed to calculate delivery charge', { error: error.message });
    return { charge: 0, distance: null };
  }
}

/**
 * Calculate offer discount for an item
 */
function calculateOfferDiscount(menuItem, activeOffers) {
  if (!activeOffers || activeOffers.length === 0) {
    return { discountedPrice: null, discountAmount: 0, appliedOffer: null };
  }
  
  for (const offer of activeOffers) {
    // Check if offer applies to this item
    if (offer.applicableItems && offer.applicableItems.length > 0) {
      const itemIdStr = menuItem._id.toString();
      const isApplicable = offer.applicableItems.some(
        id => id.toString() === itemIdStr
      );
      
      if (isApplicable && offer.discountPercentage) {
        const discountAmount = (menuItem.price * offer.discountPercentage) / 100;
        const discountedPrice = menuItem.price - discountAmount;
        return { discountedPrice, discountAmount, appliedOffer: offer };
      }
    }
  }
  
  return { discountedPrice: null, discountAmount: 0, appliedOffer: null };
}

/**
 * Show payment method options
 */
async function showPaymentOptions(customer, phone, params = {}) {
  const { serviceType = 'delivery' } = params;
  
  if (!customer.cart || customer.cart.length === 0) {
    await whatsapp.sendMessage(phone, '🛒 Your cart is empty. Add items first!');
    return;
  }
  
  // Populate cart items
  await customer.populate('cart.menuItem');
  
  // Calculate cart total
  let itemsTotal = 0;
  customer.cart.forEach(cartItem => {
    const item = cartItem.menuItem;
    if (item) {
      const effectivePrice = item.offerPrice || item.price;
      itemsTotal += effectivePrice * cartItem.quantity;
    }
  });
  
  // Calculate delivery charge if delivery
  let deliveryCharge = 0;
  if (serviceType === 'delivery' && customer.deliveryAddress?.latitude && customer.deliveryAddress?.longitude) {
    const deliveryResult = await calculateDeliveryCharge(
      customer.deliveryAddress.latitude,
      customer.deliveryAddress.longitude
    );
    deliveryCharge = deliveryResult.charge || 0;
  }
  
  const total = itemsTotal + deliveryCharge;
  
  // Build message
  let message = '💳 *Select Payment Method*\n\n';
  message += `Items Total: ₹${itemsTotal}\n`;
  if (deliveryCharge > 0) {
    message += `Delivery Charge: ₹${deliveryCharge}\n`;
  }
  message += `*Grand Total: ₹${total}*\n\n`;
  message += 'Choose your preferred payment method:';
  
  const buttons = serviceType === 'pickup'
    ? [
        { id: 'pickup_pay_hotel', text: '💵 Pay at Hotel' },
        { id: 'pickup_pay_upi', text: '💳 UPI/App' }
      ]
    : [
        { id: 'pay_upi', text: '💳 UPI/APP' },
        { id: 'pay_cod', text: '💵 COD' },
        { id: 'clear_cart', text: '🗑️ Cancel' }
      ];
  
  const orderSummaryImageUrl = await chatbotImagesService.getImageUrl('order_summary');
  
  if (orderSummaryImageUrl) {
    await whatsapp.sendImage(phone, orderSummaryImageUrl, message, buttons);
  } else {
    await whatsapp.sendButtons(phone, message, buttons);
  }
  
  conversationState.transitionTo(customer, 'select_payment_method');
  conversationState.setContext(customer, 'serviceType', serviceType);
  await customer.save();
  
  logger.info('Payment options shown', {
    customerId: customer._id,
    serviceType,
    total
  });
}

/**
 * Initiate UPI/online payment
 */
async function initiateOnlinePayment(customer, phone, params = {}) {
  const { serviceType = 'delivery' } = params;
  
  // Refresh customer from database
  const freshCustomer = await Customer.findOne({ phone: customer.phone }).populate('cart.menuItem');
  
  if (!freshCustomer?.cart?.length) {
    await whatsapp.sendMessage(phone, '🛒 Your cart is empty!');
    return { success: false };
  }
  
  const orderId = generateOrderId(serviceType);
  let itemsTotal = 0;
  let totalDiscount = 0;
  let appliedOfferIds = new Set();
  
  // Get customer's active offers
  const activeOffers = freshCustomer.activeOffers || [];
  
  const items = freshCustomer.cart.filter(item => item.menuItem).map(item => {
    let effectivePrice = item.menuItem.offerPrice || item.menuItem.price;
    let itemDiscount = 0;
    let appliedOfferId = null;
    
    // Check customer's activeOffers for applicable discount
    if (!item.menuItem.offerPrice && activeOffers.length > 0) {
      const offerResult = calculateOfferDiscount(item.menuItem, activeOffers);
      if (offerResult.discountedPrice !== null) {
        effectivePrice = offerResult.discountedPrice;
        itemDiscount = offerResult.discountAmount * item.quantity;
        if (offerResult.appliedOffer?.offerId) {
          appliedOfferId = offerResult.appliedOffer.offerId;
          appliedOfferIds.add(offerResult.appliedOffer.offerId.toString());
        }
      }
    }
    
    const subtotal = effectivePrice * item.quantity;
    itemsTotal += subtotal;
    totalDiscount += itemDiscount;
    
    return {
      menuItem: item.menuItem._id,
      name: item.menuItem.name,
      quantity: item.quantity,
      price: effectivePrice,
      originalPrice: item.menuItem.price,
      unit: item.menuItem.unit || 'piece',
      unitQty: item.menuItem.quantity || 1,
      image: item.menuItem.image,
      appliedOfferId
    };
  });
  
  if (!items.length) {
    await whatsapp.sendMessage(phone, '🛒 Your cart is empty!');
    return { success: false };
  }
  
  // Calculate delivery charge
  let deliveryCharge = 0;
  let deliveryDistance = null;
  if (serviceType === 'delivery' && freshCustomer.deliveryAddress?.latitude && freshCustomer.deliveryAddress?.longitude) {
    const deliveryResult = await calculateDeliveryCharge(
      freshCustomer.deliveryAddress.latitude,
      freshCustomer.deliveryAddress.longitude
    );
    deliveryCharge = deliveryResult.charge || 0;
    deliveryDistance = deliveryResult.distance;
  }
  
  const total = itemsTotal + deliveryCharge;
  
  // Create order
  const order = new Order({
    orderId,
    customer: {
      phone: freshCustomer.phone,
      name: freshCustomer.name || 'Customer',
      email: freshCustomer.email
    },
    items,
    itemsTotal,
    deliveryCharge,
    deliveryDistance,
    totalAmount: total,
    discountAmount: totalDiscount,
    appliedOfferIds: Array.from(appliedOfferIds),
    serviceType,
    deliveryAddress: freshCustomer.deliveryAddress ? {
      address: freshCustomer.deliveryAddress.address,
      latitude: freshCustomer.deliveryAddress.latitude,
      longitude: freshCustomer.deliveryAddress.longitude
    } : null,
    paymentMethod: PAYMENT_METHODS.UPI,
    status: 'pending',
    paymentStatus: 'pending',
    trackingUpdates: [{ status: 'pending', message: 'Order created, awaiting payment' }]
  });
  
  await order.save();
  
  // Remove applied offers
  if (appliedOfferIds.size > 0) {
    freshCustomer.activeOffers = (freshCustomer.activeOffers || []).filter(
      offer => !appliedOfferIds.has(offer.offerId?.toString())
    );
  }
  
  // Add to broadcast contacts
  await whatsappBroadcast.addContact(freshCustomer.phone, freshCustomer.name, new Date());
  
  // Mark customer as having ordered
  if (!freshCustomer.hasOrdered) {
    freshCustomer.hasOrdered = true;
  }
  
  // Track today's orders
  try {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    await DashboardStats.findOneAndUpdate(
      {},
      { 
        $inc: { todayOrders: 1 },
        $set: { todayDate: todayStr, lastUpdated: new Date() }
      },
      { upsert: true }
    );
  } catch (statsErr) {
    logger.error('Error tracking today orders', { error: statsErr.message });
  }
  
  // Emit events
  dataEvents.emit('orders');
  dataEvents.emit('dashboard');
  
  // Sync to Google Sheets
  googleSheets.addOrder(order).catch(err => logger.error('Google Sheets sync error', { error: err.message }));
  googleSheets.syncTodayDailyReport().catch(err => logger.error('Daily report sync error', { error: err.message }));
  
  // Update dashboard stats in real-time
  googleSheets.incrementDashboardStat('Today Orders', 1).catch(err => logger.error('Dashboard stat error', { error: err.message }));
  googleSheets.incrementDashboardStat('Today Revenue', total).catch(err => logger.error('Dashboard stat error', { error: err.message }));
  googleSheets.incrementDashboardStat('Total Orders', 1).catch(err => logger.error('Dashboard stat error', { error: err.message }));
  googleSheets.incrementDashboardStat('Total Revenue', total).catch(err => logger.error('Dashboard stat error', { error: err.message }));
  
  // Send push notification to admin
  try {
    const admins = await User.find({ pushToken: { $ne: null } });
    for (const admin of admins) {
      if (admin.pushToken) {
        await pushNotification.sendAdminNewOrderNotification(admin.pushToken, {
          orderId,
          totalAmount: total,
          customerName: freshCustomer.name || 'Customer',
          items
        });
      }
    }
    if (admins.length > 0) {
      logger.info('Admin push sent for UPI order', { orderId });
    }
  } catch (pushErr) {
    logger.error('Admin push error', { error: pushErr.message });
  }
  
  // Clear cart
  freshCustomer.cart = [];
  freshCustomer.orderHistory = freshCustomer.orderHistory || [];
  freshCustomer.orderHistory.push(order._id);
  await freshCustomer.save();
  
  // Update original customer object
  customer.cart = [];
  customer.orderHistory = freshCustomer.orderHistory;
  
  // Store pending order ID
  conversationState.setContext(customer, 'pendingOrderId', orderId);
  await customer.save();
  
  // Generate payment page URL
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://restarunt-bot.vercel.app';
    const paymentPageUrl = `${frontendUrl}/pay/${orderId}`;
    
    const orderDetailsImageUrl = await chatbotImagesService.getImageUrl('order_details');
    await whatsapp.sendOrder(phone, order, items, paymentPageUrl, orderDetailsImageUrl);
    
    conversationState.transitionTo(customer, 'awaiting_payment');
    await customer.save();
    
    logger.info('Online payment initiated', {
      customerId: customer._id,
      orderId,
      total
    });
    
    return { success: true, orderId };
  } catch (err) {
    logger.error('Payment page error', { error: err.message });
    await whatsapp.sendButtons(phone,
      `✅ *Order Created!*\n\nOrder ID: ${orderId}\nTotal: ₹${total}\n\n⚠️ Payment link unavailable.\nPlease contact us.`,
      [
        { id: 'order_status', text: 'Check Status' },
        { id: 'home', text: 'Main Menu' }
      ]
    );
    return { success: true, orderId };
  }
}

/**
 * Process COD (Cash on Delivery) order
 */
async function processCODOrder(customer, phone, params = {}) {
  const { serviceType = 'delivery' } = params;
  
  // Refresh customer from database
  const freshCustomer = await Customer.findOne({ phone: customer.phone }).populate('cart.menuItem');
  
  if (!freshCustomer?.cart?.length) {
    await whatsapp.sendMessage(phone, '🛒 Your cart is empty!');
    return { success: false };
  }
  
  const orderId = generateOrderId(serviceType);
  let itemsTotal = 0;
  let totalDiscount = 0;
  let appliedOfferIds = new Set();
  
  // Get customer's active offers
  const activeOffers = freshCustomer.activeOffers || [];
  
  const items = freshCustomer.cart.filter(item => item.menuItem).map(item => {
    let effectivePrice = item.menuItem.offerPrice || item.menuItem.price;
    let itemDiscount = 0;
    let appliedOfferId = null;
    
    // If no offerPrice, check customer's activeOffers for applicable discount
    if (!item.menuItem.offerPrice && activeOffers.length > 0) {
      const offerResult = calculateOfferDiscount(item.menuItem, activeOffers);
      if (offerResult.discountedPrice !== null) {
        effectivePrice = offerResult.discountedPrice;
        itemDiscount = offerResult.discountAmount * item.quantity;
        if (offerResult.appliedOffer?.offerId) {
          appliedOfferId = offerResult.appliedOffer.offerId;
          appliedOfferIds.add(offerResult.appliedOffer.offerId.toString());
        }
      }
    }
    
    const subtotal = effectivePrice * item.quantity;
    itemsTotal += subtotal;
    totalDiscount += itemDiscount;
    
    return {
      menuItem: item.menuItem._id,
      name: item.menuItem.name,
      quantity: item.quantity,
      price: effectivePrice,
      originalPrice: item.menuItem.price,
      unit: item.menuItem.unit || 'piece',
      unitQty: item.menuItem.quantity || 1,
      image: item.menuItem.image,
      appliedOfferId
    };
  });
  
  if (!items.length) {
    await whatsapp.sendMessage(phone, '🛒 Your cart is empty!');
    return { success: false };
  }
  
  // Calculate delivery charge
  let deliveryCharge = 0;
  let deliveryDistance = null;
  if (serviceType === 'delivery' && freshCustomer.deliveryAddress?.latitude && freshCustomer.deliveryAddress?.longitude) {
    const deliveryResult = await calculateDeliveryCharge(
      freshCustomer.deliveryAddress.latitude,
      freshCustomer.deliveryAddress.longitude
    );
    deliveryCharge = deliveryResult.charge || 0;
    deliveryDistance = deliveryResult.distance;
  }
  
  const total = itemsTotal + deliveryCharge;
  
  // Create order
  const order = new Order({
    orderId,
    customer: {
      phone: freshCustomer.phone,
      name: freshCustomer.name || 'Customer',
      email: freshCustomer.email
    },
    items,
    itemsTotal,
    deliveryCharge,
    deliveryDistance,
    totalAmount: total,
    discountAmount: totalDiscount,
    appliedOfferIds: Array.from(appliedOfferIds),
    serviceType,
    deliveryAddress: freshCustomer.deliveryAddress ? {
      address: freshCustomer.deliveryAddress.address,
      latitude: freshCustomer.deliveryAddress.latitude,
      longitude: freshCustomer.deliveryAddress.longitude
    } : null,
    paymentMethod: PAYMENT_METHODS.COD,
    status: 'confirmed',
    paymentStatus: 'pending',
    trackingUpdates: [{ status: 'confirmed', message: 'Order confirmed - Cash on Delivery' }]
  });
  
  await order.save();
  
  // Remove applied offers from customer's activeOffers (one-time use)
  if (appliedOfferIds.size > 0) {
    freshCustomer.activeOffers = (freshCustomer.activeOffers || []).filter(
      offer => !appliedOfferIds.has(offer.offerId?.toString())
    );
  }
  
  // Add to broadcast contacts
  await whatsappBroadcast.addContact(freshCustomer.phone, freshCustomer.name, new Date());
  
  // Mark customer as having ordered
  if (!freshCustomer.hasOrdered) {
    freshCustomer.hasOrdered = true;
  }
  
  // Track today's orders
  try {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    await DashboardStats.findOneAndUpdate(
      {},
      { 
        $inc: { todayOrders: 1 },
        $set: { todayDate: todayStr, lastUpdated: new Date() }
      },
      { upsert: true }
    );
  } catch (statsErr) {
    logger.error('Error tracking today orders', { error: statsErr.message });
  }
  
  // Emit events
  dataEvents.emit('orders');
  dataEvents.emit('dashboard');
  
  // Sync to Google Sheets
  googleSheets.addOrder(order).catch(err => logger.error('Google Sheets sync error', { error: err.message }));
  googleSheets.syncTodayDailyReport().catch(err => logger.error('Daily report sync error', { error: err.message }));
  
  // Update dashboard stats in real-time
  googleSheets.incrementDashboardStat('Today Orders', 1).catch(err => logger.error('Dashboard stat error', { error: err.message }));
  googleSheets.incrementDashboardStat('Today Revenue', total).catch(err => logger.error('Dashboard stat error', { error: err.message }));
  googleSheets.incrementDashboardStat('Total Orders', 1).catch(err => logger.error('Dashboard stat error', { error: err.message }));
  googleSheets.incrementDashboardStat('Total Revenue', total).catch(err => logger.error('Dashboard stat error', { error: err.message }));
  
  // Send push notification to admin
  try {
    const admins = await User.find({ pushToken: { $ne: null } });
    for (const admin of admins) {
      if (admin.pushToken) {
        await pushNotification.sendAdminNewOrderNotification(admin.pushToken, {
          orderId,
          totalAmount: total,
          customerName: freshCustomer.name || 'Customer',
          items
        });
      }
    }
    if (admins.length > 0) {
      logger.info('Admin push sent for COD order', { orderId });
    }
  } catch (pushErr) {
    logger.error('Admin push error', { error: pushErr.message });
  }
  
  // Clear cart
  freshCustomer.cart = [];
  freshCustomer.orderHistory = freshCustomer.orderHistory || [];
  freshCustomer.orderHistory.push(order._id);
  await freshCustomer.save();
  
  // Update original customer object
  customer.cart = [];
  customer.orderHistory = freshCustomer.orderHistory;
  
  // Store pending order ID
  conversationState.setContext(customer, 'pendingOrderId', orderId);
  await customer.save();
  
  // Send confirmation
  let confirmMsg = `✅ *Order Confirmed!*\n\n`;
  confirmMsg += `📦 Order ID: *${orderId}*\n`;
  confirmMsg += `💵 Payment: *Cash on Delivery*\n\n`;
  confirmMsg += `━━━━━━━━━━━━━━━\n`;
  confirmMsg += `*Items:*\n`;
  items.forEach((item, i) => {
    confirmMsg += `${i + 1}. ${item.name} (${item.unitQty} ${item.unit}) x${item.quantity} - ₹${item.price * item.quantity}\n`;
  });
  confirmMsg += `━━━━━━━━━━━━━━━\n`;
  confirmMsg += `*Items Total:* ₹${itemsTotal}\n`;
  if (deliveryCharge > 0) {
    confirmMsg += `*Delivery Charge:* ₹${deliveryCharge}\n`;
  }
  confirmMsg += `*Grand Total:* ₹${total}\n\n`;
  confirmMsg += `🙏 Thank you for your order!\nPlease keep ₹${total} ready for payment.`;
  
  const confirmedImageUrl = await chatbotImagesService.getImageUrl('order_confirmed');
  
  if (confirmedImageUrl) {
    await whatsapp.sendImage(phone, confirmedImageUrl, confirmMsg, [
      { id: 'track_order', text: '📍 Track Order' },
      { id: `cancel_${orderId}`, text: '❌ Cancel Order' },
      { id: 'home', text: '🏠 Main Menu' }
    ]);
  } else {
    await whatsapp.sendButtons(phone, confirmMsg, [
      { id: 'track_order', text: '📍 Track Order' },
      { id: `cancel_${orderId}`, text: '❌ Cancel Order' },
      { id: 'home', text: '🏠 Main Menu' }
    ]);
  }
  
  conversationState.transitionTo(customer, 'order_confirmed');
  await customer.save();
  
  logger.info('COD order processed', {
    customerId: customer._id,
    orderId,
    total
  });
  
  return { success: true, orderId };
}

/**
 * Process pickup order with payment at hotel
 */
async function processPickupOrder(customer, phone) {
  return await processCODOrder(customer, phone, { serviceType: SERVICE_TYPES.PICKUP });
}

module.exports = {
  // Core payment initiation
  showPaymentOptions,
  initiateOnlinePayment,
  processCODOrder,
  processPickupOrder,
  
  // Helper functions
  generateOrderId,
  calculateDeliveryCharge,
  calculateOfferDiscount,
  
  // Constants
  PAYMENT_METHODS,
  SERVICE_TYPES
};
