const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Initialize Expo SDK for sending to ExponentPushToken[...] tokens
// ---------------------------------------------------------------------------
const expo = new Expo();

/**
 * Detect token type
 * @param {string} token
 * @returns {'expo'|'fcm'|'invalid'}
 */
function getTokenType(token) {
  if (!token || typeof token !== 'string') return 'invalid';
  if (Expo.isExpoPushToken(token)) return 'expo';
  // FCM tokens are long alphanumeric strings with colons
  if (token.length > 20) return 'fcm';
  return 'invalid';
}

/**
 * Initialize Firebase Admin SDK (singleton - only once)
 * Uses service account credentials from environment variables.
 */
if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      logger.warn('⚠️ [Firebase Admin] Missing credentials — push notifications disabled. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.');
    } else {
      // Normalize the private key:
      // 1. Strip surrounding quotes if Render/shell added them
      privateKey = privateKey.replace(/^["']|["']$/g, '');
      // 2. Convert literal \n strings to real newlines
      privateKey = privateKey.replace(/\\n/g, '\n');
      // 3. If still no real newlines, try splitting on common PEM markers
      if (!privateKey.includes('\n')) {
        privateKey = privateKey
          .replace(/-----BEGIN PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----\n')
          .replace(/-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----\n');
      }

      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      logger.info('✅ [Firebase Admin] Initialized for push notifications');
    }
  } catch (error) {
    logger.error('❌ [Firebase Admin] Initialization error:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Badge count store (in-memory; swap with Redis for multi-instance deployments)
// ---------------------------------------------------------------------------
const badgeCounts = new Map();

// ---------------------------------------------------------------------------
// Known-stale tokens – avoid sending to tokens that already bounced
// Entries auto-expire after 24 h so a re-installed app can re-register
// ---------------------------------------------------------------------------
const staleTokens = new Map(); // token → timestamp
const STALE_TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours

function markTokenStale(token) {
  staleTokens.set(token, Date.now());
}

function isTokenStale(token) {
  const ts = staleTokens.get(token);
  if (!ts) return false;
  if (Date.now() - ts > STALE_TOKEN_TTL) {
    staleTokens.delete(token);
    return false; // expired — let it retry
  }
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if firebase-admin is properly initialised */
function isFirebaseReady() {
  return admin.apps.length > 0;
}

/**
 * Sleep helper for retry back-off
 * @param {number} ms milliseconds
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Convert any object values to strings (FCM data payload requirement).
 */
function toStringData(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = String(value ?? '');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Expo Push - send a single notification via Expo's push service
// ---------------------------------------------------------------------------
async function sendExpoNotification(pushToken, title, body, data = {}, channelId = 'default', badge = 1) {
  if (!Expo.isExpoPushToken(pushToken)) {
    logger.error('📱 [Expo] Invalid Expo push token:', pushToken);
    return false;
  }

  const message = {
    to: pushToken,
    sound: 'default',
    title,
    body,
    data: { ...data, channelId },
    badge,
    channelId,
    priority: 'high',
    _displayInForeground: true,
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of ticketChunk) {
        if (ticket.status === 'ok') {
          logger.info(`📱 [Expo] Push sent: ${ticket.id}`);
          return [{ status: 'ok', id: ticket.id }];
        } else if (ticket.status === 'error') {
          logger.error(`📱 [Expo] Push error: ${ticket.message}`, { details: ticket.details });
          if (ticket.details?.error === 'DeviceNotRegistered') {
            markTokenStale(pushToken);
          }
          return false;
        }
      }
    }
    return false;
  } catch (error) {
    logger.error(`📱 [Expo] Send failed: ${error.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Expo Push - send to multiple tokens via Expo's push service
// ---------------------------------------------------------------------------
async function sendExpoMultipleNotifications(pushTokens, title, body, data = {}, channelId = 'default') {
  const messages = pushTokens
    .filter(token => Expo.isExpoPushToken(token))
    .map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: { ...data, channelId },
      badge: 1,
      channelId,
      priority: 'high',
      _displayInForeground: true,
    }));

  if (messages.length === 0) {
    logger.info('📱 [Expo] No valid Expo tokens for multicast');
    return { successCount: 0, failureCount: 0 };
  }

  try {
    const chunks = expo.chunkPushNotifications(messages);
    let successCount = 0;
    let failureCount = 0;

    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of ticketChunk) {
        if (ticket.status === 'ok') {
          successCount++;
        } else {
          failureCount++;
          if (ticket.details?.error === 'DeviceNotRegistered') {
            // Find and mark the stale token
            const idx = ticketChunk.indexOf(ticket);
            if (idx >= 0 && idx < pushTokens.length) {
              markTokenStale(pushTokens[idx]);
            }
          }
        }
      }
    }

    logger.info(`📱 [Expo] Multicast: ${successCount} ok, ${failureCount} failed`);
    return { successCount, failureCount };
  } catch (error) {
    logger.error(`📱 [Expo] Multicast failed: ${error.message}`);
    return { successCount: 0, failureCount: messages.length };
  }
}

/**
 * Build the platform-agnostic FCM message object.
 *
 * Uses **both** `notification` + `data` payloads:
 * - `notification` → displayed by Android OS even when the app is killed
 * - `data`         → readable by app code when it wakes / opens
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {object} opts.data     Extra data (will be stringified)
 * @param {string} opts.channelId Android notification channel
 * @param {number} opts.badge    Badge / notification count
 * @returns {object} Partial FCM message (without `token` / `tokens`)
 */
function buildMessagePayload({ title, body, data = {}, channelId = 'default', badge = 1 }) {
  const stringData = toStringData(data);
  stringData.badgeCount = String(badge);
  stringData.channelId = channelId;
  // Duplicate title/body in data so the native Android service
  // (FoodAdminMessagingService.java) can read them as a fallback
  // when the notification payload is not available.
  stringData.title = title || '';
  stringData.body = body || '';

  return {
    notification: { title, body },
    data: stringData,

    android: {
      priority: 'high',
      ttl: 604800000, // 1 week
      notification: {
        channelId,
        sound: 'default',
        notificationPriority: 'PRIORITY_MAX',
        visibility: 'PUBLIC',
        notificationCount: badge,
        defaultVibrateTimings: true,
        defaultLightSettings: true,
        color: '#267E3E',
        tag: data.type ? `${data.type}_${data.orderId || Date.now()}` : undefined,
      },
    },

    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          alert: { title, body },
          sound: 'default',
          badge,
          'mutable-content': 1,
          'content-available': 1,
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Push notification service
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;

const pushNotification = {

  // ----- badge helpers -----

  getBadgeCount(pushToken) {
    const current = badgeCounts.get(pushToken) || 0;
    const next = current + 1;
    badgeCounts.set(pushToken, next);
    return next;
  },

  resetBadgeCount(pushToken) {
    badgeCounts.set(pushToken, 0);
  },

  // ----- core send (single device) -----

  /**
   * Send a push notification to **one** device via FCM.
   *
   * Includes automatic retry with exponential back-off and stale-token
   * detection so we never keep hammering an unregistered device.
   *
   * @param {string}  pushToken  FCM device token
   * @param {string}  title      Notification title
   * @param {string}  body       Notification body
   * @param {object}  data       Additional data payload
   * @param {string}  channelId  Android notification channel id
   * @returns {Promise<object[]|false>}
   */
  async sendNotification(pushToken, title, body, data = {}, channelId = 'default') {
    if (!pushToken || typeof pushToken !== 'string') {
      logger.error('📱 Invalid push token provided');
      return false;
    }
    if (isTokenStale(pushToken)) {
      logger.warn('📱 Skipping stale token (device unregistered recently)');
      return false;
    }

    const tokenType = getTokenType(pushToken);
    const badge = this.getBadgeCount(pushToken);

    // Route to Expo push service for Expo tokens
    if (tokenType === 'expo') {
      return sendExpoNotification(pushToken, title, body, data, channelId, badge);
    }

    // FCM path
    if (!isFirebaseReady()) {
      logger.warn('📱 Firebase not initialised — FCM notification skipped');
      return false;
    }

    const message = {
      token: pushToken,
      ...buildMessagePayload({ title, body, data, channelId, badge }),
    };

    // Retry loop
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await admin.messaging().send(message);
        logger.info(`📱 FCM notification sent (attempt ${attempt + 1}): ${response}`);
        return [{ status: 'ok', id: response }];
      } catch (error) {
        // Non-retryable errors
        if (
          error.code === 'messaging/registration-token-not-registered' ||
          error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/invalid-argument'
        ) {
          logger.warn(`📱 FCM token invalid (${error.code}) — marking stale`);
          markTokenStale(pushToken);
          return false;
        }

        // Retryable errors (server error, timeout, quota exceeded)
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 500; // 500ms, 1000ms
          logger.warn(`📱 FCM send failed (attempt ${attempt + 1}), retrying in ${delay}ms: ${error.message}`);
          await sleep(delay);
        } else {
          logger.error(`📱 FCM notification failed after ${MAX_RETRIES + 1} attempts: ${error.message}`);
          return false;
        }
      }
    }
    return false;
  },

  // ----- core send (multiple devices) -----

  /**
   * Send a push notification to **multiple** devices via FCM multicast.
   *
   * @param {string[]} pushTokens Array of FCM device tokens
   * @param {string}   title
   * @param {string}   body
   * @param {object}   data
   * @param {string}   channelId
   */
  async sendMultipleNotifications(pushTokens, title, body, data = {}, channelId = 'default') {
    const validTokens = pushTokens.filter(t => t && typeof t === 'string' && !isTokenStale(t));
    if (validTokens.length === 0) {
      logger.info('📱 No valid push tokens for multicast');
      return [];
    }

    // Split tokens by type
    const expoTokens = validTokens.filter(t => getTokenType(t) === 'expo');
    const fcmTokens = validTokens.filter(t => getTokenType(t) === 'fcm');
    const results = [];

    // Send to Expo tokens
    if (expoTokens.length > 0) {
      const expoResult = await sendExpoMultipleNotifications(expoTokens, title, body, data, channelId);
      results.push({ type: 'expo', ...expoResult });
    }

    // Send to FCM tokens
    if (fcmTokens.length > 0 && isFirebaseReady()) {
      const payload = buildMessagePayload({ title, body, data, channelId, badge: 1 });
      const message = { tokens: fcmTokens, ...payload };

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await admin.messaging().sendEachForMulticast(message);
          logger.info(`📱 FCM multicast (attempt ${attempt + 1}): ${response.successCount} ok, ${response.failureCount} failed`);

          // Mark individual stale tokens
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const code = resp.error?.code;
              if (
                code === 'messaging/registration-token-not-registered' ||
                code === 'messaging/invalid-registration-token'
              ) {
                markTokenStale(fcmTokens[idx]);
                logger.warn(`📱 Marked stale token index ${idx}`);
              } else {
                logger.error(`📱 FCM multicast token ${idx} error: ${resp.error?.message}`);
              }
            }
          });

          results.push({ type: 'fcm', successCount: response.successCount, failureCount: response.failureCount });
          break;
        } catch (error) {
          if (attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt) * 500;
            logger.warn(`📱 FCM multicast failed (attempt ${attempt + 1}), retrying in ${delay}ms: ${error.message}`);
            await sleep(delay);
          } else {
            logger.error(`📱 FCM multicast failed after ${MAX_RETRIES + 1} attempts: ${error.message}`);
          }
        }
      }
    }
    return results;
  },

  // ----- domain-specific convenience methods -----

  async sendNewOrderNotification(pushToken, orderDetails) {
    const title = '🛵 New Order Assigned!';
    const body = `Order #${orderDetails.orderId} - ₹${orderDetails.totalAmount}\n📍 ${orderDetails.deliveryAddress || 'Delivery'}`;
    const data = {
      type: 'new_order',
      orderId: orderDetails.orderId,
      screen: 'MyOrders',
      amount: orderDetails.totalAmount,
      customerName: orderDetails.customerName,
    };
    return this.sendNotification(pushToken, title, body, data, 'new-orders');
  },

  async sendOrderCancelledNotification(pushToken, orderDetails) {
    const title = '❌ Order Cancelled';
    const body = `Order #${orderDetails.orderId} has been cancelled`;
    const data = {
      type: 'order_cancelled',
      orderId: orderDetails.orderId,
      screen: 'MyOrders',
    };
    return this.sendNotification(pushToken, title, body, data, 'order-updates');
  },

  async notifyAllDeliveryPartners(deliveryPartners, title, body, data = {}) {
    const tokens = deliveryPartners
      .filter(dp => dp.pushToken && dp.isActive && dp.isOnline)
      .map(dp => dp.pushToken);
    if (tokens.length === 0) {
      logger.info('📱 No online delivery partners with push tokens');
      return [];
    }
    return this.sendMultipleNotifications(tokens, title, body, data, 'new-orders');
  },

  async sendAdminNewOrderNotification(pushToken, orderDetails) {
    const title = '🎉 New Order Received!';
    const body = `Order #${orderDetails.orderId} - ₹${orderDetails.totalAmount}\n${orderDetails.customerName} • ${orderDetails.items?.length || 0} items`;
    const data = {
      type: 'new_order',
      orderId: orderDetails.orderId,
      screen: 'Orders',
    };
    return this.sendNotification(pushToken, title, body, data, 'new-orders');
  },

  async sendTestNotification(pushToken) {
    if (!pushToken || typeof pushToken !== 'string') return { error: 'Invalid token' };

    const tokenType = getTokenType(pushToken);
    logger.info(`📱 Sending test notification (${tokenType}) to: ${pushToken.substring(0, 30)}...`);

    if (tokenType === 'expo') {
      const result = await sendExpoNotification(
        pushToken,
        '🔔 Test Notification',
        'This is a test notification from FoodAdmin. If you see this, notifications are working!',
        { type: 'test', timestamp: new Date().toISOString() },
        'default',
        1
      );
      return result ? { success: true } : { error: 'Expo push failed' };
    }

    if (!isFirebaseReady()) return { error: 'Firebase not initialised' };

    const message = {
      token: pushToken,
      ...buildMessagePayload({
        title: '🔔 Test Notification',
        body: 'This is a test notification from FoodAdmin. If you see this, notifications are working!',
        data: { type: 'test', timestamp: new Date().toISOString() },
        channelId: 'default',
        badge: 1,
      }),
    };

    try {
      const response = await admin.messaging().send(message);
      logger.info('📱 Test notification sent:', response);
      return { success: true, messageId: response };
    } catch (error) {
      logger.error('📱 Test notification error:', error.message);
      if (
        error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token'
      ) {
        markTokenStale(pushToken);
      }
      return { error: error.message, code: error.code };
    }
  },

  async sendOfferTemplateNotification(pushToken, details) {
    const isApproved = details.status === 'approved';
    const title = isApproved
      ? '✅ Offer Template Approved!'
      : '❌ Offer Template Rejected';
    const body = isApproved
      ? `Your offer "${details.offerTitle || 'Untitled'}" has been approved by Meta. You can now send it to customers!`
      : `Your offer "${details.offerTitle || 'Untitled'}" was rejected by Meta. ${details.reason || 'Please modify and retry.'}`;
    const data = {
      type: 'offer_template_status',
      offerId: details.offerId,
      status: details.status,
      screen: 'Offers',
    };
    return this.sendNotification(pushToken, title, body, data, 'default');
  },

  /**
   * Check delivery status.
   * FCM doesn't support per-message receipts via API; use Firebase Console
   * or BigQuery export for delivery analytics.
   */
  async checkReceipts(messageIds) {
    if (!messageIds || messageIds.length === 0) return [];
    logger.info('📱 FCM message IDs (check Firebase Console):', messageIds);
    return messageIds.map(id => ({ id, note: 'Check Firebase Console for delivery analytics' }));
  },
};

module.exports = pushNotification;
