import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import api, { setAuthLogoutCallback } from '../config/api';
import pushNotifications from '../services/pushNotifications';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

// Key for tracking if permission has been granted
const NOTIFICATION_PERMISSION_GRANTED_KEY = 'notification_permission_granted';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const permissionCheckInterval = useRef(null);

  // Force logout function (called from API interceptor on 401)
  const forceLogout = useCallback(async () => {
    console.log('🔒 Force logout triggered - session invalidated');
    // unregisterPushToken now has a fallback path that works even when
    // the JWT is expired — it sends the raw push token to a dedicated
    // backend endpoint. We still don't await it to avoid blocking UI.
    pushNotifications.unregisterPushToken().catch(() => {});
    // Clear local auth state immediately
    SecureStore.deleteItemAsync('token').catch(() => {});
    SecureStore.deleteItemAsync('user').catch(() => {});
    SecureStore.deleteItemAsync('role').catch(() => {});
    SecureStore.deleteItemAsync(NOTIFICATION_PERMISSION_GRANTED_KEY).catch(() => {});
    setUser(null);
    setRole(null);
  }, []);

  // Check notification permission and prompt if not granted
  const checkAndPromptNotificationPermission = useCallback(async (userRole) => {
    if (!pushNotifications.isSupported()) return;
    
    const hasPermission = await pushNotifications.hasNotificationPermission();
    
    if (!hasPermission) {
      // Permission not granted, show prompt
      console.log('📱 Notification permission not granted, showing prompt...');
      await registerPushToken(userRole, true); // Force prompt
    } else {
      // Permission granted, ensure token is registered
      const permissionGranted = await SecureStore.getItemAsync(NOTIFICATION_PERMISSION_GRANTED_KEY);
      if (!permissionGranted) {
        await SecureStore.setItemAsync(NOTIFICATION_PERMISSION_GRANTED_KEY, 'true');
      }
      // Re-register token to ensure it's up to date
      await registerPushToken(userRole, false);
    }
  }, []);

  // Handle app state changes - re-register token when coming to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground
        console.log('📱 App came to foreground - checking notification permission');
        
        const storedRole = await SecureStore.getItemAsync('role');
        if (storedRole) {
          // Check permission and prompt if needed
          await checkAndPromptNotificationPermission(storedRole);
          
          // Clear badge count and notifications when app opens
          await pushNotifications.setBadgeCount(0);
          
          // Also tell the backend to reset badge count
          try {
            if (storedRole === 'admin') {
              await api.post('/auth/reset-badge');
            } else {
              await api.post('/delivery/reset-badge');
            }
          } catch (error) {
            console.log('Could not reset badge on server');
          }
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription?.remove();
      if (permissionCheckInterval.current) {
        clearInterval(permissionCheckInterval.current);
      }
    };
  }, [checkAndPromptNotificationPermission]);

  useEffect(() => {
    // Register the logout callback with API interceptor
    setAuthLogoutCallback(forceLogout);
    loadStoredAuth();
    
    return () => {
      setAuthLogoutCallback(null);
    };
  }, [forceLogout]);

  const loadStoredAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const storedUser = await SecureStore.getItemAsync('user');
      const storedRole = await SecureStore.getItemAsync('role');

      if (token && storedUser && storedRole) {
        setUser(JSON.parse(storedUser));
        setRole(storedRole);
        
        // Verify token is still valid
        try {
          if (storedRole === 'admin') {
            await api.get('/auth/verify');
            // Check and register push token for admin
            checkAndPromptNotificationPermission('admin');
          } else {
            await api.get('/delivery/verify');
            // Check and register push token for delivery partner
            checkAndPromptNotificationPermission('delivery');
          }
        } catch (error) {
          await logout();
        }
      }
    } catch (error) {
      console.error('Error loading auth:', error);
    } finally {
      setLoading(false);
    }
  };

  // Refresh user data from server (to get updated rating, etc.)
  const refreshUser = useCallback(async () => {
    try {
      const storedRole = await SecureStore.getItemAsync('role');
      if (!storedRole) return null;
      
      let response;
      if (storedRole === 'delivery') {
        // Use verify endpoint which returns full user data including rating
        response = await api.get('/delivery/verify');
        if (response?.data?.user) {
          const updatedUser = response.data.user;
          setUser(updatedUser);
          await SecureStore.setItemAsync('user', JSON.stringify(updatedUser));
          return updatedUser;
        }
      } else if (storedRole === 'admin') {
        response = await api.get('/auth/verify');
        if (response?.data?.user) {
          const updatedUser = response.data.user;
          setUser(updatedUser);
          await SecureStore.setItemAsync('user', JSON.stringify(updatedUser));
          return updatedUser;
        }
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
    return null;
  }, []);

  // Register push notifications
  const registerPushToken = async (userRole, forcePrompt = false) => {
    try {
      const { token: pushToken, permissionDenied } = await pushNotifications.registerForPushNotifications(false, forcePrompt);
      
      if (permissionDenied) {
        // Permission was denied, will be prompted again on next app foreground
        console.log('📱 Push notification permission denied');
        return false;
      }
      
      if (pushToken) {
        // Mark that permission was granted
        await SecureStore.setItemAsync(NOTIFICATION_PERMISSION_GRANTED_KEY, 'true');
        
        // Send to appropriate endpoint based on role
        if (userRole === 'admin') {
          await api.post('/auth/push-token', { pushToken });
          console.log('📱 Admin push token registered');
        } else {
          await pushNotifications.updatePushToken(pushToken);
          console.log('📱 Delivery push token registered');
        }
        return true;
      }
    } catch (error) {
      console.error('Error registering push token:', error);
    }
    return false;
  };

  const loginAdmin = async (username, password) => {
    const response = await api.post('/auth/login', { username, password });
    const { token, user: userData } = response.data;
    
    await SecureStore.setItemAsync('token', token);
    await SecureStore.setItemAsync('user', JSON.stringify(userData));
    await SecureStore.setItemAsync('role', 'admin');
    
    setUser(userData);
    setRole('admin');
    
    // Register push notifications for admin with force prompt
    registerPushToken('admin', true);
    
    return userData;
  };

  const loginDelivery = async (email, password) => {
    const response = await api.post('/delivery/login', { email, password });
    const { token, user: userData } = response.data;
    
    await SecureStore.setItemAsync('token', token);
    await SecureStore.setItemAsync('user', JSON.stringify(userData));
    await SecureStore.setItemAsync('role', 'delivery');
    
    setUser(userData);
    setRole('delivery');
    
    // Register push notifications for delivery partner with force prompt
    registerPushToken('delivery', true);
    
    return userData;
  };

  const logout = async () => {
    // Unregister push token BEFORE clearing auth token (needs auth header)
    try {
      await pushNotifications.unregisterPushToken();
      console.log('📱 Push token unregistered on logout');
    } catch (error) {
      console.warn('⚠️ Error unregistering push token:', error);
    }
    
    try {
      if (role === 'delivery') {
        await api.post('/delivery/status', { isOnline: false });
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
    
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');
    await SecureStore.deleteItemAsync('role');
    // Clear notification permission flag on logout so it prompts again on next login
    await SecureStore.deleteItemAsync(NOTIFICATION_PERMISSION_GRANTED_KEY);
    
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, loginAdmin, loginDelivery, logout, setUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
