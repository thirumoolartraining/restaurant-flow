import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, SectionList,
  RefreshControl, TouchableOpacity, Animated, Platform, StatusBar, ImageBackground,
  Modal, AppState, TextInput, Keyboard
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import api from '../../config/api';
import { colors, spacing, radius, typography, shadows } from '../../theme';

const DELIVERY_GREEN = '#267E3E';
const DELIVERY_DARK_GREEN = '#1B5E2E';
const POLL_INTERVAL = 5000; // 5 seconds for real-time updates

// Filter options
const STATUS_FILTERS = [
  { key: 'all', label: 'All', icon: 'list' },
  { key: 'delivered', label: 'Delivered', icon: 'checkmark-circle', color: '#22C55E' },
  { key: 'cancelled', label: 'Cancelled', icon: 'close-circle', color: '#EF4444' },
];

const DATE_FILTERS = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

// Background image
const HISTORY_BG = require('../../../assets/backgrounds/deliveryhistory.jpg');
const SUMMARY_BG = require('../../../assets/backgrounds/deliveryhistory1.jpg');

const SummaryCard = ({ orders, dateFilter }) => {
  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  const cancelledOrders = orders.filter(o => o.status === 'cancelled');
  const totalEarnings = deliveredOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

  // Get title based on date filter
  const getTitle = () => {
    switch (dateFilter) {
      case 'today': return 'Today';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'all': return 'All Time';
      default: return 'All Time';
    }
  };

  return (
    <View style={styles.summaryCardBg}>
      <ImageBackground source={SUMMARY_BG} style={styles.summaryCard} imageStyle={styles.summaryCardImage}>
        <View style={styles.summaryCardOverlay}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>{getTitle()}</Text>
            {deliveredOrders.length > 0 && (
              <View style={styles.summaryBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                <Text style={styles.summaryBadgeText}>{deliveredOrders.length} done</Text>
              </View>
            )}
          </View>

          <View style={styles.summaryStats}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryValue}>₹{totalEarnings.toLocaleString()}</Text>
              <Text style={styles.summaryLabel}>Total Earned</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryValue}>{deliveredOrders.length}</Text>
              <Text style={styles.summaryLabel}>Delivered</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryValue, cancelledOrders.length > 0 && { color: '#FCA5A5' }]}>{cancelledOrders.length}</Text>
              <Text style={styles.summaryLabel}>Cancelled</Text>
            </View>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
};

