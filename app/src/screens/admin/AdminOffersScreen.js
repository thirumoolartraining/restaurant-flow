import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  RefreshControl, TouchableOpacity, Image, Alert, ActivityIndicator, Animated, Platform, StatusBar, ImageBackground, Switch, ToastAndroid, Modal, ScrollView, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import api from '../../config/api';
import { colors, spacing, radius, typography, shadows } from '../../theme';
import { useNotifications } from '../../context/NotificationContext';

// Toast helper for cross-platform
const showToast = (message) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    // iOS doesn't have native toast, use Alert for now
    Alert.alert('✓', message);
  }
};

export default function AdminOffersScreen({ navigation }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingOffer, setSendingOffer] = useState(null); // Track which offer is being sent
  const [pollingIds, setPollingIds] = useState(new Set()); // Track offers being polled for template status
  const [retryingTemplate, setRetryingTemplate] = useState(null); // Track which offer template is being retried
  const [togglingOffer, setTogglingOffer] = useState(null); // Track which offer is being toggled
  const [detailOffer, setDetailOffer] = useState(null); // Offer detail modal
  const { offerTemplateAlert, clearOfferTemplateAlert } = useNotifications();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const shineAnim = useRef(new Animated.Value(-1)).current;
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    // Glass shine effect
    setTimeout(() => {
      Animated.timing(shineAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    }, 300);
  }, []);

  const fetchOffers = async () => {
    try {
      const response = await api.get('/offers');
      setOffers(response.data);
    } catch (error) { console.error('Error fetching offers:', error); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    fetchOffers();
    const unsubscribe = navigation.addListener('focus', fetchOffers);
    return () => {
      unsubscribe();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [navigation]);

  // Auto-refresh when push notification updates offerTemplateAlert (no manual pull needed)
  useEffect(() => {
    if (offerTemplateAlert) {
      fetchOffers();
      // Show a toast so admin knows what happened
      const statusMsg = offerTemplateAlert === 'approved'
        ? '✅ Template approved by Meta!'
        : '❌ Template rejected by Meta';
      showToast(statusMsg);
      clearOfferTemplateAlert();
    }
  }, [offerTemplateAlert]);

  // Auto-poll template status for pending offers every 30 seconds
  useEffect(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    
    const pendingOffers = offers.filter(o => o.templateStatus === 'pending');
    if (pendingOffers.length === 0) return;
    
    const pollPending = async () => {
      let updated = false;
      for (const offer of pendingOffers) {
        try {
          const res = await api.get(`/offers/${offer._id}/template-status`);
          if (res.data.templateStatus && res.data.templateStatus !== offer.templateStatus) {
            updated = true;
          }
        } catch (e) { /* silent */ }
      }
      if (updated) fetchOffers(); // Refresh if any status changed
    };
    
    pollPending(); // Poll immediately
    pollIntervalRef.current = setInterval(pollPending, 30000); // Then every 30s
    
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [offers.map(o => `${o._id}:${o.templateStatus}`).join(',')]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchOffers(); }, []);

  const toggleActive = async (offer) => {
    try {
      setTogglingOffer(offer._id);
      await api.patch(`/offers/${offer._id}/toggle`);
      setOffers(offers.map(o => o._id === offer._id ? { ...o, isActive: !o.isActive } : o));
      showToast(offer.isActive ? 'Offer deactivated' : 'Offer activated');
    } catch (error) { Alert.alert('Error', 'Failed to update offer'); }
    finally { setTogglingOffer(null); }
  };

  const deleteOffer = (offer) => {
    Alert.alert('Delete Offer', `Are you sure you want to permanently delete "${offer.title || offer.offerType}"?\n\nThis will:\n• Remove the offer completely\n• Delete the Meta WhatsApp template\n• Remove offer prices from menu items`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { 
          setLoading(true);
          await api.delete(`/offers/${offer._id}`); 
          setOffers(offers.filter(o => o._id !== offer._id)); 
        }
        catch (error) { Alert.alert('Error', 'Failed to delete offer'); }
        finally { setLoading(false); }
      }},
    ]);
  };

  const retryTemplate = async (offer) => {
    Alert.alert(
      'Retry Template',
      'Re-submit this offer template to Meta for approval?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retry', onPress: async () => {
          try {
            setRetryingTemplate(offer._id);
            await api.post(`/offers/${offer._id}/retry-template`);
            showToast('📤 Template re-submitted for review');
            fetchOffers();
          } catch (error) {
            const msg = error.response?.data?.error || 'Failed to retry template';
            Alert.alert('Error', msg);
          } finally {
            setRetryingTemplate(null);
          }
        }}
      ]
    );
  };

  const sendToWhatsApp = async (offer) => {
    // Check template status first
    if (offer.templateStatus !== 'approved') {
      if (offer.templateStatus === 'pending') {
        Alert.alert(
          'Template Pending',
          'This offer template is still waiting for Meta approval. Old customers (24h+) can only receive approved templates.\n\nPlease wait for approval before sending.',
          [{ text: 'OK' }]
        );
      } else if (offer.templateStatus === 'rejected') {
        Alert.alert(
          'Template Rejected',
          `Meta rejected this template${offer.templateRejectionReason ? ': ' + offer.templateRejectionReason : ''}.\n\nWould you like to retry submission?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Retry', onPress: () => retryTemplate(offer) }
          ]
        );
      } else {
        Alert.alert(
          'Template Not Submitted',
          'No WhatsApp template was created for this offer. This may happen if META_WABA_ID is not configured.\n\nWould you like to submit now?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Submit', onPress: () => retryTemplate(offer) }
          ]
        );
      }
      return;
    }

    // Build confirmation message based on targeting
    const isTargeted = ['top_percentage', 'min_spent', 'min_orders'].includes(offer.targetType) 
      && offer.targetedCustomers && offer.targetedCustomers.length > 0;
    
    let targetLabel = '';
    if (offer.targetType === 'top_percentage') targetLabel = `Top ${offer.targetPercentage || 10}% spenders`;
    else if (offer.targetType === 'min_spent') targetLabel = `Customers with min ₹${offer.targetMinSpent} spent`;
    else if (offer.targetType === 'min_orders') targetLabel = `Customers with ${offer.targetMinOrders}+ orders`;
    
    const confirmMessage = isTargeted 
      ? `Send this offer to ${offer.targetedCustomers.length} targeted customers (${targetLabel})?\n\n✅ Template approved by Meta\n• Recent customers → Interactive message\n• Old customers (24h+) → Approved template`
      : 'Send this offer to ALL customers?\n\n✅ Template approved by Meta\n• Recent customers → Interactive message\n• Old customers (24h+) → Approved template';
    
    Alert.alert(
      'Send to WhatsApp',
      confirmMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              setSendingOffer(offer._id);
              showToast('📤 Sending offer in background...');
              
              // Use the proper offers/:id/send endpoint (enforces template approval)
              api.post(`/offers/${offer._id}/send`).then(response => {
                setSendingOffer(null);
                if (response.data.success || response.data.sent > 0) {
                  const { sent, failed, sentViaInteractive, sentViaTemplate } = response.data;
                  const targetTag = isTargeted ? '🎯 ' : '';
                  let msg = `${targetTag}✅ Sent to ${sent} customers`;
                  if (sentViaInteractive > 0) msg += `\n• ${sentViaInteractive} interactive`;
                  if (sentViaTemplate > 0) msg += `\n• ${sentViaTemplate} via template`;
                  if (failed > 0) msg += `\n• ${failed} failed`;
                  showToast(msg);
                  fetchOffers(); // Refresh to show broadcastSentAt
                } else {
                  Alert.alert('Error', response.data.message || response.data.error || 'Failed to send offer');
                }
              }).catch(error => {
                setSendingOffer(null);
                const errorMsg = error.response?.data?.error || error.message || 'Failed to send offer';
                Alert.alert('Error', errorMsg);
              });
              
            } catch (error) {
              setSendingOffer(null);
              const errorMsg = error.response?.data?.error || error.message || 'Failed to send offer';
              Alert.alert('Error', errorMsg);
            }
          }
        }
      ]
    );
  };

  // Helper to get template status display info
  const getTemplateStatusInfo = (offer) => {
    switch (offer.templateStatus) {
      case 'approved': return { color: '#22C55E', bg: '#D1FAE5', icon: 'checkmark-circle', label: 'Approved' };
      case 'pending': return { color: '#F59E0B', bg: '#FEF3C7', icon: 'time', label: 'Pending Review' };
      case 'rejected': return { color: '#EF4444', bg: '#FEE2E2', icon: 'close-circle', label: 'Rejected' };
      default: return { color: '#6B7280', bg: '#F3F4F6', icon: 'help-circle', label: 'No Template' };
    }
  };

  const renderOffer = ({ item }) => {
    const tplInfo = getTemplateStatusInfo(item);
    const isApproved = item.templateStatus === 'approved';
    const isPending = item.templateStatus === 'pending';
    const isRejected = item.templateStatus === 'rejected';
    const wasSent = !!item.broadcastSentAt;
    
    return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <TouchableOpacity 
        style={styles.offerCard}
        activeOpacity={0.85}
        onPress={() => setDetailOffer(item)}
      >
        <View style={styles.offerImageContainer}>
          {item.image ? (
            <Image 
              source={{ uri: `${item.image}?t=${item.updatedAt || Date.now()}` }} 
              style={styles.offerImage} 
              resizeMode="cover" 
            />
          ) : (
            <View style={[styles.offerImage, styles.offerImagePlaceholder]}>
              <Ionicons name="pricetag-outline" size={32} color={colors.light.text.tertiary} />
            </View>
          )}
          
          {/* Offer Type Badge Overlay */}
          {item.offerType && (
            <View style={styles.offerTypeBadge}>
              <Text style={styles.offerTypeText}>{item.offerType}</Text>
            </View>
          )}
          
          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: item.isActive ? '#22C55E' : '#EF4444' }]}>
            <Text style={styles.statusBadgeText}>{item.isActive ? 'Active' : 'Inactive'}</Text>
          </View>
        </View>
        
        {/* Template Status Bar */}
        <View style={[styles.templateStatusBar, { backgroundColor: tplInfo.bg }]}>
          <View style={styles.templateStatusLeft}>
            <Ionicons name={tplInfo.icon} size={16} color={tplInfo.color} />
            <Text style={[styles.templateStatusText, { color: tplInfo.color }]}>
              Meta Template: {tplInfo.label}
            </Text>
            {isPending && <ActivityIndicator size={12} color={tplInfo.color} style={{ marginLeft: 6 }} />}
          </View>
          {wasSent && (
            <View style={styles.sentBadge}>
              <Ionicons name="checkmark-done" size={14} color="#22C55E" />
              <Text style={styles.sentBadgeText}>Sent</Text>
            </View>
          )}
          {isRejected && (
            <TouchableOpacity 
              style={styles.retryBadge} 
              onPress={(e) => { e.stopPropagation(); retryTemplate(item); }}
              disabled={retryingTemplate === item._id}
            >
              {retryingTemplate === item._id ? (
                <ActivityIndicator size={12} color="#F59E0B" />
              ) : (
                <Ionicons name="refresh" size={14} color="#F59E0B" />
              )}
              <Text style={styles.retryBadgeText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.offerActions}>
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[
                styles.whatsappButton, 
                sendingOffer === item._id && styles.whatsappButtonSending,
                !isApproved && styles.whatsappButtonDisabled
              ]} 
              onPress={(e) => { e.stopPropagation(); sendToWhatsApp(item); }}
              disabled={sendingOffer === item._id}
            >
              {sendingOffer === item._id ? (
                <ActivityIndicator size={16} color="#25D366" />
              ) : isPending ? (
                <Ionicons name="time-outline" size={18} color="#F59E0B" />
              ) : isRejected ? (
                <Ionicons name="alert-circle-outline" size={18} color="#EF4444" />
              ) : (
                <Ionicons name="logo-whatsapp" size={18} color={isApproved ? "#25D366" : "#9CA3AF"} />
              )}
              <Text style={[styles.actionButtonText, !isApproved && { color: '#9CA3AF' }]}>
                {sendingOffer === item._id ? 'Sending...' 
                  : isPending ? 'Awaiting Approval' 
                  : isRejected ? 'Template Rejected'
                  : !item.templateStatus || item.templateStatus === 'none' ? 'No Template'
                  : item.targetType && item.targetType !== 'all' ? '🎯 Send' : 'Send'}
              </Text>
            </TouchableOpacity>
            
            <View style={styles.toggleContainer}>
              <Text style={[styles.toggleLabel, { color: item.isActive ? '#22C55E' : '#9CA3AF' }]}>
                {item.isActive ? 'Active' : 'Inactive'}
              </Text>
              {togglingOffer === item._id ? (
                <ActivityIndicator size={20} color="#22C55E" style={{ marginHorizontal: 6 }} />
              ) : (
                <Switch
                  value={item.isActive}
                  onValueChange={() => toggleActive(item)}
                  trackColor={{ false: '#E5E7EB', true: '#BBF7D0' }}
                  thumbColor={item.isActive ? '#22C55E' : '#9CA3AF'}
                  style={{ transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] }}
                />
              )}
            </View>
            
            <TouchableOpacity 
              style={styles.deleteButton} 
              onPress={(e) => { e.stopPropagation(); deleteOffer(item); }}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Toggle loading overlay */}
        {togglingOffer === item._id && (
          <View style={styles.toggleOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  )};

  // Helper to format date nicely
  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Offer Detail Modal
  const renderDetailModal = () => {
    if (!detailOffer) return null;
    const o = detailOffer;
    const tpl = getTemplateStatusInfo(o);
    const hasItems = o.appliedItems && o.appliedItems.length > 0;
    const hasCats = o.appliedCategories && o.appliedCategories.length > 0;
    const isTargeted = o.targetType && o.targetType !== 'all';

    return (
      <Modal visible={!!detailOffer} animationType="slide" transparent onRequestClose={() => setDetailOffer(null)}>
        <View style={styles.detailBackdrop}>
          <View style={styles.detailSheet}>
            {/* Header */}
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Offer Details</Text>
              <TouchableOpacity onPress={() => setDetailOffer(null)} style={styles.detailClose}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
              {/* Image */}
              {o.image && (
                <Image source={{ uri: o.image }} style={styles.detailImage} resizeMode="cover" />
              )}

              {/* Status Row */}
              <View style={styles.detailStatusRow}>
                <View style={[styles.detailChip, { backgroundColor: o.isActive ? '#D1FAE5' : '#FEE2E2' }]}>
                  <View style={[styles.detailDot, { backgroundColor: o.isActive ? '#22C55E' : '#EF4444' }]} />
                  <Text style={[styles.detailChipText, { color: o.isActive ? '#16A34A' : '#DC2626' }]}>
                    {o.isActive ? 'Active' : 'Inactive'}
                  </Text>
                </View>
                <View style={[styles.detailChip, { backgroundColor: tpl.bg }]}>
                  <Ionicons name={tpl.icon} size={14} color={tpl.color} />
                  <Text style={[styles.detailChipText, { color: tpl.color }]}>{tpl.label}</Text>
                </View>
              </View>

              {/* Info Rows */}
              {o.title ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Title</Text>
                  <Text style={styles.detailValue}>{o.title}</Text>
                </View>
              ) : null}

              {o.offerType ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Offer Type</Text>
                  <Text style={styles.detailValue}>{o.offerType}</Text>
                </View>
              ) : null}

              {o.percentage != null ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Discount</Text>
                  <Text style={styles.detailValue}>{o.percentage}% Off</Text>
                </View>
              ) : null}

              {o.description ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Description</Text>
                  <Text style={styles.detailValue}>{o.description}</Text>
                </View>
              ) : null}

              {hasCats ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Categories</Text>
                  <View style={styles.detailTagsRow}>
                    {o.appliedCategories.map((cat, i) => (
                      <View key={i} style={styles.detailTag}>
                        <Text style={styles.detailTagText}>{cat}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {hasItems ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Applied Items</Text>
                  <Text style={styles.detailValue}>{o.appliedItems.length} item{o.appliedItems.length !== 1 ? 's' : ''}</Text>
                </View>
              ) : null}

              {/* Targeting */}
              {isTargeted ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Target Audience</Text>
                  <Text style={styles.detailValue}>
                    {o.targetType === 'top_percentage' ? `Top ${o.targetPercentage || 10}% spenders`
                      : o.targetType === 'min_spent' ? `Min ₹${o.targetMinSpent} spent`
                      : o.targetType === 'min_orders' ? `${o.targetMinOrders}+ orders`
                      : 'All customers'}
                  </Text>
                </View>
              ) : (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Target Audience</Text>
                  <Text style={styles.detailValue}>All customers</Text>
                </View>
              )}

              {o.targetedCustomers && o.targetedCustomers.length > 0 ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Targeted Customers</Text>
                  <Text style={styles.detailValue}>{o.targetedCustomers.length} customers</Text>
                </View>
              ) : null}

              {/* Dates */}
              <View style={styles.detailDivider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Created</Text>
                <Text style={styles.detailValue}>{formatDate(o.createdAt)}</Text>
              </View>

              {o.validUntil ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Valid Until</Text>
                  <Text style={styles.detailValue}>{formatDate(o.validUntil)}</Text>
                </View>
              ) : null}

              {o.templateApprovedAt ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Template Approved</Text>
                  <Text style={styles.detailValue}>{formatDate(o.templateApprovedAt)}</Text>
                </View>
              ) : null}

              {o.broadcastSentAt ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Broadcast Sent</Text>
                  <Text style={styles.detailValue}>{formatDate(o.broadcastSentAt)}</Text>
                </View>
              ) : null}

              {o.templateRejectionReason ? (
                <View style={[styles.detailRow, { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12 }]}>
                  <Text style={[styles.detailLabel, { color: '#DC2626' }]}>Rejection Reason</Text>
                  <Text style={[styles.detailValue, { color: '#DC2626' }]}>{o.templateRejectionReason}</Text>
                </View>
              ) : null}

              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      <ImageBackground
        source={require('../../../assets/backgrounds/offers.jpg')}
        style={styles.header}
        imageStyle={styles.headerBackgroundImage}
      >
        <View style={styles.headerOverlay}>
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.title}>Offers & Promotions</Text>
              <Text style={styles.subtitle}>{offers.length} active offers</Text>
            </View>
            <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('OfferForm', {})} activeOpacity={0.8}>
              <Ionicons name="add" size={24} color={colors.zomato.red} />
            </TouchableOpacity>
          </View>
          {/* Glass Shine Effect */}
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

      {loading ? (
        <ActivityIndicator size="large" color={colors.zomato.red} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={offers}
          renderItem={renderOffer}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          style={styles.flatList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.zomato.red]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="pricetag-outline" size={48} color={colors.light.text.tertiary} />
              </View>
              <Text style={styles.emptyTitle}>No offers yet</Text>
              <Text style={styles.emptyText}>Create your first promotional offer</Text>
              <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('OfferForm', {})} activeOpacity={0.8}>
                <LinearGradient colors={[colors.zomato.red, colors.zomato.darkRed]} style={styles.emptyButtonGradient}>
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.emptyButtonText}>Create Offer</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          }
        />
      )}
      
      {/* Offer Detail Modal */}
      {renderDetailModal()}

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.zomato.red} />
            <Text style={styles.loadingText}>Processing...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  flatList: { flex: 1 },
  header: { paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 35 : 75, paddingBottom: 55, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  headerBackgroundImage: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerOverlay: { backgroundColor: 'rgba(0, 0, 0, 0.4)', marginTop: -(Platform.OS === 'android' ? StatusBar.currentHeight + 35 : 75), marginBottom: -55, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 35 : 75, paddingBottom: 55, paddingHorizontal: spacing.screenHorizontal, overflow: 'hidden' },
  glassShine: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: 100, backgroundColor: 'rgba(255, 255, 255, 0.3)', transform: [{ skewX: '-20deg' }] },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: typography.display.small.fontSize, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: typography.body.medium.fontSize, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  addButton: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', ...shadows.md },
  listContent: { paddingVertical: spacing.md, paddingBottom: 100 },
  offerCard: { 
    backgroundColor: colors.light.surface, 
    borderRadius: 0,
    overflow: 'hidden', 
    marginBottom: spacing.md, 
    ...shadows.card,
    width: '100%',
  },
  offerImageContainer: { 
    width: '100%', 
    backgroundColor: '#f3f4f6', 
    position: 'relative',
    aspectRatio: 16 / 9,
    marginHorizontal: 0,
  },
  offerImage: { 
    width: '100%', 
    height: '100%',
    aspectRatio: 16 / 9,
    resizeMode: 'cover'
  },
  offerImagePlaceholder: { 
    backgroundColor: colors.light.surfaceSecondary, 
    justifyContent: 'center', 
    alignItems: 'center',
    aspectRatio: 16 / 9
  },
  offerTypeBadge: { 
    position: 'absolute', 
    bottom: 12, 
    left: 12, 
    backgroundColor: 'rgba(0, 0, 0, 0.7)', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 8,
    backdropFilter: 'blur(10px)'
  },
  offerTypeText: { 
    color: '#fff', 
    fontSize: 13, 
    fontWeight: '700',
    letterSpacing: 0.5
  },
  offerActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', padding: spacing.md },
  actionButtons: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  whatsappButton: { 
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10, 
    backgroundColor: '#D1FAE5', 
  },
  whatsappButtonSending: {
    opacity: 0.7,
  },
  whatsappButtonDisabled: {
    backgroundColor: '#F3F4F6',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  templateStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  templateStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  templateStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sentBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22C55E',
  },
  retryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  retryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
  },
  statusBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyIconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.light.surfaceSecondary, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.base },
  emptyTitle: { fontSize: typography.headline.small.fontSize, fontWeight: '600', color: colors.light.text.secondary },
  emptyText: { fontSize: typography.body.medium.fontSize, color: colors.light.text.tertiary, marginTop: spacing.xs },
  emptyButton: { marginTop: spacing.lg, borderRadius: radius.lg, overflow: 'hidden' },
  emptyButtonGradient: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  emptyButtonText: { color: '#fff', fontWeight: '600', fontSize: typography.title.medium.fontSize },
  
  // Loading Overlay
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    ...shadows.lg,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: colors.light.text.primary,
  },

  // Toggle loading overlay on card
  toggleOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },

  // Detail Modal Styles
  detailBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: Dimensions.get('window').height * 0.85,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  detailClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailScroll: {
    paddingHorizontal: 20,
  },
  detailImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  detailStatusRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  detailDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailRow: {
    marginBottom: 14,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  detailTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  detailTag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  detailTagText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 8,
  },
});
