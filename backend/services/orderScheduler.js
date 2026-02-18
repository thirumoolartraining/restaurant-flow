const Order = require('../models/Order');
const logger = require('./logger');
const whatsapp = require('./whatsapp');
const googleSheets = require('./googleSheets');
const chatbotImagesService = require('./chatbotImages');

const PENDING_TIMEOUT_MINUTES = 15;

const orderScheduler = {
  // Check and cancel pending orders older than 15 minutes
  async cancelExpiredOrders() {
    try {
      const cutoffTime = new Date(Date.now() - PENDING_TIMEOUT_MINUTES * 60 * 1000);
      
      // Find pending orders older than 15 minutes
      // EXCLUDE pickup orders with COD (Pay at Hotel) - they don't need payment confirmation
      const expiredOrders = await Order.find({
        status: 'pending',
        paymentStatus: 'pending',
        createdAt: { $lt: cutoffTime },
        // Exclude pickup orders with COD payment (Pay at Hotel)
        $nor: [
          { serviceType: 'pickup', paymentMethod: 'cod' }
        ]
      });
      
      logger.info(`🔍 Found ${expiredOrders.length} expired pending orders (excluding pickup COD orders)`);
      
      for (const order of expiredOrders) {
        await this.cancelOrder(order);
      }
      
      return expiredOrders.length;
    } catch (error) {
      logger.error('❌ Error checking expired orders:', error.message);
      return 0;
    }
  },

  // Cancel a single order and notify customer
  async cancelOrder(order) {
    try {
      logger.info(`⏰ Auto-cancelling order ${order.orderId} (pending for >15 mins)`);
      
      // Update order status
      order.status = 'cancelled';
      order.cancellationReason = 'Auto-cancelled: Payment not received within 15 minutes';
      order.statusUpdatedAt = new Date(); // Track for auto-cleanup after 1 hour
      order.trackingUpdates.push({
        status: 'cancelled',
        message: 'Order auto-cancelled due to payment timeout',
        timestamp: new Date()
      });
      await order.save();
      
      // Update Google Sheets
      googleSheets.updateOrderStatus(order.orderId, 'cancelled', 'pending').catch(err =>
        logger.error('Google Sheets sync error:', err)
      );
      
      // Build order details message
      let itemsList = '';
      if (order.items && order.items.length > 0) {
        itemsList = order.items.map(item => 
          `• ${item.name} x${item.quantity} - ₹${item.price * item.quantity}`
        ).join('\n');
      }
      
      // Send WhatsApp notification to customer
      const message = `❌ *Order Cancelled*\n\n` +
        `📦 *Order ID:* ${order.orderId}\n` +
        `💰 *Total:* ₹${order.totalAmount}\n` +
        `🍽️ *Service:* ${order.serviceType}\n\n` +
        `*Items:*\n${itemsList}\n\n` +
        `━━━━━━━━━━━━━━━\n` +
        `⚠️ *Reason:* Payment not received within 15 minutes.\n\n` +
        `If you still want to order, please start a new order by sending "hi".`;
      
      // Use payment_timeout_cancelled image, fallback to order_cancelled
      let cancelledImageUrl = await chatbotImagesService.getImageUrl('payment_timeout_cancelled');
      if (!cancelledImageUrl) {
        cancelledImageUrl = await chatbotImagesService.getImageUrl('order_cancelled');
      }
      
      if (cancelledImageUrl) {
        await whatsapp.sendImageWithButtons(order.customer.phone, cancelledImageUrl, message, [
          { id: 'place_order', text: 'New Order' },
          { id: 'help', text: 'Help' }
        ]);
      } else {
        await whatsapp.sendButtons(order.customer.phone, message, [
          { id: 'place_order', text: 'New Order' },
          { id: 'help', text: 'Help' }
        ]);
      }
      
      // Emit event for real-time updates
      const dataEvents = require('./eventEmitter');
      dataEvents.emit('orders');
      dataEvents.emit('dashboard');

      // Send push notification to admin — auto-cancelled
      try {
        const User = require('../models/User');
        const pushNotification = require('./pushNotification');
        
        const admins = await User.find({ pushToken: { $ne: null } });
        for (const admin of admins) {
          if (admin.pushToken) {
            await pushNotification.sendNotification(
              admin.pushToken,
              '⏰ Order Auto-Cancelled',
              `Order #${order.orderId} - ₹${order.totalAmount}\nPayment not received within 15 min`,
              { type: 'order_cancelled', orderId: order.orderId, screen: 'Orders' },
              'order-updates'
            );
          }
        }
      } catch (pushErr) {
        logger.error('Admin push error (auto-cancel)', pushErr.message);
      }
      // Notify assigned delivery partner if order was assigned
      if (order.assignedTo) {
        try {
          const DeliveryBoy = require('../models/DeliveryBoy');
          const pushNotification = require('./pushNotification');
          
          const deliveryBoy = await DeliveryBoy.findById(order.assignedTo);
          if (deliveryBoy && deliveryBoy.pushToken) {
            await pushNotification.sendOrderCancelledNotification(deliveryBoy.pushToken, {
              orderId: order.orderId,
              totalAmount: order.totalAmount
            });
            logger.info(`Delivery partner ${deliveryBoy.name} notified of auto-cancellation`);
          }
        } catch (pushErr) {
          logger.error('Delivery push error (auto-cancel)', pushErr.message);
        }
      }
      logger.info(`✅ Order ${order.orderId} cancelled and customer notified`);
      return true;
    } catch (error) {
      logger.error(`❌ Error cancelling order ${order.orderId}:`, error.message);
      return false;
    }
  },

  // Start the scheduler (runs every minute)
  start() {
    logger.info('⏰ Order scheduler started - checking for expired orders every minute');
    
    // Run immediately on start
    this.cancelExpiredOrders();
    
    // Then run every minute
    setInterval(() => {
      this.cancelExpiredOrders();
    }, 60 * 1000); // Every 1 minute
  }
};

module.exports = orderScheduler;
