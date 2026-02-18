import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Platform, StatusBar, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useDeliveryNotifications } from '../../context/DeliveryNotificationContext';

const DELIVERY_GREEN = '#267E3E';

const STATUS_CONFIG = {
  new_assignment: {
    icon: 'bicycle',
    gradient: '#FFF7ED',
    accent: '#F59E0B',
    label: 'New Assignment',
    labelBg: '#FEF3C7',
    labelColor: '#B45309',
  },
  order_delivered: {
    icon: 'checkmark-done-circle',
    gradient: '#F0FDF4',
    accent: '#22C55E',
    label: 'Delivered',
    labelBg: '#DCFCE7',
    labelColor: '#166534',
  },
  order_cancelled: {
    icon: 'close-circle',
    gradient: '#FEF2F2',
    accent: '#EF4444',
    label: 'Cancelled',
    labelBg: '#FEE2E2',
    labelColor: '#991B1B',
  },
  default: {
    icon: 'notifications',
    gradient: '#F8FAFC',
    accent: '#6366F1',
    label: 'Update',
    labelBg: '#EEF2FF',
    labelColor: '#4338CA',
  },
};

export default function DeliveryNotificationsScreen({ navigation }) {
  const { notifications, markAllAsRead, markAsRead, clearAll, checkForUpdates } = useDeliveryNotifications();

  useFocusEffect(
    useCallback(() => {
      checkForUpdates();
      markAllAsRead();
    }, [checkForUpdates, markAllAsRead])
  );

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 172800000) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const handleNotificationPress = (notification) => {
    markAsRead(notification.id);
    if (notification.orderId) {
      navigation.navigate('MyOrders', {
        screen: 'DeliveryOrderDetail',
        params: { orderId: notification.orderId },
      });
    }
  };

  const getConfig = (type) => STATUS_CONFIG[type] || STATUS_CONFIG.default;

  const renderNotification = ({ item }) => {
    const config = getConfig(item.type);
    const isUnread = !item.read;

    return (
      <TouchableOpacity
        style={[styles.card, isUnread && styles.cardUnread]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        {/* Accent strip */}
        {isUnread && <View style={[styles.accentStrip, { backgroundColor: config.accent }]} />}

        {/* Icon */}
        <View style={[styles.iconCircle, { backgroundColor: config.gradient }]}>
          <Ionicons name={config.icon} size={22} color={config.accent} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={[styles.statusBadge, { backgroundColor: config.labelBg }]}>
              <Text style={[styles.statusLabel, { color: config.labelColor }]}>{config.label}</Text>
            </View>
            <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
          </View>

          <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
            {item.title.replace(/[\u{1F389}\u{2705}\u{274C}\u{1F6B4}]/gu, '').trim()}
          </Text>
          <Text style={styles.message} numberOfLines={2}>{item.message}</Text>

          {item.address ? (
            <View style={styles.addressRow}>
              <Ionicons name="location" size={11} color={DELIVERY_GREEN} />
              <Text style={styles.address} numberOfLines={1}>{item.address}</Text>
            </View>
          ) : null}
        </View>

        {/* Arrow */}
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={styles.arrow} />
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconBg}>
        <Ionicons name="notifications-off-outline" size={44} color={DELIVERY_GREEN} />
      </View>
      <Text style={styles.emptyTitle}>No Notifications</Text>
      <Text style={styles.emptyMessage}>
        You're all caught up! New order{'\n'}assignments will appear here.
      </Text>
    </View>
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={clearAll}>
            <Text style={styles.clearText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Count strip */}
      {notifications.length > 0 && (
        <View style={styles.countStrip}>
          <Text style={styles.countText}>
            {unreadCount > 0 ? `${unreadCount} UNREAD` : '0 UNREAD'}
          </Text>
          <View style={styles.countDivider} />
        </View>
      )}

      {/* List */}
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          notifications.length === 0 && styles.listEmpty,
        ]}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginLeft: 12,
    letterSpacing: -0.3,
  },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '600',
    color: DELIVERY_GREEN,
  },

  /* Count strip */
  countStrip: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  countDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginTop: 10,
  },

  /* List */
  list: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 24,
  },
  listEmpty: {
    flex: 1,
    justifyContent: 'center',
  },

  /* Card */
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardUnread: {
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  accentStrip: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },

  /* Icon */
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Content */
  content: {
    flex: 1,
    marginLeft: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  time: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 2,
  },
  titleUnread: {
    fontWeight: '700',
    color: '#1E293B',
  },
  message: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  address: {
    fontSize: 11,
    color: DELIVERY_GREEN,
    marginLeft: 4,
    fontWeight: '500',
  },
  arrow: {
    marginLeft: 8,
  },

  /* Empty */
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconBg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
  },
});
