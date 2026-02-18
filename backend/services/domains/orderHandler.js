/**
 * Order Domain Handler - Phase 3.4.3
 * 
 * Responsibilities:
 * - Initiate checkout process
 * - Select service type (delivery/pickup)
 * - Cancel orders with validation
 * - Track orders and show status
 * - View order history
 * - Request refunds
 * - Order status formatting
 * - Intent detection for order operations
 * 
 * Domain Boundaries:
 * - Does NOT handle payment processing (Payment Domain)
 * - Does NOT handle location selection (Location Domain)
 * - Does NOT create orders (Payment Initiation Domain)
 * - Uses conversationState service for state management
 * 
 * NOTE: Order creation happens in paymentInitiation domain
 * This handler only manages order lifecycle
 */

const Order = require('../../models/Order');
const conversationState = require('../conversationState');
const whatsapp = require('../whatsapp');
const { logger } = require('../correlationContext');

// Order intent patterns
const ORDER_INTENTS = {
  MY_ORDERS: /(my|view|show|check).*(order|orders)/i,
  TRACK_ORDER: /(track|status|where).*(order|delivery)/i,
  CANCEL_ORDER: /(cancel|stop).*(order)/i,
  ORDER_HISTORY: /(history|past|previous).*(order)/i,
  REFUND: /(refund|money back|return)/i
};

// Order status mappings
const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

const STATUS_EMOJI = {
  pending: '⏳',
  confirmed: '✅',
  preparing: '👨‍🍳',
  ready: '📦',
  out_for_delivery: '🚚',
  delivered: '✅',
  cancelled: '❌',
  refunded: '💰'
};

/**
 * Initiate checkout process
 */
async function initiateCheckout(customer, phone) {
  if (!customer.cart || customer.cart.length === 0) {
    await whatsapp.sendMessage(phone, '🛒 Your cart is empty. Add items first!');
    return;
  }
  
  const message = `🛍️ *Checkout*\n\n` +
    `How would you like to receive your order?`;
  
  const buttons = [
    { id: 'service_delivery', text: '🚚 Home Delivery' },
    { id: 'service_pickup', text: '🏪 Self Pickup' },
    { id: 'view_cart', text: '🛒 Back to Cart' }
  ];
  
  await whatsapp.sendButtons(phone, message, buttons);
  
  conversationState.transitionTo(customer, 'select_service_type');
  await customer.save();
}

/**
 * Select service type
 */
async function selectServiceType(customer, phone, params) {
  const { serviceType } = params;
  
  conversationState.setServiceType(customer, serviceType);
  await customer.save();
  
  if (serviceType === 'delivery') {
    // Redirect to location handler
    return { redirect: 'location', action: 'requestLocation', params: {} };
  } else {
    // Pickup - go directly to payment
    return { redirect: 'paymentInitiation', action: 'showPaymentOptions', params: {} };
  }
}

/**
 * Cancel order
 */
