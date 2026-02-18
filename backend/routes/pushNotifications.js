/**
 * Push Notifications Routes - Phase 6.10
 */

const express = require('express');
const logger = require('../services/logger');
const router = express.Router();
const admin = require('firebase-admin');
const { authenticate } = require('../middleware/authenticate');
const { publicRateLimiter } = require('../middleware/rateLimiter');

// Firebase Admin is initialized in services/pushNotification.js (singleton)
// Just require it here to ensure it's initialized
require('../services/pushNotification');

// In-memory storage for FCM tokens (use database in production)
const fcmTokens = new Map();

/**
 * @route POST /api/push-notifications/register
 * @desc Register FCM token
 * @access Public
 */
router.post('/register', publicRateLimiter, async (req, res) => {
  try {
    const { token, userType, userId, platform, deviceInfo } = req.body;
    
    if (!token || !userType || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Store token
    const key = `${userType}:${userId}`;
    fcmTokens.set(key, {
      token,
      platform,
      deviceInfo,
      registeredAt: new Date(),
    });
    
    logger.info(`✅ [FCM] Token registered for ${userType}:${userId}`);
    
    res.json({ success: true, message: 'Token registered successfully' });
  } catch (error) {
    logger.error('❌ [FCM] Register error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/push-notifications/unregister
 * @desc Unregister FCM token
 * @access Authenticated
 */
router.post('/unregister', authenticate, async (req, res) => {
  try {
    const { userType, userId } = req.body;
    
    const key = `${userType}:${userId}`;
    fcmTokens.delete(key);
    
    logger.info(`✅ [FCM] Token unregistered for ${userType}:${userId}`);
    
    res.json({ success: true, message: 'Token unregistered successfully' });
  } catch (error) {
    logger.error('❌ [FCM] Unregister error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/push-notifications/send
 * @desc Send push notification
 * @access Authenticated
 */
router.post('/send', authenticate, async (req, res) => {
  try {
    const { userType, userId, title, body, data } = req.body;
    
    if (!userType || !userId || !title || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get token
    const key = `${userType}:${userId}`;
    const tokenData = fcmTokens.get(key);
    
    if (!tokenData) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    // Send notification
    const message = {
      token: tokenData.token,
      notification: {
        title,
        body,
      },
      data: data || {},
      android: {
        priority: 'high',
        notification: {
          channelId: data?.type === 'order' ? 'orders' : 'default',
          sound: data?.type === 'order' ? 'order_notification' : 'default',
          priority: 'high',
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: data?.type === 'order' ? 'order_notification.wav' : 'default',
            badge: 1,
          },
        },
      },
    };
    
    const response = await admin.messaging().send(message);
    
    logger.info(`✅ [FCM] Notification sent to ${userType}:${userId}`);
    
    res.json({ success: true, messageId: response });
  } catch (error) {
    logger.error('❌ [FCM] Send error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/push-notifications/send-to-all
 * @desc Send push notification to all users of a type
 * @access Authenticated (Admin only)
 */
router.post('/send-to-all', authenticate, async (req, res) => {
  try {
    const { userType, title, body, data } = req.body;
    
    if (!userType || !title || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get all tokens for user type
    const tokens = [];
    for (const [key, tokenData] of fcmTokens.entries()) {
      if (key.startsWith(`${userType}:`)) {
        tokens.push(tokenData.token);
      }
    }
    
    if (tokens.length === 0) {
      return res.status(404).json({ error: 'No tokens found' });
    }
    
    // Send multicast notification
    const message = {
      tokens,
      notification: {
        title,
        body,
      },
      data: data || {},
      android: {
        priority: 'high',
        notification: {
          channelId: data?.type === 'order' ? 'orders' : 'default',
          sound: data?.type === 'order' ? 'order_notification' : 'default',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: data?.type === 'order' ? 'order_notification.wav' : 'default',
            badge: 1,
          },
        },
      },
    };
    
    const response = await admin.messaging().sendMulticast(message);
    
    logger.info(`✅ [FCM] Multicast sent to ${tokens.length} ${userType} users`);
    logger.info(`Success: ${response.successCount}, Failure: ${response.failureCount}`);
    
    res.json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
  } catch (error) {
    logger.error('❌ [FCM] Send multicast error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/push-notifications/send-order-notification
 * @desc Send order notification to delivery boys
 * @access Authenticated
 */
router.post('/send-order-notification', authenticate, async (req, res) => {
  try {
    const { orderId, orderDetails } = req.body;
    
    if (!orderId || !orderDetails) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get all delivery boy tokens
    const tokens = [];
    for (const [key, tokenData] of fcmTokens.entries()) {
      if (key.startsWith('delivery:')) {
        tokens.push(tokenData.token);
      }
    }
    
    if (tokens.length === 0) {
      return res.status(404).json({ error: 'No delivery boys available' });
    }
    
    // Send notification
    const message = {
      tokens,
      notification: {
        title: 'New Order Available',
        body: `Order #${orderId} - ₹${orderDetails.total}`,
      },
      data: {
        type: 'order',
        orderId,
        ...orderDetails,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'orders',
          sound: 'order_notification',
          priority: 'high',
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'order_notification.wav',
            badge: 1,
          },
        },
      },
    };
    
    const response = await admin.messaging().sendMulticast(message);
    
    logger.info(`✅ [FCM] Order notification sent to ${tokens.length} delivery boys`);
    
    res.json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
  } catch (error) {
    logger.error('❌ [FCM] Send order notification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/push-notifications/tokens
 * @desc Get registered tokens count
 * @access Authenticated (Admin only)
 */
router.get('/tokens', authenticate, (req, res) => {
  try {
    const stats = {
      total: fcmTokens.size,
      byType: {
        admin: 0,
        delivery: 0,
      },
    };
    
    for (const [key] of fcmTokens.entries()) {
      if (key.startsWith('admin:')) stats.byType.admin++;
      if (key.startsWith('delivery:')) stats.byType.delivery++;
    }
    
    res.json(stats);
  } catch (error) {
    logger.error('❌ [FCM] Get tokens error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
