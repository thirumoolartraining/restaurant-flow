/**
 * Payment Completion Domain Handler - Phase 3.4.6
 * 
 * Responsibilities:
 * - Verify payment signatures (Razorpay)
 * - Handle payment success callbacks
 * - Handle payment failure
 * - Process refunds
 * - Handle webhook events (payment.captured, refund.processed, refund.failed)
 * - Send payment confirmation notifications
 * - Update customer statistics
 * 
 * Domain Boundaries:
 * - Does NOT initiate payments (Payment Initiation Domain)
 * - Does NOT create orders (Payment Initiation Domain)
 * - Does NOT manage cart (Cart Domain)
 * - DOES verify and complete payments
 * - Uses conversationState service for state management
 */

const crypto = require('crypto');
const Order = require('../../models/Order');
const Customer = require('../../models/Customer');
const conversationState = require('../conversationState');
const whatsapp = require('../whatsapp');
const brevoMail = require('../brevoMail');
const razorpayService = require('../razorpay');
const googleSheets = require('../googleSheets');
const chatbotImagesService = require('../chatbotImages');
const { logger } = require('../correlationContext');
const dataEvents = require('../eventEmitter');

// Payment status constants
const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  REFUND_PENDING: 'refund_pending'
};

// Order status constants
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

/**
 * Verify Razorpay payment signature
 */
function verifyPaymentSignature(orderId, paymentId, signature) {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body.toString())
      .digest('hex');
    
    return expectedSignature === signature;
  } catch (error) {
    logger.error('Payment signature verification failed', {
      error: error.message,
      orderId,
      paymentId
    });
    return false;
  }
}

/**
 * Handle payment success
 */
