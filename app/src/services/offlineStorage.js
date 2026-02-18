/**
 * Offline Storage Service - Phase 6.10
 * 
 * Purpose: Persist app state and enable offline functionality
 * 
 * Features:
 * - AsyncStorage wrapper with error handling
 * - State persistence
 * - Offline queue for pending actions
 * - Cache management
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const STORAGE_KEYS = {
  USER_DATA: '@user_data',
  AUTH_TOKEN: '@auth_token',
  REFRESH_TOKEN: '@refresh_token',
  CART: '@cart',
  ORDERS: '@orders',
  MENU_CACHE: '@menu_cache',
  CATEGORIES_CACHE: '@categories_cache',
  OFFERS_CACHE: '@offers_cache',
  OFFLINE_QUEUE: '@offline_queue',
  APP_STATE: '@app_state',
  SETTINGS: '@settings',
  LAST_SYNC: '@last_sync',
  FCM_TOKEN: '@fcm_token',
  NOTIFICATION_BADGE: '@notification_badge'
};

/**
 * Save data to storage
 */
export async function saveData(key, value) {
  try {
    const jsonValue = JSON.stringify(value);
    await AsyncStorage.setItem(key, jsonValue);
    console.log(`✅ [Storage] Saved: ${key}`);
    return true;
  } catch (error) {
    console.error(`❌ [Storage] Save error for ${key}:`, error);
    return false;
  }
}

/**
 * Get data from storage
 */
export async function getData(key) {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    if (jsonValue !== null) {
      console.log(`✅ [Storage] Retrieved: ${key}`);
      return JSON.parse(jsonValue);
    }
    return null;
  } catch (error) {
    console.error(`❌ [Storage] Get error for ${key}:`, error);
    return null;
  }
}

/**
 * Remove data from storage
 */
export async function removeData(key) {
  try {
    await AsyncStorage.removeItem(key);
    console.log(`✅ [Storage] Removed: ${key}`);
    return true;
  } catch (error) {
    console.error(`❌ [Storage] Remove error for ${key}:`, error);
    return false;
  }
}

/**
 * Clear all storage
 */
export async function clearAll() {
  try {
    await AsyncStorage.clear();
    console.log('✅ [Storage] Cleared all data');
    return true;
  } catch (error) {
    console.error('❌ [Storage] Clear error:', error);
    return false;
  }
}

/**
 * Save user data
 */
export async function saveUserData(userData) {
  return await saveData(STORAGE_KEYS.USER_DATA, userData);
}

/**
 * Get user data
 */
export async function getUserData() {
  return await getData(STORAGE_KEYS.USER_DATA);
}

/**
 * Save auth tokens
 */