async function cancelOrder(customer, phone) {
  const pendingOrderId = conversationState.getPendingOrderId(customer);
  
  if (!pendingOrderId) {
    await whatsapp.sendMessage(phone, '❌ No pending order to cancel.');
    return;
  }
  
  const order = await Order.findOne({ orderId: pendingOrderId });
  
  if (!order) {
    await whatsapp.sendMessage(phone, '❌ Order not found.');
    conversationState.clearPendingOrder(customer);
    await customer.save();
    return;
  }
  
  if (order.status !== 'pending' && order.status !== 'confirmed') {
    await whatsapp.sendMessage(phone, 
      `❌ Cannot cancel order. Current status: ${order.status}\n\n` +
      `Please contact support for assistance.`
    );
    return;
  }
  
  order.status = 'cancelled';
  order.cancellationReason = 'Cancelled by customer via WhatsApp';
  await order.save();
  
  // Emit event for real-time updates (SSE)
  const dataEvents = require('../eventEmitter');
  dataEvents.emit('orders');
  dataEvents.emit('dashboard');

  // Send push notification to admin — customer cancelled
  try {
    const User = require('../../models/User');
    const pushNotification = require('../pushNotification');
    
    const admins = await User.find({ pushToken: { $ne: null } });
    for (const admin of admins) {
      if (admin.pushToken) {
        await pushNotification.sendNotification(
          admin.pushToken,
          '❌ Order Cancelled by Customer',
          `Order #${order.orderId} - ₹${order.totalAmount}\n${order.customer?.name || 'Customer'} cancelled via WhatsApp`,
          { type: 'order_cancelled', orderId: order.orderId, screen: 'Orders' },
          'order-updates'
        );
      }
    }
  } catch (pushErr) {
    logger.error('Admin push error (customer cancel)', { error: pushErr.message });
  }

  // Notify assigned delivery partner if order was assigned
  if (order.assignedTo) {
    try {
      const DeliveryBoy = require('../../models/DeliveryBoy');
      const pushNotification = require('../pushNotification');
      
      const deliveryBoy = await DeliveryBoy.findById(order.assignedTo);
      if (deliveryBoy && deliveryBoy.pushToken) {
        await pushNotification.sendOrderCancelledNotification(deliveryBoy.pushToken, {
          orderId: order.orderId,
          totalAmount: order.totalAmount
        });
        logger.info(`Delivery partner ${deliveryBoy.name} notified of cancellation`);
      }
    } catch (pushErr) {
      logger.error('Delivery push error (customer cancel)', { error: pushErr.message });
    }
  }

  await whatsapp.sendMessage(phone, 
    `✅ Order ${order.orderId} has been cancelled.\n\n` +
    `If you paid online, refund will be processed within 5-7 business days.`
  );
  
  conversationState.clearPendingOrder(customer);
  conversationState.clearTransientState(customer);
  await customer.save();
}

/**
 * Track order
 */
async function trackOrder(customer, phone) {
  const pendingOrderId = conversationState.getPendingOrderId(customer);
  
  if (!pendingOrderId) {
    // Find most recent order
    const recentOrder = await Order.findOne({ 
      'customer.phone': customer.phone 
    }).sort({ createdAt: -1 });
    
    if (!recentOrder) {
      await whatsapp.sendMessage(phone, '❌ No orders found.');
      return;
    }
    
    await showOrderStatus(phone, recentOrder);
  } else {
    const order = await Order.findOne({ orderId: pendingOrderId });
    if (order) {
      await showOrderStatus(phone, order);
    } else {
      await whatsapp.sendMessage(phone, '❌ Order not found.');
    }
  }
}

/**
 * Show order status
 */
async function showOrderStatus(phone, order) {
  const emoji = STATUS_EMOJI[order.status] || '📋';
  
  let message = `${emoji} *Order Status*\n\n` +
    `Order ID: ${order.orderId}\n` +
    `Status: ${order.status.toUpperCase()}\n` +
    `Total: ₹${order.totalAmount}\n` +
    `Payment: ${order.paymentStatus}\n\n`;
  
  if (order.estimatedDeliveryTime) {
    message += `⏰ Estimated delivery: ${new Date(order.estimatedDeliveryTime).toLocaleTimeString()}\n\n`;
  }
  
  if (order.trackingUpdates && order.trackingUpdates.length > 0) {
    message += `📍 *Updates:*\n`;
    order.trackingUpdates.slice(-3).forEach(update => {
      message += `• ${update.message}\n`;
    });
  }
  
  const buttons = [
    { id: 'home', text: '🏠 Main Menu' }
  ];
  
  if (order.status === 'pending' || order.status === 'confirmed') {
    buttons.unshift({ id: 'cancel_order', text: '❌ Cancel Order' });
  }
  
  await whatsapp.sendButtons(phone, message, buttons);
}

/**
 * View order history
 */
