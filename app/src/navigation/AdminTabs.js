import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, TouchableOpacity, Platform, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNotifications } from '../context/NotificationContext';

import AdminHomeScreen from '../screens/admin/AdminHomeScreen';
import AdminOrdersScreen from '../screens/admin/AdminOrdersScreen';
import AdminMenuScreen from '../screens/admin/AdminMenuScreen';
import AdminReportsScreen from '../screens/admin/AdminReportsScreen';
import AdminDeliveryScreen from '../screens/admin/AdminDeliveryScreen';
import OrderDetailScreen from '../screens/admin/OrderDetailScreen';
import MenuItemFormScreen from '../screens/admin/MenuItemFormScreen';
import DeliveryFormScreen from '../screens/admin/DeliveryFormScreen';
import AdminOffersScreen from '../screens/admin/AdminOffersScreen';
import OfferFormScreen from '../screens/admin/OfferFormScreen';
import ReportDetailScreen from '../screens/admin/ReportDetailScreen';
import NotificationsScreen from '../screens/admin/NotificationsScreen';
import OrderHistoryScreen from '../screens/admin/OrderHistoryScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Admin primary colors
const ADMIN_PRIMARY = '#E23744';
const ADMIN_DARK = '#CB1A27';

// Shared stack screen options with gestures enabled
const stackScreenOptions = {
  headerShown: false,
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  animation: 'slide_from_right',
  fullScreenGestureEnabled: true, // iOS full screen swipe
};

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="HomeMain" component={AdminHomeScreen} />
      <Stack.Screen name="ReportDetail" component={ReportDetailScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}

function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="OrdersList" component={AdminOrdersScreen} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
      <Stack.Screen name="OrderHistory" component={OrderHistoryScreen} />
    </Stack.Navigator>
  );
}

function MenuStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="MenuList" component={AdminMenuScreen} />
      <Stack.Screen name="MenuItemForm" component={MenuItemFormScreen} />
    </Stack.Navigator>
  );
}

function DeliveryStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="DeliveryList" component={AdminDeliveryScreen} />
      <Stack.Screen name="DeliveryForm" component={DeliveryFormScreen} />
    </Stack.Navigator>
  );
}

function OffersStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="OffersList" component={AdminOffersScreen} />
      <Stack.Screen name="OfferForm" component={OfferFormScreen} />
    </Stack.Navigator>
  );
}

// Custom center button component
const CenterTabButton = ({ children, onPress }) => (
  <TouchableOpacity
    style={styles.centerButtonContainer}
    onPress={onPress}
    activeOpacity={0.9}
  >
    <LinearGradient
      colors={[ADMIN_PRIMARY, ADMIN_DARK]}
      style={styles.centerButton}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {children}
    </LinearGradient>
  </TouchableOpacity>
);

// Custom Tab Bar Component
const CustomTabBar = ({ state, descriptors, navigation }) => {
  const { newOrdersCount, clearNewOrdersCount, offerTemplateAlert, clearOfferTemplateAlert } = useNotifications();
  
  // Check if we should hide the tab bar on detail screens
  const currentRoute = state.routes[state.index];
  const focusedRouteName = getFocusedRouteNameFromRoute(currentRoute);
  
  // Hide tab bar on Menu tab entirely and on specific detail screens
  if (currentRoute.name === 'Menu') {
    return null;
  }
  
  // Hide tab bar on these screens
  const hideOnScreens = ['ReportDetail', 'OrderDetail', 'OfferForm', 'DeliveryForm', 'Notifications'];
  if (hideOnScreens.includes(focusedRouteName)) {
    return null;
  }

  return (
    <View style={styles.tabBarWrapper}>
      <View style={styles.tabBarContainer}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const isCenter = index === 2; // Menu is the center tab
          const isOrders = route.name === 'Orders';
          const isOffers = route.name === 'Offers';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!event.defaultPrevented) {
              // Reset stack to first screen when tab is pressed
              if (route.name === 'Menu') {
                // Reset filters when Menu tab is clicked directly
                navigation.navigate(route.name, {
                  screen: 'MenuList',
                  params: { foodTypeFilter: 'all', resetFilters: true }
                });
              } else {
                navigation.navigate(route.name, {
                  screen: route.name === 'Orders' ? 'OrdersList' : 
                          route.name === 'Home' ? 'HomeMain' :
                          route.name === 'Offers' ? 'OffersList' :
                          route.name === 'Delivery' ? 'DeliveryList' : undefined
                });
              }
            }
            
            // Clear new orders count when Orders tab is pressed
            if (isOrders && newOrdersCount > 0) {
              clearNewOrdersCount();
            }
            // Clear offer template alert when Offers tab is pressed
            if (isOffers && offerTemplateAlert) {
              clearOfferTemplateAlert();
            }
          };

          let iconName;
          if (route.name === 'Home') iconName = isFocused ? 'home' : 'home-outline';
          else if (route.name === 'Orders') iconName = isFocused ? 'receipt' : 'receipt-outline';
          else if (route.name === 'Menu') iconName = 'restaurant';
          else if (route.name === 'Offers') iconName = isFocused ? 'pricetag' : 'pricetag-outline';
          else if (route.name === 'Delivery') iconName = isFocused ? 'bicycle' : 'bicycle-outline';

          if (isCenter) {
            return (
              <CenterTabButton key={route.key} onPress={onPress}>
                <Ionicons name={iconName} size={26} color="#fff" />
              </CenterTabButton>
            );
          }

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={styles.tabButton}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrapper, isFocused && styles.iconWrapperActive]}>
                <Ionicons
                  name={iconName}
                  size={22}
                  color={isFocused ? ADMIN_PRIMARY : '#9CA3AF'}
                />
                {isOrders && newOrdersCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {newOrdersCount > 99 ? '99+' : newOrdersCount}
                    </Text>
                  </View>
                )}
                {isOffers && offerTemplateAlert && (
                  <View style={[
                    styles.statusDot,
                    { backgroundColor: offerTemplateAlert === 'approved' ? '#22C55E' : '#EF4444' }
                  ]} />
                )}
              </View>
              <View style={[styles.labelContainer, isFocused && styles.labelContainerActive]}>
                <View style={styles.labelDot} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default function AdminTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Orders" component={OrdersStack} />
      <Tab.Screen name="Menu" component={MenuStack} />
      <Tab.Screen name="Offers" component={OffersStack} />
      <Tab.Screen name="Delivery" component={DeliveryStack} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 28,
    height: 70,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapperActive: {
    backgroundColor: '#FEF2F2',
  },
  labelContainer: {
    marginTop: 4,
    opacity: 0,
  },
  labelContainerActive: {
    opacity: 1,
  },
  labelDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: ADMIN_PRIMARY,
  },
  centerButtonContainer: {
    top: -20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: ADMIN_PRIMARY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: ADMIN_PRIMARY,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  statusDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});