export async function saveAuthTokens(accessToken, refreshToken) {
  await saveData(STORAGE_KEYS.AUTH_TOKEN, accessToken);
  await saveData(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
}

/**
 * Get auth token
 */
export async function getAuthToken() {
  return await getData(STORAGE_KEYS.AUTH_TOKEN);
}

/**
 * Get refresh token
 */
export async function getRefreshToken() {
  return await getData(STORAGE_KEYS.REFRESH_TOKEN);
}

/**
 * Clear auth tokens
 */
export async function clearAuthTokens() {
  await removeData(STORAGE_KEYS.AUTH_TOKEN);
  await removeData(STORAGE_KEYS.REFRESH_TOKEN);
}

/**
 * Save cart
 */
export async function saveCart(cart) {
  return await saveData(STORAGE_KEYS.CART, cart);
}

/**
 * Get cart
 */
export async function getCart() {
  return await getData(STORAGE_KEYS.CART) || [];
}

/**
 * Clear cart
 */
export async function clearCart() {
  return await removeData(STORAGE_KEYS.CART);
}

/**
 * Save orders
 */
export async function saveOrders(orders) {
  return await saveData(STORAGE_KEYS.ORDERS, orders);
}

/**
 * Get orders
 */
export async function getOrders() {
  return await getData(STORAGE_KEYS.ORDERS) || [];
}

/**
 * Cache menu items
 */
export async function cacheMenu(menu) {
  await saveData(STORAGE_KEYS.MENU_CACHE, menu);
  await saveData(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
}

/**
 * Get cached menu
 */
export async function getCachedMenu() {
  return await getData(STORAGE_KEYS.MENU_CACHE);
}

/**
 * Cache categories
 */
export async function cacheCategories(categories) {
  return await saveData(STORAGE_KEYS.CATEGORIES_CACHE, categories);
}

/**
 * Get cached categories
 */
export async function getCachedCategories() {
  return await getData(STORAGE_KEYS.CATEGORIES_CACHE);
}

/**
 * Cache offers
 */
export async function cacheOffers(offers) {
  return await saveData(STORAGE_KEYS.OFFERS_CACHE, offers);
}

/**
 * Get cached offers
 */
export async function getCachedOffers() {
  return await getData(STORAGE_KEYS.OFFERS_CACHE);
}

/**
 * Add action to offline queue
 */
export async function addToOfflineQueue(action) {
  try {
    const queue = await getData(STORAGE_KEYS.OFFLINE_QUEUE) || [];
    queue.push({
      ...action,
      timestamp: new Date().toISOString(),
      id: Date.now().toString()
    });
    await saveData(STORAGE_KEYS.OFFLINE_QUEUE, queue);
    console.log(`✅ [Storage] Added to offline queue: ${action.type}`);
    return true;
  } catch (error) {
    console.error('❌ [Storage] Offline queue error:', error);
    return false;
  }
}

/**
 * Get offline queue
 */
export async function getOfflineQueue() {
  return await getData(STORAGE_KEYS.OFFLINE_QUEUE) || [];
}

/**
 * Clear offline queue
 */
export async function clearOfflineQueue() {
  return await removeData(STORAGE_KEYS.OFFLINE_QUEUE);
}

/**
 * Remove item from offline queue
 */
export async function removeFromOfflineQueue(id) {
  try {
    const queue = await getData(STORAGE_KEYS.OFFLINE_QUEUE) || [];
    const updatedQueue = queue.filter(item => item.id !== id);
    await saveData(STORAGE_KEYS.OFFLINE_QUEUE, updatedQueue);
    return true;
  } catch (error) {
    console.error('❌ [Storage] Remove from queue error:', error);
    return false;
  }
}

/**
 * Save app state
 */
export async function saveAppState(state) {
  return await saveData(STORAGE_KEYS.APP_STATE, state);
}

/**
 * Get app state
 */
export async function getAppState() {
  return await getData(STORAGE_KEYS.APP_STATE);
}

/**
 * Save settings
 */
export async function saveSettings(settings) {
  return await saveData(STORAGE_KEYS.SETTINGS, settings);
}

/**
 * Get settings
 */
export async function getSettings() {
  return await getData(STORAGE_KEYS.SETTINGS) || {
    notifications: true,
    sound: true,
    vibration: true,
    theme: 'light'
  };
}

/**
 * Get last sync time
 */
export async function getLastSync() {
  return await getData(STORAGE_KEYS.LAST_SYNC);
}

/**
 * Check if cache is stale (older than 5 minutes)
 */
export async function isCacheStale() {
  const lastSync = await getLastSync();
  if (!lastSync) return true;
  
  const lastSyncTime = new Date(lastSync).getTime();
  const now = new Date().getTime();
  const fiveMinutes = 5 * 60 * 1000;
  
  return (now - lastSyncTime) > fiveMinutes;
}

/**
 * Save FCM token
 */
export async function saveFCMToken(token) {
  return await saveData(STORAGE_KEYS.FCM_TOKEN, token);
}

/**
 * Get FCM token
 */
export async function getFCMToken() {
  return await getData(STORAGE_KEYS.FCM_TOKEN);
}

/**
 * Save notification badge count
 */
export async function saveNotificationBadge(count) {
  return await saveData(STORAGE_KEYS.NOTIFICATION_BADGE, count);
}

/**
 * Get notification badge count
 */
export async function getNotificationBadge() {
  return await getData(STORAGE_KEYS.NOTIFICATION_BADGE) || 0;
}

/**
 * Increment notification badge
 */
export async function incrementNotificationBadge() {
  const count = await getNotificationBadge();
  await saveNotificationBadge(count + 1);
  return count + 1;
}

/**
 * Clear notification badge
 */
export async function clearNotificationBadge() {
  return await saveData(STORAGE_KEYS.NOTIFICATION_BADGE, 0);
}

/**
 * Get storage info
 */
export async function getStorageInfo() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const items = await AsyncStorage.multiGet(keys);
    
    let totalSize = 0;
    const itemSizes = items.map(([key, value]) => {
      const size = new Blob([value]).size;
      totalSize += size;
      return { key, size };
    });
    
    return {
      totalKeys: keys.length,
      totalSize: totalSize,
      items: itemSizes
    };
  } catch (error) {
    console.error('❌ [Storage] Get info error:', error);
    return null;
  }
}

export { STORAGE_KEYS };