const SectionHeader = ({ title }) => (
  <View style={styles.sectionHeader}>
    <View style={styles.sectionDot} />
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

export default function DeliveryHistoryScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pollIntervalRef = useRef(null);
  const appState = useRef(AppState.currentState);
  const searchInputRef = useRef(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  // Apply filters
  const applyFilters = useCallback((allOrders, status, date, search) => {
    let filtered = [...allOrders];
    
    // Status filter
    if (status !== 'all') {
      filtered = filtered.filter(order => order.status === status);
    }
    
    // Search filter (search in orderId, customerName, phone, items)
    if (search && search.trim()) {
      const query = search.toLowerCase().trim();
      filtered = filtered.filter(order => {
        const orderId = (order.orderId || '').toLowerCase();
        const customerName = (order.customerName || order.customer?.name || '').toLowerCase();
        const phone = (order.phone || order.customer?.phone || '');
        const items = (order.items || '').toLowerCase();
        const address = (order.address || order.deliveryAddress?.address || '').toLowerCase();
        
        return orderId.includes(query) ||
          customerName.includes(query) ||
          phone.includes(query) ||
          items.includes(query) ||
          address.includes(query);
      });
    }
    
    // Date filter
    if (date !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filtered = filtered.filter(order => {
        // Parse the order date - handle both Date objects and ISO strings
        const dateValue = order.orderDate || order.statusUpdatedAt || order.deliveredAt || order.createdAt;
        if (!dateValue) return false;
        
        const orderDate = new Date(dateValue);
        if (isNaN(orderDate.getTime())) return false;
        
        // Reset time portion for comparison
        const orderDateOnly = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());
        
        if (date === 'today') {
          return orderDateOnly.getTime() === today.getTime();
        } else if (date === 'week') {
          const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          return orderDateOnly >= weekAgo;
        } else if (date === 'month') {
          const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
          return orderDateOnly >= monthAgo;
        }
        return true;
      });
    }
    
    setFilteredOrders(filtered);
    
    // Group by date
    const grouped = filtered.reduce((acc, order) => {
      // For sheets data, parse from time string or use current date
      let date;
      if (order.source === 'sheets') {
        // Sheets orders don't have full date, group by orderId prefix date or use 'Recent'
        date = new Date(); // Default to today for sheets data
      } else {
        date = new Date(order.statusUpdatedAt || order.deliveredAt || order.createdAt);
      }
      
      const todayDate = new Date();
      const yesterday = new Date(todayDate);
      yesterday.setDate(yesterday.getDate() - 1);

      let dateKey;
      if (date.toDateString() === todayDate.toDateString()) dateKey = 'Today';
      else if (date.toDateString() === yesterday.toDateString()) dateKey = 'Yesterday';
      else dateKey = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(order);
      return acc;
    }, {});

    setSections(Object.entries(grouped).map(([title, data]) => ({ title, data })));
  }, []);

  // Fetch history from Google Sheets endpoint (cost-saving approach)
  const fetchHistory = useCallback(async () => {
    try {
      // Fetch from Google Sheets endpoint
      const response = await api.get('/delivery/orders/history/sheets', {
        params: {
          search: searchQuery || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined
        }
      });
      
      const historyOrders = response.data.orders || response.data || [];
      setOrders(historyOrders);
      applyFilters(historyOrders, statusFilter, dateFilter, searchQuery);
    } catch (error) {
      console.error('Error fetching history:', error);
      // Fallback to old endpoint if sheets endpoint fails
      try {
        const fallbackResponse = await api.get('/delivery/orders/history');
        setOrders(fallbackResponse.data);
        applyFilters(fallbackResponse.data, statusFilter, dateFilter, searchQuery);
      } catch (fallbackError) {
        console.error('Fallback history fetch failed:', fallbackError);
      }
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [applyFilters, statusFilter, dateFilter, searchQuery]);

  useEffect(() => { fetchHistory(); }, []);
  
  // Real-time polling for history updates
  useEffect(() => {
    const startPolling = () => {
      if (pollIntervalRef.current) return;
      pollIntervalRef.current = setInterval(() => {
        fetchHistory();
      }, POLL_INTERVAL);
    };

    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    const handleAppStateChange = (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        fetchHistory();
        startPolling();
      } else if (nextAppState.match(/inactive|background/)) {
        stopPolling();
      }
      appState.current = nextAppState;
    };

    startPolling();
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      stopPolling();
      subscription?.remove();
    };
  }, [fetchHistory]);
  
  useEffect(() => {
    if (orders.length > 0) {
      applyFilters(orders, statusFilter, dateFilter, searchQuery);
    }
  }, [statusFilter, dateFilter, searchQuery, orders, applyFilters]);
  
  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (orders.length > 0) {
        applyFilters(orders, statusFilter, dateFilter, searchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  const onRefresh = useCallback(() => { setRefreshing(true); fetchHistory(); }, [fetchHistory]);
  
  const clearFilters = () => {
    setStatusFilter('all');
    setDateFilter('all');
    setSearchQuery('');
  };
  
  const hasActiveFilters = statusFilter !== 'all' || dateFilter !== 'all' || searchQuery.trim() !== '';

  const renderOrder = ({ item }) => {
    const isCancelled = item.status === 'cancelled';
    
    // Handle both MongoDB and Sheets data formats
    const orderId = item.orderId || item._id;
    const customerName = item.customerName || item.customer?.name || 'Customer';
    const customerPhone = item.phone || item.customer?.phone || '';
    const address = item.address || item.deliveryAddress?.address || item.customer?.address || 'N/A';
    const totalAmount = item.totalAmount || 0;
    const itemsCount = item.items ? (typeof item.items === 'string' ? item.items.split(',').length : item.items.length) : 0;
    const orderTime = item.time || (item.deliveredAt ? new Date(item.deliveredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 
                      item.statusUpdatedAt ? new Date(item.statusUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'N/A');
    
    return (
      <Animated.View style={{ opacity: fadeAnim }}>
        <TouchableOpacity 
          onPress={() => {
            // For sheets data, we need to construct order object
            if (item.source === 'sheets') {
              // Parse items string like "Kiwi juice x1 (₹150), Another item x2 (₹200)"
              let parsedItems = [];
              if (typeof item.items === 'string' && item.items) {
                const itemParts = item.items.split(', ');
                parsedItems = itemParts.map(part => {
                  // Match pattern: "Item name x2 (₹300)" or "Item name x1"
                  const match = part.match(/^(.+?)\s*x(\d+)(?:\s*\(₹(\d+)\))?$/);
                  if (match) {
                    const quantity = parseInt(match[2]) || 1;
                    const totalPrice = parseInt(match[3]) || 0;
                    return {
                      name: match[1].trim(),
                      quantity: quantity,
                      price: totalPrice / quantity || 0
                    };
                  }
                  return { name: part.trim(), quantity: 1, price: 0 };
                });
              } else if (Array.isArray(item.items)) {
                parsedItems = item.items;
              }
              
              navigation.navigate('DeliveryOrderDetail', { 
                order: {
                  ...item,
                  customer: { name: customerName, phone: customerPhone },
                  deliveryAddress: { address },
                  items: parsedItems
                }
              });
            } else {
              navigation.navigate('DeliveryOrderDetail', { order: item });
            }
          }} 
          activeOpacity={0.8}
        >
          <View style={[styles.orderCardBg, isCancelled && styles.orderCardCancelled]}>
            <View style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <View style={styles.orderIdContainer}>
                  <View style={[styles.checkIcon, isCancelled && styles.cancelledIcon]}>
                    <Ionicons name={isCancelled ? 'close' : 'checkmark'} size={12} color="#fff" />
                  </View>
                  <Text style={styles.orderId}>#{orderId}</Text>
                  {isCancelled && (
                    <View style={styles.cancelledBadge}>
                      <Text style={styles.cancelledBadgeText}>Cancelled</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.orderAmount, isCancelled && styles.orderAmountCancelled]}>
                  {isCancelled ? '' : '₹'}{isCancelled ? 'Cancelled' : totalAmount}
                </Text>
              </View>

              <View style={styles.orderDetails}>
                <View style={styles.orderDetail}>
                  <Ionicons name="person-outline" size={14} color={colors.light.text.tertiary} />
                  <Text style={styles.orderDetailText}>{customerName || customerPhone}</Text>
                </View>
                <View style={styles.orderDetail}>
                  <Ionicons name="location-outline" size={14} color={colors.light.text.tertiary} />
                  <Text style={styles.orderDetailText} numberOfLines={1}>{address}</Text>
                </View>
              </View>

              <View style={styles.orderFooter}>
                <View style={styles.orderTime}>
                  <Ionicons name="time-outline" size={14} color={colors.light.text.tertiary} />
                  <Text style={styles.orderTimeText}>{orderTime}</Text>
                </View>
                <View style={[styles.itemsCount, isCancelled && styles.itemsCountCancelled]}>
                  <Text style={[styles.itemsCountText, isCancelled && styles.itemsCountTextCancelled]}>
                    {isCancelled ? 'Cancelled' : `${itemsCount} items`}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View style={styles.headerWrapper}>
        <ImageBackground source={HISTORY_BG} style={styles.header} imageStyle={styles.headerBackgroundImage}>
          <View style={styles.headerOverlay}>
            <View style={styles.headerContent}>
              <View>
                <Text style={styles.title}>Delivery History</Text>
                <Text style={styles.subtitle}>{filteredOrders.length} deliveries {hasActiveFilters ? '(filtered)' : 'completed'}</Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity 
                  style={styles.searchButton} 
                  onPress={() => {
                    setShowSearch(!showSearch);
                    if (!showSearch) {
                      setTimeout(() => searchInputRef.current?.focus(), 100);
                    }
                  }}
                >
                  <Ionicons name={showSearch ? "close" : "search"} size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]} 
                  onPress={() => setShowFilterModal(true)}
                >
                  <Ionicons name="filter" size={20} color="#fff" />
                  {hasActiveFilters && <View style={styles.filterDot} />}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ImageBackground>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchBarContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color={colors.light.text.tertiary} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search by order ID, name, phone..."
              placeholderTextColor={colors.light.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.light.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Active Filters Bar */}
      {hasActiveFilters && (
        <View style={styles.activeFiltersBar}>
          <View style={styles.activeFiltersContent}>
            {statusFilter !== 'all' && (
              <View style={styles.activeFilterChip}>
                <Text style={styles.activeFilterText}>
                  {STATUS_FILTERS.find(f => f.key === statusFilter)?.label}
                </Text>
                <TouchableOpacity onPress={() => setStatusFilter('all')}>
                  <Ionicons name="close-circle" size={16} color={DELIVERY_GREEN} />
                </TouchableOpacity>
              </View>
            )}
            {dateFilter !== 'all' && (
              <View style={styles.activeFilterChip}>
                <Text style={styles.activeFilterText}>
                  {DATE_FILTERS.find(f => f.key === dateFilter)?.label}
                </Text>
                <TouchableOpacity onPress={() => setDateFilter('all')}>
                  <Ionicons name="close-circle" size={16} color={DELIVERY_GREEN} />
                </TouchableOpacity>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={clearFilters}>
            <Text style={styles.clearFiltersText}>Clear All</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <View style={styles.skeletonSummary} />
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          renderItem={renderOrder}
          renderSectionHeader={({ section: { title } }) => <SectionHeader title={title} />}
          ListHeaderComponent={<SummaryCard orders={filteredOrders} dateFilter={dateFilter} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name={hasActiveFilters ? 'filter-outline' : 'time-outline'} size={48} color={colors.light.text.tertiary} />
              </View>
              <Text style={styles.emptyTitle}>{hasActiveFilters ? 'No Results' : 'No Delivery History'}</Text>
              <Text style={styles.emptyText}>
                {hasActiveFilters ? 'Try adjusting your filters' : 'Completed deliveries will appear here'}
              </Text>
              {hasActiveFilters && (
                <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
                  <Text style={styles.clearFiltersButtonText}>Clear Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[DELIVERY_GREEN]} />}
        />
      )}

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Orders</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close" size={24} color={colors.light.text.secondary} />
              </TouchableOpacity>
            </View>

            {/* Status Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Status</Text>
              <View style={styles.filterOptions}>
                {STATUS_FILTERS.map((filter) => (
                  <TouchableOpacity
                    key={filter.key}
                    style={[
                      styles.filterOption,
                      statusFilter === filter.key && styles.filterOptionActive
                    ]}
                    onPress={() => setStatusFilter(filter.key)}
                  >
                    <Ionicons 
                      name={filter.icon} 
                      size={18} 
                      color={statusFilter === filter.key ? '#fff' : (filter.color || colors.light.text.secondary)} 
                    />
                    <Text style={[
                      styles.filterOptionText,
                      statusFilter === filter.key && styles.filterOptionTextActive
                    ]}>
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Date Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Date Range</Text>
              <View style={styles.filterOptions}>
                {DATE_FILTERS.map((filter) => (
                  <TouchableOpacity
                    key={filter.key}
                    style={[
                      styles.filterOption,
                      dateFilter === filter.key && styles.filterOptionActive
                    ]}
                    onPress={() => setDateFilter(filter.key)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      dateFilter === filter.key && styles.filterOptionTextActive
                    ]}>
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearButtonText}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.applyButton} 
                onPress={() => setShowFilterModal(false)}
              >
                <LinearGradient
                  colors={[DELIVERY_GREEN, DELIVERY_DARK_GREEN]}
                  style={styles.applyButtonGradient}
                >
                  <Text style={styles.applyButtonText}>Apply Filters</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  headerWrapper: { zIndex: 100, elevation: 100, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  header: { paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 35 : 75, paddingBottom: 55, paddingHorizontal: spacing.screenHorizontal },
  headerBackgroundImage: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerOverlay: { 
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    marginTop: -(Platform.OS === 'android' ? StatusBar.currentHeight + 35 : 75),
    marginBottom: -55,
    marginHorizontal: -spacing.screenHorizontal,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 35 : 75,
    paddingBottom: 55,
    paddingHorizontal: spacing.screenHorizontal,
  },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: typography.body.large.fontSize, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  searchButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  filterButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  filterButtonActive: { backgroundColor: DELIVERY_GREEN },
  filterDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  
  // Search Bar
  searchBarContainer: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing.sm,
    backgroundColor: colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.borderLight,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.light.surfaceSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 0,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body.medium.fontSize,
    color: colors.light.text.primary,
    paddingVertical: spacing.sm,
  },
  
  // Active Filters Bar
  activeFiltersBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing.sm,
    backgroundColor: '#E8F5E9',
    borderBottomWidth: 1,
    borderBottomColor: '#C8E6C9',
  },
  activeFiltersContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DELIVERY_GREEN,
  },
  activeFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: DELIVERY_GREEN,
  },
  clearFiltersText: {
    fontSize: 13,
    fontWeight: '600',
    color: DELIVERY_GREEN,
  },
  clearFiltersButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: '#E8F5E9',
    borderRadius: radius.lg,
  },
  clearFiltersButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: DELIVERY_GREEN,
  },
  listContent: { padding: spacing.screenHorizontal, paddingBottom: 100, paddingTop: spacing.md },
  loadingContainer: { padding: spacing.screenHorizontal },
  skeletonSummary: { height: 180, backgroundColor: colors.light.border, borderRadius: radius.xl, marginBottom: spacing.lg },
  skeletonCard: { height: 120, backgroundColor: colors.light.border, borderRadius: radius.xl, marginBottom: spacing.md },
  summaryCardBg: { marginBottom: spacing.lg, borderRadius: radius.xl, overflow: 'hidden', ...shadows.md, backgroundColor: colors.light.surface },
  summaryCard: { padding: spacing.lg },
  summaryCardImage: { borderRadius: radius.xl },
  summaryCardOverlay: { 
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    margin: -spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  summaryTitle: { fontSize: typography.title.large.fontSize, fontWeight: '600', color: '#fff' },
  summaryBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  summaryBadgeText: { fontSize: typography.label.small.fontSize, fontWeight: '600', color: '#fff' },
  summaryStats: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: typography.headline.medium.fontSize, fontWeight: '700', color: '#fff' },
  summaryLabel: { fontSize: typography.label.small.fontSize, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  summaryDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: DELIVERY_GREEN, marginRight: spacing.sm },
  sectionTitle: { fontSize: typography.title.medium.fontSize, fontWeight: '600', color: colors.light.text.secondary },
  orderCardBg: { marginBottom: spacing.md, borderRadius: radius.xl, ...shadows.card, backgroundColor: colors.light.surface },
  orderCardCancelled: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  orderCard: { padding: spacing.base, borderRadius: radius.xl },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  orderIdContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#22C55E', justifyContent: 'center', alignItems: 'center' },
  cancelledIcon: { backgroundColor: '#EF4444' },
  orderId: { fontSize: typography.title.large.fontSize, fontWeight: '700', color: colors.light.text.primary },
  cancelledBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  cancelledBadgeText: { fontSize: 11, fontWeight: '600', color: '#EF4444' },
  orderAmount: { fontSize: typography.headline.small.fontSize, fontWeight: '700', color: DELIVERY_GREEN },
  orderAmountCancelled: { color: '#EF4444', fontSize: 14 },
  orderDetails: { gap: spacing.sm, marginBottom: spacing.md },
  orderDetail: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderDetailText: { flex: 1, fontSize: typography.body.medium.fontSize, color: colors.light.text.secondary },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.light.borderLight },
  orderTime: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  orderTimeText: { fontSize: typography.body.small.fontSize, color: colors.light.text.tertiary },
  itemsCount: { backgroundColor: colors.light.surfaceSecondary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm },
  itemsCountCancelled: { backgroundColor: '#FEE2E2' },
  itemsCountText: { fontSize: typography.label.small.fontSize, color: colors.light.text.secondary },
  itemsCountTextCancelled: { color: '#EF4444' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyIconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.light.surfaceSecondary, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.base },
  emptyTitle: { fontSize: typography.headline.small.fontSize, fontWeight: '600', color: colors.light.text.secondary },
  emptyText: { fontSize: typography.body.medium.fontSize, color: colors.light.text.tertiary, marginTop: spacing.xs, textAlign: 'center' },
  
  // Filter Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.light.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.light.text.primary,
  },
  filterSection: {
    marginBottom: spacing.lg,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.light.text.secondary,
    marginBottom: spacing.sm,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.light.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  filterOptionActive: {
    backgroundColor: DELIVERY_GREEN,
    borderColor: DELIVERY_GREEN,
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.light.text.secondary,
  },
  filterOptionTextActive: {
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  clearButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.light.text.secondary,
  },
  applyButton: {
    flex: 2,
    borderRadius: 14,
    overflow: 'hidden',
  },
  applyButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
