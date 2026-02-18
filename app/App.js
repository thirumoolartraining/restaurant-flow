import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { DeliveryNotificationProvider } from './src/context/DeliveryNotificationContext';
import RoleSelectScreen from './src/screens/RoleSelectScreen';
import AdminLoginScreen from './src/screens/admin/AdminLoginScreen';
import DeliveryLoginScreen from './src/screens/delivery/DeliveryLoginScreen';
import AdminTabs from './src/navigation/AdminTabs';
import DeliveryTabs from './src/navigation/DeliveryTabs';
import pushNotifications from './src/services/pushNotifications';
import preloadImages from './src/utils/imagePreloader';

const Stack = createNativeStackNavigator();

function AppNavigator({ navigationRef }) {
  const { user, role, loading } = useAuth();
  const roleRef = useRef(role);
  const isNavigationReady = useRef(false);
  const pendingNotificationNav = useRef(null);
  const initialNotificationChecked = useRef(false);

  // Keep roleRef in sync so callbacks always have the latest value
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  // Called from NavigationContainer onReady (passed up via parent)
  // and also when we detect the nav is likely ready
  const onNavigationReady = useCallback(() => {
    isNavigationReady.current = true;
    // If a notification navigation was pending, execute it now
    if (pendingNotificationNav.current) {
      const navFn = pendingNotificationNav.current;
      pendingNotificationNav.current = null;
      navFn();
    }
  }, []);

  // Navigate based on notification data, using latest role from ref
  const navigateFromNotification = useCallback((data) => {
    const currentRole = roleRef.current;
    const nav = navigationRef?.current;
    if (!nav || !currentRole) {
      console.log('📱 Navigation not ready or role unknown, queuing notification nav');
      pendingNotificationNav.current = () => navigateFromNotification(data);
      return;
    }

    try {
      if (currentRole === 'delivery') {
        nav.navigate('DeliveryMain', {
          screen: 'Home',
          params: { screen: 'Notifications' },
        });
      } else if (currentRole === 'admin') {
        if (data?.type === 'offer_template_status') {
          nav.navigate('AdminMain', {
            screen: 'Offers',
            params: { screen: 'OffersList' },
          });
        } else if (data?.screen === 'Orders' || data?.type === 'new_order' || data?.type === 'order_cancelled') {
          nav.navigate('AdminMain', {
            screen: 'Orders',
            params: { screen: 'OrdersList' },
          });
        } else {
          nav.navigate('AdminMain', {
            screen: 'Home',
            params: { screen: 'Notifications' },
          });
        }
      }
    } catch (e) {
      console.warn('📱 Navigation from notification failed:', e.message);
    }
  }, [navigationRef]);

  // Set up notification listeners (run once)
  useEffect(() => {
    let responseSubscription = null;
    let receivedSubscription = null;
    let fcmUnsubscribe = null;

    if (!pushNotifications.isSupported()) return;

    // Handle notification tap — navigate to appropriate screen
    responseSubscription = pushNotifications.addNotificationResponseListener(response => {
      const data = response.notification.request.content.data;
      console.log('📱 Notification tapped:', data);
      navigateFromNotification(data);
    });

    // Handle expo-notifications received while app is open (foreground)
    receivedSubscription = pushNotifications.addNotificationReceivedListener(notification => {
      console.log('📱 Notification received in foreground:', notification.request.content);
    });

    /**
     * FCM foreground message handler.
     * When app is in foreground, Firebase SDK intercepts the notification
     * payload and does NOT show it in the notification tray automatically.
     * We create a local notification via expo-notifications to display it,
     * using the correct channel from the data payload so the notification
     * inherits the right sound / vibration / priority settings.
     */
    try {
      const messaging = require('@react-native-firebase/messaging').default;
      fcmUnsubscribe = messaging().onMessage(async remoteMessage => {
        console.log('📱 [FCM] Foreground message:', JSON.stringify(remoteMessage));

        const { notification, data } = remoteMessage;
        if (notification) {
          const channelId = data?.channelId || 'default';

          try {
            // Display as local notification via expo-notifications
            const Notifications = require('expo-notifications');
            await Notifications.scheduleNotificationAsync({
              content: {
                title: notification.title || 'New Notification',
                body: notification.body || '',
                data: data || {},
                // Use 'default' string — expo-notifications recognises this as
                // the system default notification sound on both platforms.
                // Boolean `true` may not be recognised and can result in silent
                // notifications on some Android versions.
                sound: 'default',
                priority: Notifications.AndroidNotificationPriority.MAX,
                ...(Platform.OS === 'android' ? { channelId } : {}),
              },
              trigger: null, // Immediate
            });

            // Update badge count
            if (data?.badgeCount) {
              try {
                await Notifications.setBadgeCountAsync(parseInt(data.badgeCount, 10));
              } catch (_) { /* non-critical */ }
            }
          } catch (e) {
            console.warn('📱 Failed to display foreground notification:', e.message);
          }
        }
      });
    } catch (e) {
      console.warn('⚠️ FCM onMessage not available:', e.message);
    }

    return () => {
      if (responseSubscription) {
        pushNotifications.removeNotificationListener(responseSubscription);
      }
      if (receivedSubscription) {
        pushNotifications.removeNotificationListener(receivedSubscription);
      }
      if (fcmUnsubscribe) {
        fcmUnsubscribe();
      }
    };
  }, [navigateFromNotification]);

  // Check initial notification ONLY after auth is loaded and role is known.
  // getInitialNotification() can only be consumed once so we must not call
  // it until we are actually ready to navigate.
  useEffect(() => {
    if (loading || !role || initialNotificationChecked.current) return;
    initialNotificationChecked.current = true;

    const checkInitialNotification = async () => {
      try {
        // First check expo-notifications (for local notifications)
        const response = await pushNotifications.getLastNotificationResponse();
        if (response) {
          const data = response.notification.request.content.data;
          console.log('📱 App opened from expo notification:', data);
          navigateFromNotification(data);
          return;
        }

        // Then check Firebase initial notification (killed state opens)
        const messaging = require('@react-native-firebase/messaging').default;
        const remoteMessage = await messaging().getInitialNotification();
        if (remoteMessage) {
          console.log('📱 App opened from FCM notification (killed state):', remoteMessage.data);
          navigateFromNotification(remoteMessage.data);
        }
      } catch (e) {
        console.warn('📱 checkInitialNotification error:', e.message);
      }
    };

    // Small delay to let navigation tree finish mounting
    setTimeout(checkInitialNotification, 300);
  }, [loading, role, navigateFromNotification]);

  // Notify parent when navigation is ready (called via onLayout of the
  // first real screen render after auth resolves)
  useEffect(() => {
    if (!loading && user && role) {
      // Navigation tree with the correct screens is now mounted
      // Wait a tick for the navigator to fully initialise
      const t = setTimeout(onNavigationReady, 100);
      return () => clearTimeout(t);
    }
  }, [loading, user, role, onNavigationReady]);

  if (loading) {
    return null;
  }

  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        animation: 'slide_from_right',
        fullScreenGestureEnabled: true,
      }}
    >
      {!user ? (
        <>
          <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
          <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
          <Stack.Screen name="DeliveryLogin" component={DeliveryLoginScreen} />
        </>
      ) : role === 'admin' ? (
        <Stack.Screen name="AdminMain" component={AdminTabs} />
      ) : (
        <Stack.Screen name="DeliveryMain" component={DeliveryTabs} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const navigationRef = useRef(null);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  useEffect(() => {
    const loadAssets = async () => {
      await preloadImages();
      setImagesLoaded(true);
    };
    loadAssets();
  }, []);

  // Show loading screen while images are preloading
  if (!imagesLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <NotificationProvider>
          <DeliveryNotificationProvider>
            <NavigationContainer ref={navigationRef}>
              <StatusBar style="light" />
              <AppNavigator navigationRef={navigationRef} />
            </NavigationContainer>
          </DeliveryNotificationProvider>
        </NotificationProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
});
