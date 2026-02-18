/**
 * Zustand Store - Phase 6.11
 * 
 * Purpose: Global state management
 * 
 * Features:
 * - Cart management
 * - User authentication
 * - Orders tracking
 * - UI state
 * - Persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// Cart Store
export const useCartStore = create(
  persist(
    immer((set, get) => ({
      items: [],
      total: 0,
      
      // Add item to cart
      addItem: (item) => set((state) => {
        const existingItem = state.items.find(i => i.id === item.id);
        
        if (existingItem) {
          existingItem.quantity += item.quantity || 1;
        } else {
          state.items.push({ ...item, quantity: item.quantity || 1 });
        }
        
        state.total = state.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      }),
      
      // Remove item from cart
      removeItem: (itemId) => set((state) => {
        state.items = state.items.filter(i => i.id !== itemId);
        state.total = state.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      }),
      
      // Update item quantity
      updateQuantity: (itemId, quantity) => set((state) => {
        const item = state.items.find(i => i.id === itemId);
        if (item) {
          item.quantity = quantity;
          if (quantity <= 0) {
            state.items = state.items.filter(i => i.id !== itemId);
          }
        }
        state.total = state.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      }),
      
      // Clear cart
      clearCart: () => set({ items: [], total: 0 }),
      
      // Get cart count
      getCartCount: () => {
        const state = get();
        return state.items.reduce((sum, i) => sum + i.quantity, 0);
      },
    })),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Auth Store
export const useAuthStore = create(
  persist(
    immer((set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      
      // Login
      login: (user, token) => set((state) => {
        state.user = user;
        state.token = token;
        state.isAuthenticated = true;
      }),
      
      // Logout
      logout: () => set((state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
      }),
      
      // Update user
      updateUser: (userData) => set((state) => {
        state.user = { ...state.user, ...userData };
      }),
    })),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Orders Store
export const useOrdersStore = create(
  immer((set) => ({
    orders: [],
    currentOrder: null,
    loading: false,
    error: null,
    
    // Set orders
    setOrders: (orders) => set((state) => {
      state.orders = orders;
    }),
    
    // Add order
    addOrder: (order) => set((state) => {
      state.orders.unshift(order);
    }),
    
    // Update order
    updateOrder: (orderId, updates) => set((state) => {
      const order = state.orders.find(o => o.id === orderId);
      if (order) {
        Object.assign(order, updates);
      }
      if (state.currentOrder?.id === orderId) {
        Object.assign(state.currentOrder, updates);
      }
    }),
    
    // Set current order
    setCurrentOrder: (order) => set((state) => {
      state.currentOrder = order;
    }),
    
    // Set loading
    setLoading: (loading) => set((state) => {
      state.loading = loading;
    }),
    
    // Set error
    setError: (error) => set((state) => {
      state.error = error;
    }),
  }))
);

// UI Store
export const useUIStore = create(
  immer((set) => ({
    sidebarOpen: false,
    cartOpen: false,
    modalOpen: false,
    modalContent: null,
    notifications: [],
    theme: 'light',
    
    // Toggle sidebar
    toggleSidebar: () => set((state) => {
      state.sidebarOpen = !state.sidebarOpen;
    }),
    
    // Toggle cart
    toggleCart: () => set((state) => {
      state.cartOpen = !state.cartOpen;
    }),
    
    // Open modal
    openModal: (content) => set((state) => {
      state.modalOpen = true;
      state.modalContent = content;
    }),
    
    // Close modal
    closeModal: () => set((state) => {
      state.modalOpen = false;
      state.modalContent = null;
    }),
    
    // Add notification
    addNotification: (notification) => set((state) => {
      state.notifications.push({
        id: Date.now(),
        ...notification,
      });
    }),
    
    // Remove notification
    removeNotification: (id) => set((state) => {
      state.notifications = state.notifications.filter(n => n.id !== id);
    }),
    
    // Set theme
    setTheme: (theme) => set((state) => {
      state.theme = theme;
      document.documentElement.setAttribute('data-theme', theme);
    }),
  }))
);

// Menu Store
export const useMenuStore = create(
  immer((set) => ({
    items: [],
    categories: [],
    selectedCategory: null,
    searchQuery: '',
    loading: false,
    error: null,
    
    // Set menu items
    setItems: (items) => set((state) => {
      state.items = items;
    }),
    
    // Set categories
    setCategories: (categories) => set((state) => {
      state.categories = categories;
    }),
    
    // Set selected category
    setSelectedCategory: (category) => set((state) => {
      state.selectedCategory = category;
    }),
    
    // Set search query
    setSearchQuery: (query) => set((state) => {
      state.searchQuery = query;
    }),
    
    // Set loading
    setLoading: (loading) => set((state) => {
      state.loading = loading;
    }),
    
    // Set error
    setError: (error) => set((state) => {
      state.error = error;
    }),
    
    // Get filtered items
    getFilteredItems: () => {
      const state = useMenuStore.getState();
      let filtered = state.items;
      
      if (state.selectedCategory) {
        filtered = filtered.filter(item => item.category === state.selectedCategory);
      }
      
      if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        filtered = filtered.filter(item =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
        );
      }
      
      return filtered;
    },
  }))
);

// Offers Store
export const useOffersStore = create(
  immer((set) => ({
    offers: [],
    activeOffers: [],
    loading: false,
    error: null,
    
    // Set offers
    setOffers: (offers) => set((state) => {
      state.offers = offers;
      state.activeOffers = offers.filter(o => o.isActive);
    }),
    
    // Set loading
    setLoading: (loading) => set((state) => {
      state.loading = loading;
    }),
    
    // Set error
    setError: (error) => set((state) => {
      state.error = error;
    }),
  }))
);

// Export all stores
export default {
  useCartStore,
  useAuthStore,
  useOrdersStore,
  useUIStore,
  useMenuStore,
  useOffersStore,
};
