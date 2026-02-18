// Refund Scheduler - Processes refund after delay and sends success message
const Order = require('../models/Order');
const logger = require('./logger');
const whatsapp = require('./whatsapp');
const googleSheets = require('./googleSheets');
const razorpayService = require('./razorpay');

const pendingRefunds = new Map();

const refundScheduler = {
  // Schedule refund to be processed after delay (default 5 minutes)
  scheduleRefund(orderId, delayMs = 5 * 60 * 1000) {
    logger.info(`⏰ Scheduling refund for ${orderId} in ${delayMs / 1000} seconds`);
    
    // Cancel any existing scheduled refund for this order
    this.cancelScheduledRefund(orderId);
    
    const timeoutId = setTimeout(async () => {
      await this.processRefund(orderId);
      pendingRefunds.delete(orderId);
    }, delayMs);
    
    pendingRefunds.set(orderId, timeoutId);
  },

  async processRefund(orderId) {
    try {
      const order = await Order.findOne({ orderId });
      
      if (!order) {
        logger.info(`❌ Order ${orderId} not found for refund`);
        return;
      }
      
      // Check if refund should be processed
      if (order.refundStatus === 'completed') {
        logger.info(`⚠️ Order ${orderId} already refunded, skipping`);
        return;
      }
      
      if (order.refundStatus !== 'scheduled' && order.refundStatus !== 'pending') {
        logger.info(`⚠️ Order ${orderId} refund status is ${order.refundStatus}, skipping`);
        return;
      }
      
      if (order.status !== 'cancelled') {
        logger.info(`⚠️ Order ${orderId} is not cancelled (status: ${order.status}), skipping refund`);
        return;
      }
      
      if (!order.razorpayPaymentId) {
        logger.info(`⚠️ Order ${orderId} has no payment ID, skipping refund`);
        return;
      }
      
      logger.info(`💰 Processing scheduled refund for order ${orderId}`);
      
      try {
        // Process the actual refund via Razorpay
        const refund = await razorpayService.refund(order.razorpayPaymentId, order.totalAmount);
        
        // Update order with refund details
        order.refundStatus = 'completed';
        order.status = 'refunded';
        order.refundId = refund.id;
        order.refundProcessedAt = new Date();
        order.statusUpdatedAt = new Date();
        order.trackingUpdates.push({
          status: 'refunded',
          message: `Refund of ₹${order.totalAmount} completed successfully`,
          timestamp: new Date()
        });
        await order.save();
        
        // Emit event for real-time updates
        const dataEvents = require('./eventEmitter');
        dataEvents.emit('orders');
        dataEvents.emit('dashboard');
        
        logger.info(`✅ Refund completed for order ${orderId}, Refund ID: ${refund.id}`);
        
        // Send WhatsApp success message
        await this.sendRefundSuccessMessage(order);
        
        // Sync to Google Sheets
        try {
          await googleSheets.updateOrderStatus(order.orderId, 'refunded', 'refunded');
        } catch (err) {
          logger.error('Google Sheets sync error:', err.message);
        }
        
      } catch (refundError) {
        logger.error(`❌ Refund failed for order ${orderId}:`, refundError.message);
        
        // Update order with failure status
        order.refundStatus = 'failed';
        order.status = 'refund_failed';
        order.paymentStatus = 'refund_failed';
        order.refundError = refundError.message;
        order.trackingUpdates.push({
          status: 'refund_failed',
          message: `Refund failed: ${refundError.message}`,
          timestamp: new Date()
        });
        await order.save();
        
        // Emit event for real-time updates
        const dataEvents = require('./eventEmitter');
        dataEvents.emit('orders');
        
        // Sync to Google Sheets - move to refundfailed sheet
        try {
          await googleSheets.updateOrderStatus(order.orderId, 'refund_failed', 'refund_failed');
        } catch (err) {
          logger.error('Google Sheets sync error for failed refund:', err.message);
        }
        
        // Send failure notification
        await this.sendRefundFailureMessage(order);
      }
      
    } catch (error) {
      logger.error(`❌ Error processing refund for ${orderId}:`, error.message);
    }
  },

  async sendRefundSuccessMessage(order) {
    try {
      const msg = `✅ *Refund Successful!*\n\n` +
        `Order: ${order.orderId}\n` +
        `Amount: ₹${order.totalAmount}\n` +
        `Refund ID: ${order.refundId}\n\n` +
        `💰 The amount has been credited to your account.\n\n` +
        `Thank you for your patience! 🙏`;
      
      await whatsapp.sendButtons(order.customer.phone, msg, [
        { id: 'place_order', text: 'New Order' },
        { id: 'home', text: 'Main Menu' }
      ]);
      logger.info(`📱 Refund success message sent to ${order.customer.phone}`);
    } catch (whatsappError) {
      logger.error('WhatsApp refund notification failed:', whatsappError.message);
    }
  },

  async sendRefundFailureMessage(order) {
    try {
      const msg = `⚠️ *Refund Issue*\n\n` +
        `Order: ${order.orderId}\n` +
        `Amount: ₹${order.totalAmount}\n\n` +
        `We couldn't process your refund automatically.\n` +
        `Our team will contact you within 24 hours to resolve this.\n\n` +
        `Sorry for the inconvenience! 🙏`;
      
      await whatsapp.sendButtons(order.customer.phone, msg, [
        { id: 'place_order', text: 'New Order' },
        { id: 'home', text: 'Main Menu' }
      ]);
      logger.info(`📱 Refund failure message sent to ${order.customer.phone}`);
    } catch (whatsappError) {
      logger.error('WhatsApp refund failure notification failed:', whatsappError.message);
    }
  },

  cancelScheduledRefund(orderId) {
    const timeoutId = pendingRefunds.get(orderId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingRefunds.delete(orderId);
      logger.info(`🚫 Cancelled scheduled refund for ${orderId}`);
    }
  }
};

module.exports = refundScheduler;
