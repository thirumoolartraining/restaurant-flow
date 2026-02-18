import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import api from '../config/api';
import pushNotifications from '../services/pushNotifications';

const DeliveryNotificationContext = createContext();

const STORAGE_KEY = 'delivery_notifications';
const LAST_CHECK_KEY = 'delivery_last_check_time';
const SEEN_ORDERS_KEY = 'delivery_seen_orders';
const POLL_INTERVAL = 5000; // 5 seconds for real-time updates
const HEARTBEAT_INTERVAL = 30000; // 30 seconds for heartbeat

export function DeliveryNotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const lastCheckTime = useRef(null);
  const seenOrderStatuses = useRef({});
  const seenAssignedOrders = useRef(new Set());
  const isInitialized = useRef(false);
  const pollIntervalRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const appState = useRef(AppState.currentState);

  // Check if user is authenticated before making API calls
  const isAuthenticated = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const role = await SecureStore.getItemAsync('role');
      return token && role === 'delivery';
    } catch {
      return false;
    }
  };

  // Send heartbeat to server to indicate app is open
  const sendHeartbeat = async () => {
    const authenticated = await isAuthenticated();
    if (!authenticated) return;
    
    try {
      await api.post('/delivery/heartbeat');
    } catch (error) {
      // Silently fail - don't spam console
    }
  };

  // Load data from storage on mount
  useEffect(() => {
    loadData();
    
    // Start polling when component mounts (will check auth before API calls)
    startPolling();
    startHeartbeat();
    
    // Send initial heartbeat
    sendHeartbeat();
    
    // Handle app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      stopPolling();
      stopHeartbeat();
      subscription?.remove();
    };
  }, []);

  const handleAppStateChange = async (nextAppState) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground - send heartbeat, check updates, restart polling
      sendHeartbeat();
      checkForUpdates();
      startPolling();
      startHeartbeat();
    } else if (nextAppState.match(/inactive|background/)) {
      // App went to background - stop polling and heartbeat
      stopPolling();
      stopHeartbeat();
    }
    appState.current = nextAppState;
  };

  const startPolling = () => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(() => {
      if (isInitialized.current) {
        checkForUpdates();
      }
    }, POLL_INTERVAL);
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startHeartbeat = () => {
    if (heartbeatIntervalRef.current) return;
    heartbeatIntervalRef.current = setInterval(() => {
      if (isInitialized.current) {
        sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL);
  };

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  const loadData = async () => {
    try {
      const [storedNotifications, storedLastCheck, storedSeenOrders] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEY),
        SecureStore.getItemAsync(LAST_CHECK_KEY),
        SecureStore.getItemAsync(SEEN_ORDERS_KEY)
      ]);
      
      if (storedNotifications) {
        const parsed = JSON.parse(storedNotifications);
        setNotifications(parsed);
        setUnreadCount(parsed.filter(n => !n.read).length);
      }
      
      if (storedLastCheck) {
        lastCheckTime.current = new Date(storedLastCheck);
      } else {
        lastCheckTime.current = new Date();
        await SecureStore.setItemAsync(LAST_CHECK_KEY, new Date().toISOString());
      }
      
      if (storedSeenOrders) {
        const parsed = JSON.parse(storedSeenOrders);
        seenOrderStatuses.current = parsed.statuses || {};
        seenAssignedOrders.current = new Set(parsed.assigned || []);
      }
      
      isInitialized.current = true;
    } catch (error) {
      console.error('Error loading delivery notification data:', error);
      lastCheckTime.current = new Date();
      isInitialized.current = true;
    }
  };

  const saveNotifications = async (newNotifications) => {
    try {
      const trimmed = newNotifications.slice(0, 30);
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (error) {
      console.error('Error saving delivery notifications:', error);
    }
  };

  const saveSeenOrders = async () => {
    try {
      const data = {
        statuses: seenOrderStatuses.current,
        assigned: Array.from(seenAssignedOrders.current).slice(-50)
      };
      await SecureStore.setItemAsync(SEEN_ORDERS_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving seen orders:', error);
    }
  };

  // Show local push notification (only when app is in background/inactive)
  // When app is in foreground, FCM onMessage handler in App.js already displays the notification
  const showLocalNotification = async (title, body, data = {}) => {
    if (appState.current === 'active') {
      console.log('📱 Skipping local notification (app is foreground, FCM handles it):', title);
      return;
    }
    if (pushNotifications.isSupported()) {
      try {
        await pushNotifications.scheduleLocalNotification(title, body, data);
      } catch (error) {
        console.error('Error showing local notification:', error);
      }
    }
  };

  // Check for new assigned orders and status changes
  const checkForUpdates = useCallback(async () => {
    if (!isInitialized.current) return;
    
    // Skip if not authenticated as delivery user
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return { hasNewOrders: false, orders: [] };
    }
    
    try {
      // Get delivery partner's assigned orders (active + recently cancelled)
      const [myOrdersResponse, historyResponse] = await Promise.all([
        api.get('/delivery/orders/my'),
        api.get('/delivery/orders/history')
      ]);
      
      const activeOrders = myOrdersResponse.data || [];
      const historyOrders = (historyResponse.data || []).slice(0, 10); // Only check recent 10
      const allOrders = [...activeOrders, ...historyOrders];
      
      // Build a map of current order statuses for quick lookup
      const currentOrderStatusMap = {};
      allOrders.forEach(order => {
        currentOrderStatusMap[order.orderId] = {
          status: order.status,
          amount: order.totalAmount,
          address: order.deliveryAddress?.address || ''
        };
      });
      
      const newNotifications = [];
      const updatedExisting = []; // Track orderId updates to existing notifications
      const now = new Date();
      let newAssignments = 0;
      
      for (const order of allOrders) {
        const orderId = order.orderId;
        const previousStatus = seenOrderStatuses.current[orderId];
        const wasAssigned = seenAssignedOrders.current.has(orderId);
        
        // Check for NEW ASSIGNED orders (not seen before)
        if (!wasAssigned && order.status !== 'delivered' && order.status !== 'cancelled') {
          newAssignments++;
          const notification = {
            id: `order_${orderId}`,
            type: 'new_assignment',
            title: 'New Order Assigned! 🚴',
            message: `Order #${orderId} - ₹${order.totalAmount}`,
            orderId: orderId,
            amount: order.totalAmount,
            address: order.deliveryAddress?.address || '',
            timestamp: new Date().toISOString(),
            read: false,
            icon: 'bicycle',
            color: '#F59E0B'
          };
          newNotifications.push(notification);
          seenAssignedOrders.current.add(orderId);
          
          // Show local push notification for new assignment
          showLocalNotification(
            notification.title,
            `${notification.message}\n📍 ${notification.address || 'Delivery'}`,
            { type: 'new_order', orderId: orderId, screen: 'MyOrders' }
          );
        }
        
        // Check for STATUS CHANGES (cancelled by customer or delivered)
        if (previousStatus && previousStatus !== order.status) {
          if (order.status === 'cancelled' || order.status === 'refunded') {
            const notification = {
              id: `order_${orderId}`,
              type: 'order_cancelled',
              title: 'Order Cancelled ❌',
              message: `Order #${orderId} was cancelled`,
              orderId: orderId,
              timestamp: new Date().toISOString(),
              read: false,
              icon: 'close-circle',
              color: '#EF4444'
            };
            // Mark as update to existing notification for same order
            updatedExisting.push(notification);
            
            // Show local push notification for cancellation
            showLocalNotification(
              notification.title,
              notification.message,
              { type: 'order_cancelled', orderId: orderId, screen: 'MyOrders' }
            );
          } else if (order.status === 'delivered' && previousStatus === 'out_for_delivery') {
            const notification = {
              id: `order_${orderId}`,
              type: 'order_delivered',
              title: 'Order Delivered ✅',
              message: `Order #${orderId} - ₹${order.totalAmount} delivered successfully!`,
              orderId: orderId,
              amount: order.totalAmount,
              timestamp: new Date().toISOString(),
              read: false,
              icon: 'checkmark-circle',
              color: '#22C55E'
            };
            // Mark as update to existing notification for same order
            updatedExisting.push(notification);
            
            // Show local push notification for delivery
            showLocalNotification(
              notification.title,
              notification.message,
              { type: 'order_delivered', orderId: orderId, screen: 'History' }
            );
          }
        }
        
        // Update seen status
        seenOrderStatuses.current[orderId] = order.status;
      }
      
      // Save the current check time and seen orders
      lastCheckTime.current = now;
      await SecureStore.setItemAsync(LAST_CHECK_KEY, now.toISOString());
      await saveSeenOrders();
      
      // Update existing notifications with current order status
      // This ensures notification list always shows latest order info
      setNotifications(prev => {
        let hasUpdates = false;
        const updatedNotifications = prev.map(notification => {
          if (notification.orderId && currentOrderStatusMap[notification.orderId]) {
            const currentOrder = currentOrderStatusMap[notification.orderId];
            const currentStatus = currentOrder.status;
            
            // Update notification based on current order status
            let updatedNotification = { ...notification };
            
            // If order is now cancelled but notification shows different status
            if ((currentStatus === 'cancelled' || currentStatus === 'refunded') && 
                notification.type !== 'order_cancelled') {
              updatedNotification = {
                ...notification,
                type: 'order_cancelled',
                title: 'Order Cancelled ❌',
                message: `Order #${notification.orderId} was cancelled`,
                icon: 'close-circle',
                color: '#EF4444'
              };
              hasUpdates = true;
            }
            // If order is now delivered but notification shows different status
            else if (currentStatus === 'delivered' && notification.type !== 'order_delivered') {
              updatedNotification = {
                ...notification,
                type: 'order_delivered',
                title: 'Order Delivered ✅',
                message: `Order #${notification.orderId} - ₹${currentOrder.amount} delivered successfully!`,
                icon: 'checkmark-circle',
                color: '#22C55E'
              };
              hasUpdates = true;
            }
            // Update amount/address if changed for assignment notifications
            else if (notification.type === 'new_assignment') {
              if (notification.amount !== currentOrder.amount || 
                  notification.address !== currentOrder.address) {
                updatedNotification = {
                  ...notification,
                  amount: currentOrder.amount,
                  address: currentOrder.address,
                  message: `Order #${notification.orderId} - ₹${currentOrder.amount}`
                };
                hasUpdates = true;
              }
            }
            
            return updatedNotification;
          }
          return notification;
        });
        
        // Only save if there were actual updates
        if (hasUpdates) {
          saveNotifications(updatedNotifications);
        }
        
        // Apply status-change updates to existing notifications (same orderId)
        if (updatedExisting.length > 0) {
          const updateMap = {};
          updatedExisting.forEach(n => { updateMap[n.orderId] = n; });
          
          updatedNotifications = updatedNotifications.map(notification => {
            if (notification.orderId && updateMap[notification.orderId]) {
              hasUpdates = true;
              return { ...updateMap[notification.orderId], read: false, timestamp: new Date().toISOString() };
            }
            return notification;
          });
          
          // Add any that didn't match existing notifications
          const existingOrderIds = new Set(updatedNotifications.map(n => n.orderId));
          const trulyNew = updatedExisting.filter(n => !existingOrderIds.has(n.orderId));
          if (trulyNew.length > 0) {
            updatedNotifications = [...trulyNew, ...updatedNotifications];
            hasUpdates = true;
          }
        }
        
        // Add genuinely new notifications (new assignments not already in list)
        if (newNotifications.length > 0) {
          const existingOrderIds = new Set(updatedNotifications.map(n => n.orderId));
          const trulyNewNotifications = newNotifications.filter(n => !existingOrderIds.has(n.orderId));
          
          const finalNotifications = [...trulyNewNotifications, ...updatedNotifications];
          saveNotifications(finalNotifications);
          return finalNotifications;
        }
        
        if (hasUpdates) {
          saveNotifications(updatedNotifications);
        }
        return hasUpdates ? updatedNotifications : prev;
      });
      
      // Update unread count for new notifications
      if (newNotifications.length > 0) {
        console.log('📱 New delivery notifications:', newNotifications.length);
        setUnreadCount(prev => prev + newNotifications.length);
        
        // Count cancelled orders for badge
        const cancelledCount = newNotifications.filter(n => n.type === 'order_cancelled').length;
        const totalBadgeCount = newAssignments + cancelledCount;
        
        if (totalBadgeCount > 0) {
          setNewOrdersCount(prev => prev + totalBadgeCount);
        }
      }
      
      return { hasNewOrders: newAssignments > 0, orders: activeOrders };
    } catch (error) {
      // Silently handle errors - don't spam console
      if (error.response?.status !== 404) {
        console.error('Error checking for delivery updates:', error.message);
      }
      return { hasNewOrders: false, orders: [] };
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      saveNotifications(updated);
      return updated;
    });
    setUnreadCount(0);
  }, []);

  // Mark single notification as read
  const markAsRead = useCallback((notificationId) => {
    setNotifications(prev => {
      const updated = prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      );
      saveNotifications(updated);
      return updated;
    });
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    await pushNotifications.clearAllNotifications();
  }, []);

  // Reset tracking
  const resetTracking = useCallback(async () => {
    lastCheckTime.current = new Date();
    seenOrderStatuses.current = {};
    seenAssignedOrders.current = new Set();
    await SecureStore.deleteItemAsync(LAST_CHECK_KEY);
    await SecureStore.deleteItemAsync(SEEN_ORDERS_KEY);
    setNotifications([]);
    setUnreadCount(0);
    setNewOrdersCount(0);
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    await pushNotifications.clearAllNotifications();
  }, []);

  // Clear new orders count (called when MyOrders screen is viewed)
  const clearNewOrdersCount = useCallback(() => {
    setNewOrdersCount(0);
  }, []);

  return (
    <DeliveryNotificationContext.Provider value={{
      notifications,
      unreadCount,
      newOrdersCount,
      checkForUpdates,
      markAllAsRead,
      markAsRead,
      clearAll,
      resetTracking,
      clearNewOrdersCount
    }}>
      {children}
    </DeliveryNotificationContext.Provider>
  );
}

export function useDeliveryNotifications() {
  const context = useContext(DeliveryNotificationContext);
  if (!context) {
    throw new Error('useDeliveryNotifications must be used within a DeliveryNotificationProvider');
  }
  return context;
}
