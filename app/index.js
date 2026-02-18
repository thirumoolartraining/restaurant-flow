/**
 * App Entry Point
 * 
 * IMPORTANT: Background notification handler MUST be registered here
 * (outside of React components) to work when app is closed/killed.
 * 
 * @react-native-firebase/messaging registers a custom FirebaseMessagingService
 * that intercepts ALL incoming FCM messages — including those with a
 * `notification` payload. This PREVENTS Android from auto-displaying them.
 * Therefore we MUST explicitly create a local notification via
 * expo-notifications inside setBackgroundMessageHandler.
 */

import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

// ---------------------------------------------------------------------------
// 1. Register FCM background message handler (must be top-level)
//    This handler runs when the app is in BACKGROUND or KILLED state.
//    It must explicitly display the notification since Firebase's custom
//    service intercepts and consumes the FCM message before Android OS
//    can auto-display it.
// ---------------------------------------------------------------------------
try {
  const messaging = require('@react-native-firebase/messaging').default;

  messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('📱 [FCM] Background message received (JS handler)');

    // ── NOTE ──
    // Notification DISPLAY is now handled natively by
    // FoodAdminMessagingService.java — it creates a native Android
    // notification at the Java level which is 100% reliable even when
    // the JS runtime is not available (app killed / headless context).
    //
    // This JS handler only runs for SIDE-EFFECTS like badge-count
    // persistence. It may or may not execute depending on device OEM
    // battery-optimisation, which is fine because the notification is
    // already displayed by the native service.

    const { data } = remoteMessage;

    // ── Badge count side-effect ──
    const badgeCount = data?.badgeCount;
    if (badgeCount) {
      try {
        const Notifications = require('expo-notifications');
        const badgeNum = parseInt(badgeCount, 10);
        await Notifications.setBadgeCountAsync(badgeNum);

        // Also persist to SecureStore so the app can read it on next cold start
        const SecureStore = require('expo-secure-store');
        await SecureStore.setItemAsync('notification_badge_count', String(badgeNum));
      } catch (_) {
        // Non-critical — badge just won't update this one time
      }
    }
  });

  console.log('✅ [FCM] Background handler registered');
} catch (error) {
  console.warn('⚠️ [FCM] Could not register background handler:', error.message);
}

// ---------------------------------------------------------------------------
// 2. Create Android notification channels on startup
//    These MUST exist before the first FCM message targets them.
//    The pushNotifications.js service also creates these channels when
//    the module loads — this is a safety-net for the very first install
//    where a notification can arrive before the JS bundle fully executes.
// ---------------------------------------------------------------------------
if (Platform.OS === 'android') {
  try {
    const Notifications = require('expo-notifications');
    const SecureStoreIdx = require('expo-secure-store');

    const channelDefaults = {
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    };

    // Version-gated channel migration: delete and recreate channels ONLY
    // when the channel config version changes. This preserves user's custom
    // notification preferences (mute, custom sound, vibration) between app
    // starts, while still allowing us to fix channels when needed.
    const CHANNEL_CONFIG_VERSION = '2'; // Bump to force channel recreation
    const channelIds = ['default', 'new-orders', 'order-updates', 'orders', 'delivery'];

    SecureStoreIdx.getItemAsync('notification_channel_version').then(async (storedVersion) => {
      if (storedVersion !== CHANNEL_CONFIG_VERSION) {
        for (const id of channelIds) {
          try { await Notifications.deleteNotificationChannelAsync(id); } catch (_) {}
        }
        await SecureStoreIdx.setItemAsync('notification_channel_version', CHANNEL_CONFIG_VERSION);
        console.log('📱 Notification channels migrated to version', CHANNEL_CONFIG_VERSION);
      }
    }).catch(() => {});

    Notifications.setNotificationChannelAsync('default', {
      name: 'Default Notifications',
      ...channelDefaults,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#267E3E',
    });

    Notifications.setNotificationChannelAsync('new-orders', {
      name: 'New Orders',
      description: 'High priority notifications for new order assignments',
      ...channelDefaults,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#FF0000',
      bypassDnd: true,
    });

    Notifications.setNotificationChannelAsync('order-updates', {
      name: 'Order Updates',
      description: 'Notifications for order status changes',
      ...channelDefaults,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#267E3E',
      bypassDnd: true,
    });

    Notifications.setNotificationChannelAsync('orders', {
      name: 'Order Notifications',
      ...channelDefaults,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#FF0000',
      bypassDnd: true,
    });

    Notifications.setNotificationChannelAsync('delivery', {
      name: 'Delivery Notifications',
      ...channelDefaults,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#267E3E',
    });

    console.log('✅ Notification channels created');
  } catch (error) {
    console.warn('⚠️ Could not create notification channels:', error.message);
  }
}

// ---------------------------------------------------------------------------
// 3. Register the main App component
// ---------------------------------------------------------------------------
registerRootComponent(App);
