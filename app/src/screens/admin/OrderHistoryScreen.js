import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  StatusBar,
  ImageBackground,
  Animated,
  ActivityIndicator,
  RefreshControl,
  Platform,
  InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import api from '../../config/api';

// Status colors matching AdminOrdersScreen
const STATUS_CONFIG = {
  delivered: { color: '#2ecc71', bgColor: 'rgba(46, 204, 113, 0.1)', label: 'Delivered', icon: 'checkmark-circle' },
  cancelled: { color: '#e74c3c', bgColor: 'rgba(231, 76, 60, 0.1)', label: 'Cancelled', icon: 'close-circle' },
};

const PAYMENT_STATUS_CONFIG = {
  paid: { color: '#2ecc71', label: 'Paid', icon: 'checkmark-circle' },
  'upi/app': { color: '#3498db', label: 'UPI/App', icon: 'card-outline' },
  'paid (upi)': { color: '#2ecc71', label: 'Paid (UPI)', icon: 'checkmark-circle' },
  'paid (cash)': { color: '#2ecc71', label: 'Paid (Cash)', icon: 'checkmark-circle' },
  'paid at hotel': { color: '#2ecc71', label: 'Paid at Hotel', icon: 'checkmark-circle' },
  unpaid: { color: '#e74c3c', label: 'Unpaid', icon: 'close-circle' },
  refunded: { color: '#9b59b6', label: 'Refunded', icon: 'refresh-circle' },
  pending: { color: '#f39c12', label: 'Pending', icon: 'time' },
  cod: { color: '#2ecc71', label: 'COD Paid', icon: 'checkmark-circle' },
  // Cancelled order payment statuses
  'cancelled_upi': { color: '#e74c3c', label: 'UPI/App', icon: 'card-outline' },
  'cancelled_payathotel': { color: '#e74c3c', label: 'Pay at Hotel', icon: 'cash-outline' },
  'cancelled_cod': { color: '#e74c3c', label: 'COD', icon: 'cash-outline' },
  'cancelled': { color: '#e74c3c', label: 'Cancelled', icon: 'close-circle' },
};

// Static cache to persist data across screen navigation
let historyCache = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 60000; // 60 seconds