async function viewOrderHistory(customer, phone, params = {}) {
  const { limit = 5, page = 1 } = params;
  const skip = (page - 1) * limit;
  
  const orders = await Order.find({ 
    'customer.phone': customer.phone 
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
  
  if (orders.length === 0) {
    await whatsapp.sendMessage(phone, '📋 No order history found.\n\nStart ordering to see your history!');
    await whatsapp.sendButtons(phone, 'What would you like to do?', [
      { id: 'view_menu', text: '📋 Browse Menu' },
      { id: 'home', text: '🏠 Main Menu' }
    ]);
    return;
  }
  
  let message = '📋 *Order History*\n\n';
  
  orders.forEach((order, index) => {
    const emoji = STATUS_EMOJI[order.status] || '📋';
    message += `${index + 1}. ${emoji} Order #${order.orderId}\n`;
    message += `   Date: ${new Date(order.createdAt).toLocaleDateString()}\n`;
    message += `   Total: ₹${order.totalAmount}\n`;
    message += `   Status: ${order.status}\n\n`;
  });
  
  const buttons = [
    { id: 'track_order', text: '📍 Track Latest Order' },
    { id: 'view_menu', text: '📋 Order Again' },
    { id: 'home', text: '🏠 Main Menu' }
  ];
  
  await whatsapp.sendButtons(phone, message, buttons);
  
  conversationState.transitionTo(customer, 'order_history');
  await customer.save();
  
  logger.info('Order history viewed', {
    customerId: customer._id,
    orderCount: orders.length,
    page
  });
}

/**
 * Request refund
 */
async function requestRefund(customer, phone, params = {}) {
  const { orderId } = params;
  
  let order;
  
  if (orderId) {
    order = await Order.findOne({ orderId });
  } else {
    // Find most recent delivered/cancelled order
    order = await Order.findOne({
      'customer.phone': customer.phone,
      status: { $in: ['delivered', 'cancelled'] },
      paymentStatus: 'paid'
    }).sort({ createdAt: -1 });
  }
  
  if (!order) {
    await whatsapp.sendMessage(phone, '❌ No eligible orders found for refund.');
    return;
  }
  
  // Check if already refunded
  if (order.refundStatus === 'completed') {
    await whatsapp.sendMessage(phone, 
      `✅ Order ${order.orderId} has already been refunded.\n\n` +
      `Refund amount: ₹${order.refundAmount || order.totalAmount}`
    );
    return;
  }
  
  // Check if refund already requested
  if (order.refundStatus === 'requested' || order.refundStatus === 'processing') {
    await whatsapp.sendMessage(phone,
      `⏳ Refund for order ${order.orderId} is already ${order.refundStatus}.\n\n` +
      `Please wait for admin approval.`
    );
    return;
  }
  
  // Request refund
  order.refundStatus = 'requested';
  order.refundRequestedAt = new Date();
  await order.save();
  
  // Send push notification to admin — refund requested
  try {
    const User = require('../../models/User');
    const pushNotification = require('../pushNotification');
    
    const admins = await User.find({ pushToken: { $ne: null } });
    for (const admin of admins) {
      if (admin.pushToken) {
        await pushNotification.sendNotification(
          admin.pushToken,
          '💰 Refund Requested',
          `Order #${order.orderId} - ₹${order.totalAmount}\nCustomer requested a refund`,
          { type: 'refund_requested', orderId: order.orderId, screen: 'Orders' },
          'order-updates'
        );
      }
    }
  } catch (pushErr) {
    logger.error('Admin push error (refund request)', { error: pushErr.message });
  }

  await whatsapp.sendMessage(phone,
    `✅ Refund requested for order ${order.orderId}\n\n` +
    `Amount: ₹${order.totalAmount}\n` +
    `Status: Under Review\n\n` +
    `Our team will review your request and process the refund within 5-7 business days.`
  );
  
  logger.info('Refund requested', {
    customerId: customer._id,
    orderId: order.orderId,
    amount: order.totalAmount
  });
  
  conversationState.transitionTo(customer, 'main_menu');
  await customer.save();
}

/**
 * Get order by ID
 */
async function getOrderById(orderId) {
  return await Order.findOne({ orderId });
}

/**
 * Get customer orders
 */
async function getCustomerOrders(phone, params = {}) {
  const { limit = 10, status = null } = params;
  
  const query = { 'customer.phone': phone };
  if (status) {
    query.status = status;
  }
  
  return await Order.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);
}

/**
 * Check if order can be cancelled
 */
function canCancelOrder(order) {
  const cancellableStatuses = ['pending', 'confirmed'];
  return cancellableStatuses.includes(order.status);
}

/**
 * Check if order is eligible for refund
 */
function isRefundEligible(order) {
  const eligibleStatuses = ['delivered', 'cancelled'];
  return eligibleStatuses.includes(order.status) && 
         order.paymentStatus === 'paid' &&
         order.refundStatus !== 'completed';
}

/**
 * Format order details
 */
async function formatOrderDetails(order) {
  const emoji = STATUS_EMOJI[order.status] || '📋';
  
  let message = `${emoji} *Order Details*\n\n`;
  message += `Order ID: ${order.orderId}\n`;
  message += `Date: ${new Date(order.createdAt).toLocaleString()}\n`;
  message += `Status: ${order.status.toUpperCase()}\n`;
  message += `Payment: ${order.paymentStatus}\n\n`;
  
  message += `📦 *Items:*\n`;
  order.items.forEach((item, index) => {
    message += `${index + 1}. ${item.name}\n`;
    message += `   Qty: ${item.quantity} × ₹${item.price} = ₹${item.quantity * item.price}\n`;
  });
  
  message += `\n💰 *Total: ₹${order.totalAmount}*\n`;
  
  if (order.serviceType === 'delivery' && order.deliveryAddress) {
    message += `\n📍 *Delivery Address:*\n${order.deliveryAddress.formatted || 'N/A'}\n`;
  } else if (order.serviceType === 'pickup') {
    message += `\n🏪 *Service Type:* Self Pickup\n`;
  }
  
  return message;
}

/**
 * Get order status label
 */
function getOrderStatusLabel(status) {
  const labels = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    preparing: 'Preparing',
    ready: 'Ready for Pickup',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    refunded: 'Refunded'
  };
  
  return labels[status] || status;
}

