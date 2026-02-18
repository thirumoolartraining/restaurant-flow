const express = require('express');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Settings = require('../models/Settings');
const whatsapp = require('../services/whatsapp');
const brevoMail = require('../services/brevoMail');
const googleSheets = require('../services/googleSheets');
const razorpayService = require('../services/razorpay');
const chatbotImagesService = require('../services/chatbotImages');
const authMiddleware = require('../middleware/auth');
const { adminRateLimiter } = require('../middleware/rateLimiter');
const { validators } = require('../middleware/inputValidation');
const logger = require('../services/logger');
const router = express.Router();

// Apply admin rate limiting to all order routes
router.use(adminRateLimiter);

// Helper to get Google Maps navigation URL
const getGoogleMapsNavigationUrl = async () => {
  try {
    const restaurantLocation = await Settings.getValue('restaurantLocation');
    if (restaurantLocation?.latitude && restaurantLocation?.longitude) {
      return `https://www.google.com/maps/dir/?api=1&destination=${restaurantLocation.latitude},${restaurantLocation.longitude}`;
    }
    return null;
  } catch (error) {
    logger.error('Error getting restaurant location', { error: error.message });
    return null;
  }
};

// Helper to send message with optional image and CTA URL
const sendWithOptionalImageCta = async (phone, imageUrl, message, buttonText, url, footer = '') => {
  if (imageUrl) {
    await whatsapp.sendImageWithCtaUrl(phone, imageUrl, message, buttonText, url, footer);
  } else {
    await whatsapp.sendCtaUrl(phone, message, buttonText, url, footer);
  }
};

// Helper to send message with optional image
const sendWithOptionalImage = async (phone, imageUrl, message, buttons, footer = '') => {
  if (imageUrl) {
    await whatsapp.sendImageWithButtons(phone, imageUrl, message, buttons, footer);
  } else {
    await whatsapp.sendButtons(phone, message, buttons, footer);
  }
};