const OrderHistoryScreen = ({ navigation }) => {
  const [allOrders, setAllOrders] = useState(historyCache); // Full data from API
  const [displayCount, setDisplayCount] = useState(15); // How many to show (for virtual pagination)
  const [loading, setLoading] = useState(historyCache.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loadingMore, setLoadingMore] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  const shineAnim = useRef(new Animated.Value(-1)).current;
  const flatListRef = useRef(null);
  
  // Filter orders based on search and status
  const filteredOrders = useMemo(() => {
    let filtered = allOrders;
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter);
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(order => 
        order.orderId?.toLowerCase().includes(query) ||
        order.customerName?.toLowerCase().includes(query) ||
        order.phone?.includes(query) ||
        order.items?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [allOrders, statusFilter, searchQuery]);
  
  // Get visible orders for display (virtual pagination)
  const visibleOrders = useMemo(() => {
    return filteredOrders.slice(0, displayCount);
  }, [filteredOrders, displayCount]);
  
  const hasMore = displayCount < filteredOrders.length;
  
  // Fetch menu items for image matching
  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        const response = await api.get('/menu');
        setMenuItems(response.data || []);
      } catch (error) {
        console.error('Error fetching menu items:', error);
      }
    };
    fetchMenuItems();
  }, []);
  
  useEffect(() => {
    const runShineAnimation = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(shineAnim, {
            toValue: -1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.delay(4000),
        ])
      ).start();
    };
    runShineAnimation();
  }, []);

  // Fetch all history data from API (with caching)
  const fetchHistory = useCallback(async (forceRefresh = false) => {
    try {
      // Check if we have valid cached data
      const now = Date.now();
      const cacheValid = historyCache.length > 0 && (now - cacheTimestamp) < CACHE_DURATION;
      
      if (cacheValid && !forceRefresh) {
        console.log('Using cached history data');
        setAllOrders(historyCache);
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }
      
      // Only show loading spinner on initial load (not refresh)
      if (isInitialLoad && historyCache.length === 0) {
        setLoading(true);
      }
      
      // Fetch all orders (backend handles the heavy lifting and caching)
      const response = await api.get('/orders/history?limit=1000');
      
      if (response.data.success) {
        const orders = response.data.orders || [];
        // Update cache
        historyCache = orders;
        cacheTimestamp = Date.now();
        setAllOrders(orders);
      }
    } catch (error) {
      console.error('Error fetching order history:', error);
      // If we have cached data, use it even if fetch failed
      if (historyCache.length > 0) {
        setAllOrders(historyCache);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsInitialLoad(false);
    }
  }, [isInitialLoad]);

  // Initial data load
  useEffect(() => {
    // Use InteractionManager to defer fetch until after screen transition
    const task = InteractionManager.runAfterInteractions(() => {
      fetchHistory();
    });
    return () => task.cancel();
  }, []);
  
  // Reset display count when filters change
  useEffect(() => {
    setDisplayCount(15);
  }, [searchQuery, statusFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setDisplayCount(15);
    fetchHistory(true); // Force refresh
  }, [fetchHistory]);

  // Load more items (virtual pagination - just increase display count)
  const onLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      setLoadingMore(true);
      // Simulate slight delay for smooth UX
      setTimeout(() => {
        setDisplayCount(prev => prev + 20);
        setLoadingMore(false);
      }, 100);
    }
  }, [loadingMore, hasMore, loading]);

  // Navigate to order detail with constructed order object
  const handleOrderPress = (item) => {
    // Parse items from string and match with menu items for images
    let parsedItems = [];
    if (typeof item.items === 'string') {
      parsedItems = item.items.split(',').map(i => {
        const match = i.trim().match(/^(.+?)\s*x(\d+)\s*\(₹(\d+)\)$/);
        if (match) {
          const itemName = match[1].trim();
          const quantity = parseInt(match[2]);
          const totalPrice = parseInt(match[3]);
          // Try to find matching menu item for image
          const menuItem = menuItems.find(m => 
            m.name.toLowerCase() === itemName.toLowerCase() ||
            m.name.toLowerCase().includes(itemName.toLowerCase()) ||
            itemName.toLowerCase().includes(m.name.toLowerCase())
          );
          return { 
            name: itemName, 
            quantity: quantity, 
            price: totalPrice / quantity,
            image: menuItem?.image || null
          };
        }
        return { name: i.trim(), quantity: 1, price: 0, image: null };
      });
    } else {
      parsedItems = item.items || [];
    }
    
    // Construct order object for detail screen
    const orderForDetail = {
      _id: item.orderId,
      orderId: item.orderId,
      customer: {
        name: item.customerName,
        phone: item.phone,
      },
      items: parsedItems,
      itemsTotal: item.itemsTotal,
      deliveryCharge: item.deliveryCharge || 0,
      totalAmount: item.totalAmount,
      status: item.status,
      paymentStatus: item.paymentStatus,
      paymentMethod: item.paymentMethod,
      serviceType: item.sheetType === 'selfpick' ? 'pickup' : 'delivery',
      deliveryAddress: { address: item.address },
      deliveryPartnerName: item.deliveryPartnerName || null,
      createdAt: item.time,
      source: 'sheets',
    };
    
    navigation.navigate('OrderDetail', { order: orderForDetail, fromHistory: true });
  };

  const renderOrderItem = ({ item }) => {
    const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.delivered;
    
    // Determine payment status display
    // Use paymentStatus field from sheet (column J), fallback to paymentMethod (column I)
    const paymentStatus = item.paymentStatus?.toLowerCase()?.trim() || '';
    const paymentMethod = item.paymentMethod?.toLowerCase()?.trim() || '';
    const isCancelled = item.status === 'cancelled' || item.sheetType === 'cancelled';
    let paymentStatusKey = 'pending';
    
    if (isCancelled) {
      // Cancelled orders - show original payment method info
      if (paymentMethod === 'upi/app' || paymentMethod === 'upi' || paymentMethod === 'online' || paymentMethod === 'paid') {
        paymentStatusKey = 'cancelled_upi';
      } else if (paymentMethod === 'pay at hotel' || paymentMethod.includes('pay at hotel')) {
        paymentStatusKey = 'cancelled_payathotel';
      } else if (paymentMethod.includes('cod') || paymentMethod.includes('cash')) {
        paymentStatusKey = 'cancelled_cod';
      } else {
        paymentStatusKey = 'cancelled';
      }
    } else if (item.sheetType === 'selfpick') {
      // For self-pickup orders (selfpick sheet)
      // Check paymentStatus field first (this contains "Paid", "Paid (UPI)", "Paid (Cash)")
      if (paymentStatus === 'paid (upi)' || paymentStatus.includes('paid (upi)')) {
        paymentStatusKey = 'paid (upi)';
      } else if (paymentStatus === 'paid (cash)' || paymentStatus.includes('paid (cash)')) {
        paymentStatusKey = 'paid (cash)';
      } else if (paymentStatus === 'paid') {
        // Pre-paid with UPI/App
        paymentStatusKey = 'upi/app';
      } else if (paymentMethod === 'upi/app' || paymentMethod === 'upi') {
        // Fallback: check payment method
        paymentStatusKey = 'upi/app';
      } else if (paymentMethod === 'pay at hotel' || paymentMethod.includes('pay at hotel')) {
        paymentStatusKey = 'paid at hotel';
      } else {
        paymentStatusKey = 'paid';
      }
    } else {
      // For delivery orders
      if (paymentMethod.includes('cod') || paymentMethod.includes('cash')) {
        paymentStatusKey = item.status === 'delivered' ? 'cod' : 'pending';
      } else {
        paymentStatusKey = 'paid';
      }
    }
    
    const paymentConfig = PAYMENT_STATUS_CONFIG[paymentStatusKey] || PAYMENT_STATUS_CONFIG.pending;
    
    return (
      <TouchableOpacity
        style={styles.orderCard}
        activeOpacity={0.7}
        onPress={() => handleOrderPress(item)}
      >
        <View style={styles.orderHeader}>
          <View style={styles.orderIdContainer}>
            <Text style={styles.orderId}>#{item.orderId}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
              <Ionicons name={statusConfig.icon} size={12} color={statusConfig.color} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            </View>
          </View>
          <Text style={styles.orderTime}>{item.time}</Text>
        </View>
        
        <View style={styles.customerInfo}>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.infoText}>{item.customerName || 'Customer'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={16} color="#666" />
            <Text style={styles.infoText}>{item.phone}</Text>
          </View>
        </View>
        
        <View style={styles.itemsContainer}>
          <Ionicons name="fast-food-outline" size={16} color="#888" />
          <Text style={styles.itemsText} numberOfLines={2}>{item.items}</Text>
        </View>
        
        <View style={styles.orderFooter}>
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>₹{item.totalAmount?.toFixed(2) || '0.00'}</Text>
          </View>
          
          <View style={styles.footerRight}>
            <View style={[styles.paymentBadge, { backgroundColor: `${paymentConfig.color}15` }]}>
              <Ionicons name={paymentConfig.icon} size={12} color={paymentConfig.color} />
              <Text style={[styles.paymentText, { color: paymentConfig.color }]}>{paymentConfig.label}</Text>
            </View>
            
            {item.sheetType === 'selfpick' && (
              <View style={styles.pickupBadge}>
                <Ionicons name="storefront-outline" size={12} color="#3498db" />
                <Text style={styles.pickupText}>Pickup</Text>
              </View>
            )}
          </View>
        </View>
        
        {item.deliveryPartnerName && (
          <View style={styles.deliveryInfo}>
            <Ionicons name="bicycle-outline" size={14} color="#E23744" />
            <Text style={styles.deliveryText}>{item.deliveryPartnerName}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color="#E23744" />
        <Text style={styles.loadingMoreText}>Loading more orders...</Text>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="document-text-outline" size={60} color="#ccc" />
      <Text style={styles.emptyTitle}>No Orders Found</Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery ? 'Try a different search term' : 'Order history will appear here'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Header */}
      <ImageBackground
        source={require('../../../assets/backgrounds/orders.jpg')}
        style={styles.header}
        imageStyle={styles.headerBackgroundImage}
      >
        <View style={styles.headerOverlay}>
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            
            <View style={styles.headerCenter}>
              <View style={styles.titleRow}>
                <View style={styles.titleIconContainer}>
                  <Ionicons name="time" size={20} color="#fff" />
                </View>
                <Text style={styles.title}>Order History</Text>
              </View>
              <Text style={styles.subtitle}>
                {filteredOrders.length} orders{searchQuery || statusFilter !== 'all' ? ' (filtered)' : ''}
              </Text>
            </View>
            
            <View style={styles.headerRight} />
          </View>
          
          <Animated.View
            style={[
              styles.glassShine,
              {
                transform: [{ translateX: shineAnim.interpolate({ inputRange: [-1, 1], outputRange: [-200, 400] }) }],
                opacity: shineAnim.interpolate({ inputRange: [-1, 0, 0.5, 1], outputRange: [0, 0.6, 0.6, 0] }),
              },
            ]}
          />
        </View>
      </ImageBackground>

      {/* Search & Filter */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ID, name, phone..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          ) : null}
        </View>
        
        {/* Status Filter Tabs */}
        <View style={styles.filterTabs}>
          {['all', 'delivered', 'cancelled'].map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterTab,
                statusFilter === status && styles.filterTabActive,
              ]}
              onPress={() => setStatusFilter(status)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  statusFilter === status && styles.filterTabTextActive,
                ]}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Orders List */}
      {loading && allOrders.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E23744" />
          <Text style={styles.loadingText}>Loading order history...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={visibleOrders}
          keyExtractor={(item, index) => `${item.orderId}-${item.sheetType}-${index}`}
          renderItem={renderOrderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#E23744']}
              tintColor="#E23744"
            />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          // Performance optimizations
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={10}
          getItemLayout={(data, index) => ({
            length: 180, // Approximate item height
            offset: 180 * index,
            index,
          })}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    height: 140,
    paddingTop: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight + 10,
  },
  headerBackgroundImage: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    width: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  glassShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 100,
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: [{ skewX: '-20deg' }],
  },
  searchContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  filterTabs: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: '#E23744',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#888',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  orderTime: {
    fontSize: 12,
    color: '#888',
  },
  customerInfo: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
  },
  itemsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 12,
  },
  itemsText: {
    flex: 1,
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalLabel: {
    fontSize: 13,
    color: '#888',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E23744',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  paymentText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pickupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    gap: 4,
  },
  pickupText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3498db',
  },
  deliveryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  deliveryText: {
    fontSize: 12,
    color: '#E23744',
    fontWeight: '500',
  },
  loadingMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 13,
    color: '#888',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
});

export default OrderHistoryScreen;