/**
 * Get order status emoji
 */
function getOrderStatusEmoji(status) {
  return STATUS_EMOJI[status] || '📋';
}

/**
 * Detect order intent from message
 */
function detectOrderIntent(message) {
  if (ORDER_INTENTS.MY_ORDERS.test(message)) {
    return 'my_orders';
  }
  
  if (ORDER_INTENTS.TRACK_ORDER.test(message)) {
    return 'track_order';
  }
  
  if (ORDER_INTENTS.CANCEL_ORDER.test(message)) {
    return 'cancel_order';
  }
  
  if (ORDER_INTENTS.ORDER_HISTORY.test(message)) {
    return 'order_history';
  }
  
  if (ORDER_INTENTS.REFUND.test(message)) {
    return 'refund';
  }
  
  return null;
}

/**
 * Check if message is an order intent
 */
function isOrderIntent(message) {
  return detectOrderIntent(message) !== null;
}

/**
 * Send my orders menu
 */
async function sendMyOrdersMenu(customer, phone) {
  const recentOrder = await Order.findOne({
    'customer.phone': customer.phone
  }).sort({ createdAt: -1 });
  
  const message = recentOrder
    ? `📋 *My Orders*\n\nYou have ${recentOrder ? 'orders' : 'no orders'} in your history.`
    : `📋 *My Orders*\n\nYou haven't placed any orders yet.`;
  
  const buttons = recentOrder
    ? [
        { id: 'track_order', text: '📍 Track Order' },
        { id: 'order_history', text: '📋 Order History' },
        { id: 'cancel_order', text: '❌ Cancel Order' }
      ]
    : [
        { id: 'view_menu', text: '📋 Browse Menu' },
        { id: 'home', text: '🏠 Main Menu' }
      ];
  
  await whatsapp.sendButtons(phone, message, buttons);
  
  conversationState.transitionTo(customer, 'my_orders_menu');
  await customer.save();
}

module.exports = {
  // Core order operations
  initiateCheckout,
  selectServiceType,
  cancelOrder,
  trackOrder,
  viewOrderHistory,
  requestRefund,
  
  // Order queries
  getOrderById,
  getCustomerOrders,
  
  // Order validation
  canCancelOrder,
  isRefundEligible,
  
  // Formatting helpers
  formatOrderDetails,
  getOrderStatusLabel,
  getOrderStatusEmoji,
  
  // Intent detection
  detectOrderIntent,
  isOrderIntent,
  
  // UI helpers
  showOrderStatus,
  sendMyOrdersMenu
};