// Lightweight endpoint to check for updates (returns hash only)
router.get('/check-updates', authMiddleware, async (req, res) => {
  try {
    const { status, lastHash } = req.query;
    const query = { isHidden: { $ne: true } };
    if (status) query.status = status;
    
    // Get count and latest update timestamp - very lightweight query
    const [count, latestOrder] = await Promise.all([
      Order.countDocuments(query),
      Order.findOne(query).sort({ updatedAt: -1 }).select('updatedAt').lean()
    ]);
    
    // Create a simple hash from count + latest update time
    const latestTime = latestOrder?.updatedAt?.getTime() || 0;
    const currentHash = `${count}-${latestTime}`;
    
    // If hash matches, no changes
    if (lastHash === currentHash) {
      return res.json({ hasChanges: false, hash: currentHash });
    }
    
    res.json({ hasChanges: true, hash: currentHash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { isHidden: { $ne: true } };
    if (status) query.status = status;
    const orders = await Order.find(query)
      .populate('items.menuItem', 'image')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Order.countDocuments(query);
    
    // Include hash for client-side change detection
    const latestOrder = orders[0];
    const hash = `${total}-${latestOrder?.updatedAt?.getTime() || 0}`;
    
    res.json({ orders, total, pages: Math.ceil(total / limit), hash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order history from Google Sheets (cost-saving - not from MongoDB)
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 30, search, status } = req.query;
    
    // Fetch all historical orders from Google Sheets
    const { orders: sheetOrders, error } = await googleSheets.getOrderHistory({
      searchQuery: search,
      status: status !== 'all' ? status : undefined,
    });
    
    if (error) {
      return res.status(500).json({ success: false, error });
    }
    
    // Paginate the results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginatedOrders = sheetOrders.slice(startIndex, startIndex + parseInt(limit));
    
    res.json({
      success: true,
      orders: paginatedOrders,
      total: sheetOrders.length,
      pages: Math.ceil(sheetOrders.length / parseInt(limit)),
      page: parseInt(page),
    });
  } catch (error) {
    logger.error('Error fetching order history', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get refunds with filter - MUST be before /:id route
router.get('/refunds', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    let query = { refundStatus: { $ne: 'none' } };
    
    if (status === 'pending') {
      query.refundStatus = { $in: ['pending', 'scheduled'] };
    } else if (status === 'completed') {
      query.refundStatus = 'completed';
    } else if (status === 'rejected') {
      query.refundStatus = 'rejected';
    } else if (status === 'failed') {
      query.refundStatus = 'failed';
    }
    // 'all' returns all non-none refund statuses
    
    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pending refund requests - MUST be before /:id route
router.get('/refunds/pending', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ refundStatus: 'pending' }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    let order;
    
    // Try to find by MongoDB _id first, then by orderId
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      // Looks like a MongoDB ObjectId
      order = await Order.findById(id);
    }
    
    // If not found or not a valid ObjectId, try finding by orderId
    if (!order) {
      order = await Order.findOne({ orderId: id });
    }
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/status', authMiddleware, async (req, res) => {
  logger.info('PUT /orders/:id/status called', { id: req.params.id, body: req.body });
  try {
    const { status, message, actualPaymentMethod } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    logger.info('Found order', { orderId: order.orderId, currentStatus: order.status, newStatus: status });

    const statusLabels = {
      pending: 'Pending', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready',
      out_for_delivery: 'On the Way', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded'
    };

    order.status = status;
    order.trackingUpdates.push({ status, message: message || `Status updated to ${statusLabels[status] || status}` });
    
    // Handle actual payment method for pickup orders (Pay at Hotel)
    if (actualPaymentMethod && order.serviceType === 'pickup') {
      order.actualPaymentMethod = actualPaymentMethod;
      order.paymentStatus = 'paid';
      order.trackingUpdates.push({ 
        status: 'paid', 
        message: `Payment collected via ${actualPaymentMethod === 'cash' ? 'Cash' : 'UPI'} at hotel` 
      });
      logger.info(`Pickup order payment: ${actualPaymentMethod}`);
    }
    
    // Handle actual payment method for delivery COD orders
    if (actualPaymentMethod && order.serviceType === 'delivery' && order.paymentMethod === 'cod') {
      order.actualPaymentMethod = actualPaymentMethod;
      logger.info(`Delivery COD payment: ${actualPaymentMethod}`);
    }
    
    // Track when status changed to delivered/cancelled/refunded for auto-cleanup
    if (status === 'delivered' || status === 'cancelled' || status === 'refunded') {
      order.statusUpdatedAt = new Date();
    }
    
    if (status === 'delivered') {
      order.deliveredAt = new Date();
      // Auto-mark COD orders as paid when delivered (for delivery orders)
      if (order.paymentMethod === 'cod' && order.serviceType !== 'pickup') {
        order.paymentStatus = 'paid';
        order.trackingUpdates.push({ status: 'paid', message: `COD payment collected via ${order.actualPaymentMethod === 'upi' ? 'UPI' : 'Cash'}` });
      }
      
      // Track today's revenue for delivered + paid orders
      if (order.paymentStatus === 'paid') {
        try {
          const DashboardStats = require('../models/DashboardStats');
          const getTodayString = () => {
            const now = new Date();
            return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
          };
          
          let stats = await DashboardStats.findOne();
          if (!stats) {
            stats = new DashboardStats({ todayDate: getTodayString() });
          }
          
          const today = getTodayString();
          if (stats.todayDate !== today) {
            stats.todayRevenue = 0;
            stats.todayOrders = 0;
            stats.todayDate = today;
          }
          
          stats.todayRevenue += order.totalAmount || 0;
          stats.todayOrders += 1;
          stats.lastUpdated = new Date();
          await stats.save();
          
          logger.info(`Today's revenue updated: +₹${order.totalAmount} (Total: ₹${stats.todayRevenue})`);
          
          // Also update Google Sheets dashboard in real-time
          try {
            await googleSheets.incrementDashboardStat('Today Orders', 1);
            await googleSheets.incrementDashboardStat('Today Revenue', order.totalAmount || 0);
            await googleSheets.incrementDashboardStat('Total Orders', 1);
            await googleSheets.incrementDashboardStat('Total Revenue', order.totalAmount || 0);
            
            // Update today's daily report in real-time using helper function
            await googleSheets.syncTodayDailyReport();
            logger.info('Google Sheets dashboard and daily report updated in real-time');
          } catch (sheetsErr) {
            logger.error('Google Sheets update error', { error: sheetsErr.message });
          }
        } catch (statsErr) {
          logger.error('Error updating today revenue', { error: statsErr.message });
        }
      }
    }
    
    // Mark COD orders as cancelled payment status when order is cancelled
    if (status === 'cancelled' && order.paymentMethod === 'cod' && order.paymentStatus === 'pending') {
      order.paymentStatus = 'cancelled';
    }
    
    // Update Google Sheets daily report in real-time for delivered/cancelled orders
    if (status === 'delivered' || status === 'cancelled') {
      try {
        await googleSheets.syncTodayDailyReport();
        logger.info(`Google Sheets daily report updated for ${status} order`);
      } catch (sheetsErr) {
        logger.error(`Google Sheets update error for ${status} order`, { error: sheetsErr.message });
      }
    }
    
    // Send push notification to delivery partner if order is cancelled and was assigned
    if (status === 'cancelled' && order.assignedTo) {
      try {
        const DeliveryBoy = require('../models/DeliveryBoy');
        const pushNotification = require('../services/pushNotification');
        
        const deliveryBoy = await DeliveryBoy.findById(order.assignedTo);
        if (deliveryBoy && deliveryBoy.pushToken) {
          await pushNotification.sendOrderCancelledNotification(deliveryBoy.pushToken, {
            orderId: order.orderId,
            totalAmount: order.totalAmount
          });
          logger.info(`Cancelled notification sent to ${deliveryBoy.name}`);
        }
      } catch (pushErr) {
        logger.error('Push notification error for cancelled order', { error: pushErr.message });
      }
    }
    
    // For paid UPI orders that are cancelled, mark refund as pending (wait for Razorpay)
    if (status === 'cancelled' && order.paymentStatus === 'paid' && order.razorpayPaymentId) {
      logger.info('Marking refund as pending for order', { orderId: order.orderId });
      
      order.refundStatus = 'pending';
      order.refundAmount = order.totalAmount;
      order.refundRequestedAt = new Date();
      order.paymentStatus = 'refund_processing';
      order.trackingUpdates.push({ 
        status: 'refund_processing', 
        message: `Refund of ₹${order.totalAmount} is being processed`, 
        timestamp: new Date() 
      });
      logger.info('Refund pending for order', { orderId: order.orderId });
    }
    
    try {
      await order.save();
      logger.info('Order saved to DB', { orderId: order.orderId, status: order.status, paymentStatus: order.paymentStatus });
    } catch (saveErr) {
      logger.error('Order save error', { error: saveErr.message });
      return res.status(500).json({ error: 'Failed to save order: ' + saveErr.message });
    }

    // Sync status update to Google Sheets
    try {
      logger.info('Syncing to Google Sheets', { orderId: order.orderId, status: order.status, paymentStatus: order.paymentStatus });
      const sheetUpdated = await googleSheets.updateOrderStatus(order.orderId, order.status, order.paymentStatus, actualPaymentMethod);
      if (sheetUpdated) {
        logger.info('Google Sheets synced successfully');
      } else {
        logger.warn('Google Sheets update returned false - order may not exist in sheet');
      }
    } catch (err) {
      logger.error('Google Sheets sync error', { error: err.message });
    }

    // Notify customer via WhatsApp (don't fail if notification fails)
    const statusMessages = {
      confirmed: '✅ Your order has been confirmed!',
      preparing: '👨‍🍳 Your order is being prepared!',
      ready: '📦 Your order is ready!',
      out_for_delivery: '🛵 Your order is on the way!',
      delivered: '✅ Your order has been delivered! Enjoy!',
      cancelled: '❌ Your order has been cancelled.'
    };
    
    // Pickup-specific status messages
    const pickupStatusMessages = {
      confirmed: '✅ Your pickup order has been confirmed!',
      ready: '📦 Your order is ready for pickup!\n\n🏪 Please come to the restaurant to collect your order.',
      delivered: '✅ Order completed! Thank you for picking up your order!',
      cancelled: '❌ Your pickup order has been cancelled.\n\n🏪 If you have any questions, please contact the restaurant.'
    };
    
    const isPickupOrder = order.serviceType === 'pickup';
    const messages = isPickupOrder ? pickupStatusMessages : statusMessages;
    
    if (messages[status]) {
      try {
        let msg = `*Order Update*\n\nOrder: ${order.orderId}\n${messages[status]}`;
        
        // Add order details and bill for delivered/completed orders
        if (status === 'delivered') {
          msg += `\n\n━━━━━━━━━━━━━━━\n📋 *Order Details*\n━━━━━━━━━━━━━━━\n`;
          
          // Add each item
          order.items.forEach((item, index) => {
            const itemTotal = item.price * item.quantity;
            msg += `${index + 1}. ${item.name}\n`;
            msg += `   ${item.quantity} × ₹${item.price} = ₹${itemTotal}\n`;
          });
          
          msg += `\n━━━━━━━━━━━━━━━\n`;
          msg += `💰 *Total Bill: ₹${order.totalAmount}*\n`;
          
          if (isPickupOrder) {
            msg += `🏪 Service: Self-Pickup\n`;
            msg += `💳 Payment: ${order.paymentMethod === 'cod' ? 'Paid at Hotel' : 'UPI'} (${order.paymentStatus === 'paid' ? '✅ Paid' : '⏳ Pending'})\n`;
          } else {
            msg += `💳 Payment: ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'UPI'} (${order.paymentStatus === 'paid' ? '✅ Paid' : '⏳ Pending'})\n`;
          }
          
          msg += `━━━━━━━━━━━━━━━\n`;
          msg += `\n🙏 Thank you for ordering!\nWe hope you enjoy your meal! 🍽️`;
          
          // Add review request message
          if (isPickupOrder) {
            msg += `\n\n⭐ *Rate your food!*\nTap below to rate the items you ordered.`;
          } else {
            msg += `\n\n⭐ *How was your order?*\nTap below to share your feedback.`;
          }
          
          // Send combined message with image and review CTA button
          const frontendUrl = process.env.FRONTEND_URL || 'https://restarunt-bot.vercel.app';
          const reviewUrl = `${frontendUrl}/review/${order.customer.phone}/${order.orderId}`;
          
          // Use pickup_completed image for pickup orders, delivered image for delivery orders
          const deliveredImageKey = isPickupOrder ? 'pickup_completed' : 'delivered';
          const deliveredImageUrl = await chatbotImagesService.getImageUrl(deliveredImageKey);
          
          await sendWithOptionalImageCta(
            order.customer.phone,
            deliveredImageUrl,
            msg,
            isPickupOrder ? 'Rate Your Food ⭐' : 'Leave a Review ⭐',
            reviewUrl,
            isPickupOrder ? 'Help us improve by rating your food items' : 'Your feedback helps us improve!'
          );
        } else if (status === 'confirmed' && isPickupOrder) {
          // Send pickup confirmed notification with Google Maps CTA
          const confirmedImageUrl = await chatbotImagesService.getImageUrl('pickup_confirmed');
          const mapsUrl = await getGoogleMapsNavigationUrl();
          
          if (mapsUrl) {
            await sendWithOptionalImageCta(
              order.customer.phone,
              confirmedImageUrl,
              msg,
              '📍 Navigate to Hotel',
              mapsUrl,
              'Get directions to pick up your order'
            );
          } else {
            await sendWithOptionalImage(
              order.customer.phone,
              confirmedImageUrl,
              msg,
              [
                { id: 'track_order', text: '📍 Track Order' },
                { id: 'home', text: '🏠 Main Menu' }
              ]
            );
          }
        } else if (status === 'ready' && isPickupOrder) {
          // Send special notification for pickup orders when ready with Google Maps CTA
          const readyImageUrl = await chatbotImagesService.getImageUrl('pickup_ready');
          const mapsUrl = await getGoogleMapsNavigationUrl();
          
          if (mapsUrl) {
            await sendWithOptionalImageCta(
              order.customer.phone,
              readyImageUrl,
              msg,
              '📍 Navigate to Hotel',
              mapsUrl,
              'Your order is ready! Get directions now'
            );
          } else {
            await sendWithOptionalImage(
              order.customer.phone,
              readyImageUrl,
              msg,
              [
                { id: 'track_order', text: '📍 View Order' },
                { id: 'home', text: '🏠 Main Menu' }
              ]
            );
          }
        } else if (status === 'out_for_delivery') {
          // Send image with track order button for out_for_delivery status
          const frontendUrl = process.env.FRONTEND_URL || 'https://restarunt-bot.vercel.app';
          const trackOrderUrl = `${frontendUrl}/track/${order.orderId}`;
          const deliveryImageUrl = await chatbotImagesService.getImageUrl('out_for_delivery');
          
          await sendWithOptionalImageCta(
            order.customer.phone,
            deliveryImageUrl,
            msg,
            'Track Your Order 📍',
            trackOrderUrl,
            'Tap to track your delivery'
          );
          
          // Send call delivery partner button if delivery partner is assigned
          if (order.assignedTo && order.deliveryPartnerName) {
            try {
              const DeliveryBoy = require('../models/DeliveryBoy');
              const deliveryBoy = await DeliveryBoy.findById(order.assignedTo);
              if (deliveryBoy && deliveryBoy.phone) {
                const callMsg = `📞 *Contact Delivery Partner*\n\n👤 ${order.deliveryPartnerName}\n\nTap below to call your delivery partner if needed.`;
                await whatsapp.sendCtaPhone(
                  order.customer.phone,
                  callMsg,
                  `📞 Call ${order.deliveryPartnerName}`,
                  deliveryBoy.phone,
                  'Your order is on the way!'
                );
              }
            } catch (callErr) {
              logger.error('Failed to send call button', { error: callErr.message });
            }
          }
        } else if (status === 'preparing') {
          // Send image with track order button for preparing status
          const frontendUrl = process.env.FRONTEND_URL || 'https://restarunt-bot.vercel.app';
          const trackOrderUrl = `${frontendUrl}/track/${order.orderId}`;
          const preparingImageUrl = await chatbotImagesService.getImageUrl('preparing');
          
          await sendWithOptionalImageCta(
            order.customer.phone,
            preparingImageUrl,
            msg,
            'Track Your Order 📍',
            trackOrderUrl,
            'Tap to track your order'
          );
        } else if (status === 'ready') {
          // Send image with track order button for ready status
          const frontendUrl = process.env.FRONTEND_URL || 'https://restarunt-bot.vercel.app';
          const trackOrderUrl = `${frontendUrl}/track/${order.orderId}`;
          const readyImageUrl = await chatbotImagesService.getImageUrl('ready');
          
          await sendWithOptionalImageCta(
            order.customer.phone,
            readyImageUrl,
            msg,
            'Track Your Order 📍',
            trackOrderUrl,
            'Tap to track your order'
          );
        } else if (status === 'cancelled') {
          // Add refund info if order was cancelled with pending refund
          if (order.refundStatus === 'pending' && order.paymentStatus === 'refund_processing') {
            msg += `\n\n💰 *Refund Processing*\nAmount: ₹${order.totalAmount}\n\n⏱️ Your refund will be processed within 5-7 business days.`;
          } else if (order.refundStatus === 'failed') {
            msg += `\n\n⚠️ *Refund Issue*\nWe couldn't process your refund automatically.\nAmount: ₹${order.totalAmount}\n\nOur team will contact you within 24 hours to resolve this.`;
          }
          
          // Use pickup-specific cancelled by restaurant image for pay-at-hotel pickup orders
          if (isPickupOrder && order.paymentMethod === 'cod') {
            // Pickup order cancelled by restaurant (pay at hotel)
            const cancelledByRestaurantImageUrl = await chatbotImagesService.getImageUrl('pickup_cancelled_by_restaurant');
            const cancelMsg = `❌ *Order Cancelled by Restaurant*\n\nOrder ID: *${order.orderId}*\n\nWe're sorry, but your self-pickup order has been cancelled by the restaurant.\n\nIf you have any questions, please contact us.`;
            
            await sendWithOptionalImage(
              order.customer.phone,
              cancelledByRestaurantImageUrl,
              cancelMsg,
              [
                { id: 'view_menu', text: '📋 Menu' },
                { id: 'help', text: '❓ Help' }
              ]
            );
          } else if (!isPickupOrder && order.paymentMethod === 'cod') {
            // Delivery COD order cancelled by restaurant
            const cancelledByRestaurantImageUrl = await chatbotImagesService.getImageUrl('order_cancelled_by_restaurant');
            const cancelMsg = `❌ *Order Cancelled by Restaurant*\n\nOrder ID: *${order.orderId}*\n\nWe're sorry, but your order has been cancelled by the restaurant.\n\nIf you have any questions, please contact us.`;
            
            await sendWithOptionalImage(
              order.customer.phone,
              cancelledByRestaurantImageUrl,
              cancelMsg,
              [
                { id: 'view_menu', text: '📋 Menu' },
                { id: 'help', text: '❓ Help' }
              ]
            );
          } else {
            // Use regular cancelled image for other orders (UPI cancelled, etc.)
            const cancelledImageKey = isPickupOrder ? 'pickup_cancelled' : 'order_cancelled';
            const cancelledImageUrl = await chatbotImagesService.getImageUrl(cancelledImageKey);
            
            await sendWithOptionalImage(
              order.customer.phone,
              cancelledImageUrl,
              msg,
              [
                { id: 'view_menu', text: '📋 Menu' },
                { id: 'help', text: '❓ Help' }
              ]
            );
          }
        } else {
          // Other statuses (confirmed, etc.)
          await whatsapp.sendMessage(order.customer.phone, msg);
        }
      } catch (whatsappError) {
        logger.error('WhatsApp notification failed', { error: whatsappError.message });
      }
    }

    // Send email if available (don't fail if email fails)
    if (order.customer.email) {
      try {
        await brevoMail.sendStatusUpdate(order.customer.email, order.orderId, status, statusMessages[status] || '');
      } catch (emailError) {
        logger.error('Email notification failed', { error: emailError.message });
      }
    }

    // Emit event for real-time updates
    const dataEvents = require('../services/eventEmitter');
    dataEvents.emit('orders');
    dataEvents.emit('dashboard');

    // Send push notification to all admins for order status changes
    // This ensures admins get notified even when the app is closed/killed
    try {
      const User = require('../models/User');
      const pushNotification = require('../services/pushNotification');
      
      const statusEmoji = {
        confirmed: '✅', preparing: '👨‍🍳', ready: '📦',
        out_for_delivery: '🛵', delivered: '✅', cancelled: '❌', refunded: '💰'
      };
      const emoji = statusEmoji[status] || '📋';
      const label = statusLabels[status] || status;
      
      const admins = await User.find({ pushToken: { $ne: null } });
      for (const admin of admins) {
        if (admin.pushToken) {
          await pushNotification.sendNotification(
            admin.pushToken,
            `${emoji} Order ${label}`,
            `Order #${order.orderId} - ₹${order.totalAmount}\nStatus: ${label}`,
            { type: 'order_status', orderId: order.orderId, status, screen: 'Orders' },
            'order-updates'
          );
        }
      }
    } catch (pushErr) {
      logger.error('Admin push error (status update)', { error: pushErr.message });
    }

    // INSTANT CLEANUP: Hide delivered/cancelled orders from admin dashboard immediately
    // They remain in Google Sheets for history viewing (cost-saving approach)
    if (status === 'delivered' || status === 'cancelled') {
      try {
        // Update customer order history in Google Sheets (non-blocking)
        googleSheets.updateCustomerOrder(order.customer.phone, order, status).catch(err => {
          logger.error('Failed to update customer order in sheets', { error: err.message });
        });
        
        // Wait a small delay to ensure Google Sheets sync is complete
        setTimeout(async () => {
          await Order.updateOne(
            { _id: order._id },
            { $set: { isHidden: true } }
          );
          logger.info(`Order ${order.orderId} hidden from dashboard (status: ${status})`);
          dataEvents.emit('orders');
        }, 3000); // 3 second delay to ensure sheets sync
      } catch (cleanupErr) {
        logger.error('Instant cleanup error', { error: cleanupErr.message });
      }
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign delivery partner to order
router.put('/:id/assign-delivery', authMiddleware, async (req, res) => {
  try {
    const { deliveryBoyId } = req.body;
    const DeliveryBoy = require('../models/DeliveryBoy');
    const pushNotification = require('../services/pushNotification');
    
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) return res.status(404).json({ error: 'Delivery partner not found' });
    
    if (!deliveryBoy.isActive) {
      return res.status(400).json({ error: 'Delivery partner is not active' });
    }
    
    order.assignedTo = deliveryBoy._id;
    order.deliveryPartnerName = deliveryBoy.name;
    order.assignedAt = new Date();
    order.trackingUpdates.push({ 
      status: order.status, 
      message: `Assigned to delivery partner: ${deliveryBoy.name}` 
    });
    
    await order.save();
    
    // Prepare order details for notifications
    const orderDetails = {
      orderId: order.orderId,
      customerName: order.customer?.name || 'Customer',
      customerPhone: order.customer?.phone || '',
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      deliveryAddress: order.deliveryAddress?.address || order.customer?.address || 'N/A',
      items: order.items || []
    };
    
    // Send push notification to delivery partner
    if (deliveryBoy.pushToken) {
      try {
        await pushNotification.sendNewOrderNotification(deliveryBoy.pushToken, orderDetails);
        logger.info(`Push notification sent to ${deliveryBoy.name}`);
      } catch (pushErr) {
        logger.error('Push notification error', { error: pushErr.message });
      }
    }
    
    // Send email notification to delivery partner
    if (deliveryBoy.email) {
      try {
        await brevoMail.sendDeliveryPartnerNotification(
          deliveryBoy.email,
          deliveryBoy.name,
          orderDetails
        );
        logger.info(`Email notification sent to ${deliveryBoy.email}`);
      } catch (emailErr) {
        logger.error('Email notification error', { error: emailErr.message });
      }
    }
    
    // Update Google Sheets with delivery partner
    try {
      await googleSheets.updateDeliveryPartner(order.orderId, deliveryBoy.name);
    } catch (err) {
      logger.error('Google Sheets delivery partner update error', { error: err.message });
    }
    
    // Emit event for real-time updates
    const dataEvents = require('../services/eventEmitter');
    dataEvents.emit('orders');
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/delivery-time', authMiddleware, async (req, res) => {
  try {
    const { estimatedDeliveryTime } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { estimatedDeliveryTime: new Date(estimatedDeliveryTime) },
      { new: true }
    );
    
    try {
      await whatsapp.sendMessage(order.customer.phone,
        `⏰ *Delivery Update*\n\nOrder: ${order.orderId}\nEstimated delivery: ${new Date(estimatedDeliveryTime).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`);
    } catch (whatsappError) {
      logger.error('WhatsApp notification failed', { error: whatsappError.message });
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve refund by orderId
router.post('/:orderId/refund/approve', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    if (!['pending', 'scheduled', 'failed'].includes(order.refundStatus)) {
      return res.status(400).json({ error: 'No pending refund request for this order' });
    }

    const razorpayService = require('../services/razorpay');
    const paymentId = order.razorpayPaymentId || order.paymentId;
    
    // Process refund via Razorpay if UPI payment with payment ID
    if (order.paymentMethod === 'upi' && paymentId) {
      try {
        const refund = await razorpayService.refund(paymentId, order.refundAmount || order.totalAmount);
        order.refundId = refund.id;
        order.refundStatus = 'completed';
        order.paymentStatus = 'refunded';
        order.status = 'refunded';
        order.statusUpdatedAt = new Date();
        order.refundProcessedAt = new Date();
        order.trackingUpdates.push({ status: 'refunded', message: `Refund of ₹${order.refundAmount || order.totalAmount} processed. Refund ID: ${refund.id}` });
        
        // Notify customer
        try {
          await whatsapp.sendButtons(order.customer.phone,
            `✅ *Refund Successful!*\n\nOrder: ${order.orderId}\nAmount: ₹${order.refundAmount || order.totalAmount}\nRefund ID: ${refund.id}\n\n💳 Amount will be credited to your account shortly.`,
            [{ id: 'place_order', text: 'New Order' }, { id: 'home', text: 'Main Menu' }]
          );
        } catch (e) {
          logger.error('WhatsApp notification failed', { error: e.message });
        }
      } catch (refundError) {
        logger.error('Razorpay refund error', { error: refundError.message });
        order.refundStatus = 'failed';
        order.status = 'refund_failed';
        order.paymentStatus = 'refund_failed';
        order.trackingUpdates.push({ status: 'refund_failed', message: refundError.message });
        await order.save();
        
        // Sync to Google Sheets with failed status
        googleSheets.updateOrderStatus(order.orderId, 'refund_failed', 'refund_failed').catch(err => 
          logger.error('Google Sheets sync error', { error: err.message })
        );
        
        // Emit event for real-time updates
        const dataEvents = require('../services/eventEmitter');
        dataEvents.emit('orders');
        dataEvents.emit('dashboard');
        
        return res.status(500).json({ error: 'Refund processing failed: ' + refundError.message });
      }
    } else {
      // COD refund - manual process
      order.refundStatus = 'completed';
      order.paymentStatus = 'refunded';
      order.status = 'refunded';
      order.statusUpdatedAt = new Date();
      order.refundProcessedAt = new Date();
      order.trackingUpdates.push({ status: 'refunded', message: `COD refund of ₹${order.refundAmount || order.totalAmount} approved` });
      
      // Notify customer
      try {
        await whatsapp.sendButtons(order.customer.phone,
          `✅ *Refund Approved!*\n\nOrder: ${order.orderId}\nAmount: ₹${order.refundAmount || order.totalAmount}\n\n💵 Our team will contact you for the refund process.`,
          [{ id: 'place_order', text: 'New Order' }, { id: 'home', text: 'Main Menu' }]
        );
      } catch (e) {
        logger.error('WhatsApp notification failed', { error: e.message });
      }
    }
    
    await order.save();
    
    // Emit event for real-time updates
    const dataEvents = require('../services/eventEmitter');
    dataEvents.emit('orders');
    dataEvents.emit('dashboard');
    
    // Sync to Google Sheets
    googleSheets.updateOrderStatus(order.orderId, order.status, order.paymentStatus).catch(err => 
      logger.error('Google Sheets sync error', { error: err.message })
    );
    
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reject refund by orderId
router.post('/:orderId/refund/reject', authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    if (!['pending', 'scheduled'].includes(order.refundStatus)) {
      return res.status(400).json({ error: 'No pending refund request for this order' });
    }

    order.refundStatus = 'rejected';
    order.trackingUpdates.push({ status: 'refund_rejected', message: reason || 'Refund request rejected by admin' });
    await order.save();
    
    // Emit event for real-time updates
    const dataEvents = require('../services/eventEmitter');
    dataEvents.emit('orders');
    dataEvents.emit('dashboard');
    
    // Notify customer
    try {
      await whatsapp.sendButtons(order.customer.phone,
        `❌ *Refund Request Rejected*\n\nOrder: ${order.orderId}\n\nReason: ${reason || 'Your refund request has been reviewed and rejected.'}\n\nPlease contact support for more information.`,
        [{ id: 'place_order', text: 'New Order' }, { id: 'home', text: 'Main Menu' }]
      );
    } catch (e) {
      logger.error('WhatsApp notification failed', { error: e.message });
    }
    
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