async function handlePaymentSuccess(params) {
  const { orderId, paymentId, signature, razorpayOrderId } = params;
  
  try {
    // Verify signature
    const isValid = verifyPaymentSignature(razorpayOrderId, paymentId, signature);
    
    if (!isValid) {
      logger.error('Invalid payment signature', { orderId, paymentId });
      return {
        success: false,
        error: 'Invalid payment signature'
      };
    }
    
    // Find order
    const order = await Order.findOne({ orderId });
    
    if (!order) {
      logger.error('Order not found for payment', { orderId });
      return {
        success: false,
        error: 'Order not found'
      };
    }
    
    // Check if already paid
    if (order.paymentStatus === PAYMENT_STATUS.PAID) {
      logger.warn('Order already paid', { orderId });
      return {
        success: true,
        message: 'Order already paid',
        order
      };
    }
    
    // Update order
    order.paymentStatus = PAYMENT_STATUS.PAID;
    order.status = ORDER_STATUS.CONFIRMED;
    order.razorpayPaymentId = paymentId;
    order.razorpayOrderId = razorpayOrderId;
    order.paidAt = new Date();
    order.trackingUpdates.push({
      status: ORDER_STATUS.CONFIRMED,
      message: 'Payment received - Order confirmed'
    });
    
    await order.save();
    
    // Update customer
    const customer = await Customer.findOne({ phone: order.customer.phone });
    if (customer) {
      if (!customer.hasOrdered) {
        customer.hasOrdered = true;
        await customer.save();
      }
    }
    
    // Emit events
    dataEvents.emit('orders');
    dataEvents.emit('dashboard');
    
    // Sync to Google Sheets
    googleSheets.updateOrder(order).catch(err => 
      logger.error('Google Sheets sync error', { error: err.message })
    );
    
    // Send push notification to admin — payment confirmed
    try {
      const User = require('../../models/User');
      const pushNotification = require('../pushNotification');
      
      const admins = await User.find({ pushToken: { $ne: null } });
      for (const admin of admins) {
        if (admin.pushToken) {
          await pushNotification.sendNotification(
            admin.pushToken,
            '💳 Payment Confirmed!',
            `Order #${order.orderId} - ₹${order.totalAmount}\n${order.customer?.name || 'Customer'} paid via UPI`,
            { type: 'payment_confirmed', orderId: order.orderId, screen: 'Orders' },
            'order-updates'
          );
        }
      }
    } catch (pushErr) {
      logger.error('Admin push error (payment completion)', { error: pushErr.message });
    }

    // Send confirmation to customer
    await sendPaymentConfirmation(order);
    
    // Send email confirmation if customer has email
    if (order.customer.email) {
      await sendEmailConfirmation(order).catch(err =>
        logger.error('Email confirmation error', { error: err.message })
      );
    }
    
    logger.info('Payment success processed', {
      orderId,
      paymentId,
      amount: order.totalAmount
    });
    
    return {
      success: true,
      message: 'Payment verified successfully',
      order
    };
  } catch (error) {
    logger.error('Payment success handling failed', {
      error: error.message,
      orderId,
      paymentId
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle payment failure
 */
async function handlePaymentFailure(params) {
  const { orderId, error } = params;
  
  try {
    const order = await Order.findOne({ orderId });
    
    if (!order) {
      logger.error('Order not found for payment failure', { orderId });
      return {
        success: false,
        error: 'Order not found'
      };
    }
    
    // Update order
    order.paymentStatus = PAYMENT_STATUS.FAILED;
    order.paymentError = error || 'Payment failed';
    order.trackingUpdates.push({
      status: 'payment_failed',
      message: 'Payment failed - Please try again'
    });
    
    await order.save();
    
    // Emit events
    dataEvents.emit('orders');
    
    // Notify customer
    await sendPaymentFailureNotification(order);
    
    logger.info('Payment failure processed', {
      orderId,
      error
    });
    
    return {
      success: true,
      message: 'Payment failure recorded',
      order
    };
  } catch (err) {
    logger.error('Payment failure handling failed', {
      error: err.message,
      orderId
    });
    
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Send payment confirmation to customer
 */
async function sendPaymentConfirmation(order) {
  try {
    const phone = order.customer.phone;
    
    let message = `✅ *Payment Confirmed!*\n\n`;
    message += `📦 Order ID: *${order.orderId}*\n`;
    message += `💳 Payment ID: ${order.razorpayPaymentId}\n`;
    message += `💰 Amount: ₹${order.totalAmount}\n\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    message += `*Items:*\n`;
    
    order.items.forEach((item, i) => {
      message += `${i + 1}. ${item.name} x${item.quantity} - ₹${item.price * item.quantity}\n`;
    });
    
    message += `━━━━━━━━━━━━━━━\n`;
    message += `*Items Total:* ₹${order.itemsTotal}\n`;
    
    if (order.deliveryCharge > 0) {
      message += `*Delivery Charge:* ₹${order.deliveryCharge}\n`;
    }
    
    message += `*Grand Total:* ₹${order.totalAmount}\n\n`;
    
    if (order.serviceType === 'delivery') {
      message += `🚚 Your order will be delivered soon!\n`;
      message += `📍 ${order.deliveryAddress?.address || 'Delivery address'}\n\n`;
    } else {
      message += `🏪 Your order is being prepared!\n`;
      message += `Please collect from our restaurant.\n\n`;
    }
    
    message += `🙏 Thank you for your order!`;
    
    const confirmedImageUrl = await chatbotImagesService.getImageUrl('payment_confirmed');
    
    if (confirmedImageUrl) {
      await whatsapp.sendImage(phone, confirmedImageUrl, message, [
        { id: 'track_order', text: '📍 Track Order' },
        { id: 'home', text: '🏠 Main Menu' }
      ]);
    } else {
      await whatsapp.sendButtons(phone, message, [
        { id: 'track_order', text: '📍 Track Order' },
        { id: 'home', text: '🏠 Main Menu' }
      ]);
    }
    
    logger.info('Payment confirmation sent', { orderId: order.orderId });
  } catch (error) {
    logger.error('Failed to send payment confirmation', {
      error: error.message,
      orderId: order.orderId
    });
  }
}

/**
 * Send payment failure notification
 */
async function sendPaymentFailureNotification(order) {
  try {
    const phone = order.customer.phone;
    
    let message = `❌ *Payment Failed*\n\n`;
    message += `📦 Order ID: ${order.orderId}\n`;
    message += `💰 Amount: ₹${order.totalAmount}\n\n`;
    message += `Your payment could not be processed.\n\n`;
    message += `Please try again or choose a different payment method.`;
    
    await whatsapp.sendButtons(phone, message, [
      { id: 'retry_payment', text: '🔄 Retry Payment' },
      { id: 'pay_cod', text: '💵 Pay COD' },
      { id: 'home', text: '🏠 Main Menu' }
    ]);
    
    logger.info('Payment failure notification sent', { orderId: order.orderId });
  } catch (error) {
    logger.error('Failed to send payment failure notification', {
      error: error.message,
      orderId: order.orderId
    });
  }
}

/**
 * Send email confirmation
 */
async function sendEmailConfirmation(order) {
  try {
    const subject = `Order Confirmed - ${order.orderId}`;
    
    let html = `<h2>Order Confirmed!</h2>`;
    html += `<p>Thank you for your order. Your payment has been received.</p>`;
    html += `<h3>Order Details</h3>`;
    html += `<p><strong>Order ID:</strong> ${order.orderId}</p>`;
    html += `<p><strong>Payment ID:</strong> ${order.razorpayPaymentId}</p>`;
    html += `<p><strong>Amount:</strong> ₹${order.totalAmount}</p>`;
    html += `<h3>Items</h3>`;
    html += `<ul>`;
    
    order.items.forEach(item => {
      html += `<li>${item.name} x${item.quantity} - ₹${item.price * item.quantity}</li>`;
    });
    
    html += `</ul>`;
    html += `<p><strong>Items Total:</strong> ₹${order.itemsTotal}</p>`;
    
    if (order.deliveryCharge > 0) {
      html += `<p><strong>Delivery Charge:</strong> ₹${order.deliveryCharge}</p>`;
    }
    
    html += `<p><strong>Grand Total:</strong> ₹${order.totalAmount}</p>`;
    
    if (order.serviceType === 'delivery') {
      html += `<p><strong>Delivery Address:</strong> ${order.deliveryAddress?.address || 'N/A'}</p>`;
    } else {
      html += `<p><strong>Service Type:</strong> Self Pickup</p>`;
    }
    
    html += `<p>Thank you for choosing us!</p>`;
    
    await brevoMail.sendEmail(
      order.customer.email,
      order.customer.name || 'Customer',
      subject,
      html
    );
    
    logger.info('Email confirmation sent', {
      orderId: order.orderId,
      email: order.customer.email
    });
  } catch (error) {
    logger.error('Failed to send email confirmation', {
      error: error.message,
      orderId: order.orderId
    });
  }
}

/**
 * Process refund
 */
async function processRefund(params) {
  const { orderId, amount, reason } = params;
  
  try {
    const order = await Order.findOne({ orderId });
    
    if (!order) {
      logger.error('Order not found for refund', { orderId });
      return {
        success: false,
        error: 'Order not found'
      };
    }
    
    // Check if order is eligible for refund
    if (order.paymentStatus !== PAYMENT_STATUS.PAID) {
      logger.error('Order not paid, cannot refund', { orderId });
      return {
        success: false,
        error: 'Order not paid'
      };
    }
    
    if (!order.razorpayPaymentId) {
      logger.error('No payment ID for refund', { orderId });
      return {
        success: false,
        error: 'No payment ID found'
      };
    }
    
    // Check if already refunded
    if (order.refundStatus === 'completed') {
      logger.warn('Order already refunded', { orderId });
      return {
        success: true,
        message: 'Order already refunded',
        order
      };
    }
    
    // Process refund via Razorpay
    const refundAmount = amount || order.totalAmount;
    const refund = await razorpayService.refund(order.razorpayPaymentId, refundAmount);
    
    // Update order
    order.refundStatus = 'completed';
    order.refundAmount = refundAmount;
    order.refundId = refund.id;
    order.refundedAt = new Date();
    order.refundReason = reason || 'Customer request';
    order.paymentStatus = PAYMENT_STATUS.REFUNDED;
    order.status = ORDER_STATUS.REFUNDED;
    order.trackingUpdates.push({
      status: ORDER_STATUS.REFUNDED,
      message: `Refund processed - ₹${refundAmount}`
    });
    
    await order.save();
    
    // Emit events
    dataEvents.emit('orders');
    dataEvents.emit('dashboard');
    
    // Sync to Google Sheets
    googleSheets.updateOrder(order).catch(err =>
      logger.error('Google Sheets sync error', { error: err.message })
    );
    
    // Notify customer
    await sendRefundConfirmation(order);
    
    logger.info('Refund processed', {
      orderId,
      refundId: refund.id,
      amount: refundAmount
    });
    
    return {
      success: true,
      message: 'Refund processed successfully',
      order,
      refund
    };
  } catch (error) {
    logger.error('Refund processing failed', {
      error: error.message,
      orderId
    });
    
    // Update order with refund failure
    try {
      const order = await Order.findOne({ orderId });
      if (order) {
        order.refundStatus = 'failed';
        order.refundError = error.message;
        await order.save();
      }
    } catch (updateErr) {
      logger.error('Failed to update order with refund error', {
        error: updateErr.message
      });
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send refund confirmation
 */
async function sendRefundConfirmation(order) {
  try {
    const phone = order.customer.phone;
    
    let message = `💰 *Refund Processed*\n\n`;
    message += `📦 Order ID: ${order.orderId}\n`;
    message += `💳 Refund ID: ${order.refundId}\n`;
    message += `💰 Amount: ₹${order.refundAmount}\n\n`;
    message += `Your refund has been processed successfully.\n`;
    message += `It will be credited to your account within 5-7 business days.\n\n`;
    message += `🙏 Thank you for your patience!`;
    
    await whatsapp.sendButtons(phone, message, [
      { id: 'view_menu', text: '📋 Browse Menu' },
      { id: 'home', text: '🏠 Main Menu' }
    ]);
    
    logger.info('Refund confirmation sent', { orderId: order.orderId });
  } catch (error) {
    logger.error('Failed to send refund confirmation', {
      error: error.message,
      orderId: order.orderId
    });
  }
}

/**
 * Handle webhook payment captured event
 */
async function handleWebhookPaymentCaptured(payload) {
  try {
    const payment = payload.payment?.entity;
    
    if (!payment) {
      logger.error('No payment entity in webhook payload');
      return { success: false, error: 'No payment entity' };
    }
    
    const paymentId = payment.id;
    const razorpayOrderId = payment.order_id;
    const amount = payment.amount / 100; // Convert from paise to rupees
    
    // Find order by razorpay order ID
    const order = await Order.findOne({ razorpayOrderId });
    
    if (!order) {
      logger.warn('Order not found for webhook payment', { razorpayOrderId });
      return { success: false, error: 'Order not found' };
    }
    
    // Check if already processed
    if (order.paymentStatus === PAYMENT_STATUS.PAID) {
      logger.info('Payment already processed', { orderId: order.orderId });
      return { success: true, message: 'Already processed' };
    }
    
    // Update order
    order.paymentStatus = PAYMENT_STATUS.PAID;
    order.status = ORDER_STATUS.CONFIRMED;
    order.razorpayPaymentId = paymentId;
    order.paidAt = new Date();
    order.trackingUpdates.push({
      status: ORDER_STATUS.CONFIRMED,
      message: 'Payment captured - Order confirmed'
    });
    
    await order.save();
    
    // Emit events
    dataEvents.emit('orders');
    dataEvents.emit('dashboard');
    
    // Send confirmation
    await sendPaymentConfirmation(order);
    
    logger.info('Webhook payment captured processed', {
      orderId: order.orderId,
      paymentId,
      amount
    });
    
    return { success: true, order };
  } catch (error) {
    logger.error('Webhook payment captured handling failed', {
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Handle webhook refund processed event
 */
async function handleWebhookRefundProcessed(payload) {
  try {
    const refund = payload.refund?.entity;
    
    if (!refund) {
      logger.error('No refund entity in webhook payload');
      return { success: false, error: 'No refund entity' };
    }
    
    const refundId = refund.id;
    const paymentId = refund.payment_id;
    const amount = refund.amount / 100;
    
    // Find order by payment ID
    const order = await Order.findOne({ razorpayPaymentId: paymentId });
    
    if (!order) {
      logger.warn('Order not found for webhook refund', { paymentId });
      return { success: false, error: 'Order not found' };
    }
    
    // Update order
    order.refundStatus = 'completed';
    order.refundAmount = amount;
    order.refundId = refundId;
    order.refundedAt = new Date();
    order.paymentStatus = PAYMENT_STATUS.REFUNDED;
    order.status = ORDER_STATUS.REFUNDED;
    order.trackingUpdates.push({
      status: ORDER_STATUS.REFUNDED,
      message: `Refund completed - ₹${amount}`
    });
    
    await order.save();
    
    // Emit events
    dataEvents.emit('orders');
    
    // Send confirmation
    await sendRefundConfirmation(order);
    
    logger.info('Webhook refund processed', {
      orderId: order.orderId,
      refundId,
      amount
    });
    
    return { success: true, order };
  } catch (error) {
    logger.error('Webhook refund processing failed', {
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Get payment status
 */
async function getPaymentStatus(orderId) {
  try {
    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }
    
    return {
      success: true,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      paidAt: order.paidAt,
      paymentId: order.razorpayPaymentId,
      order
    };
  } catch (error) {
    logger.error('Failed to get payment status', {
      error: error.message,
      orderId
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  // Core payment completion
  handlePaymentSuccess,
  handlePaymentFailure,
  processRefund,
  getPaymentStatus,
  
  // Webhook handlers
  handleWebhookPaymentCaptured,
  handleWebhookRefundProcessed,
  
  // Verification
  verifyPaymentSignature,
  
  // Notifications
  sendPaymentConfirmation,
  sendPaymentFailureNotification,
  sendRefundConfirmation,
  sendEmailConfirmation,
  
  // Constants
  PAYMENT_STATUS,
  ORDER_STATUS
};