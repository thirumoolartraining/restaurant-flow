import { describe, it, expect, beforeEach } from 'vitest';
import { 
  useCartStore, 
  useAuthStore, 
  useOrdersStore, 
  useUIStore, 
  useMenuStore, 
  useOffersStore 
} from '../store';

describe('Zustand Stores', () => {
  describe('useCartStore', () => {
    beforeEach(() => {
      useCartStore.getState().clearCart();
    });

    it('should add item to cart', () => {
      const item = { id: '1', name: 'Pizza', price: 299 };
      useCartStore.getState().addItem(item);
      
      const cart = useCartStore.getState().items;
      expect(cart).toHaveLength(1);
      expect(cart[0]).toMatchObject({ ...item, quantity: 1 });
    });

    it('should increase quantity when adding same item', () => {
      const item = { id: '1', name: 'Pizza', price: 299 };
      useCartStore.getState().addItem(item);
      useCartStore.getState().addItem(item);
      
      const cart = useCartStore.getState().items;
      expect(cart).toHaveLength(1);
      expect(cart[0].quantity).toBe(2);
    });

    it('should remove item from cart', () => {
      const item = { id: '1', name: 'Pizza', price: 299 };
      useCartStore.getState().addItem(item);
      useCartStore.getState().removeItem('1');
      
      const cart = useCartStore.getState().items;
      expect(cart).toHaveLength(0);
    });

    it('should update item quantity', () => {
      const item = { id: '1', name: 'Pizza', price: 299 };
      useCartStore.getState().addItem(item);
      useCartStore.getState().updateQuantity('1', 5);
      
      const cart = useCartStore.getState().items;
      expect(cart[0].quantity).toBe(5);
    });

    it('should calculate total correctly', () => {
      useCartStore.getState().addItem({ id: '1', name: 'Pizza', price: 299 });
      useCartStore.getState().addItem({ id: '2', name: 'Burger', price: 199 });
      
      const total = useCartStore.getState().total;
      expect(total).toBe(498);
    });

    it('should clear cart', () => {
      useCartStore.getState().addItem({ id: '1', name: 'Pizza', price: 299 });
      useCartStore.getState().clearCart();
      
      const cart = useCartStore.getState().items;
      expect(cart).toHaveLength(0);
    });
  });

  describe('useAuthStore', () => {
    beforeEach(() => {
      useAuthStore.getState().logout();
    });

    it('should login user', () => {
      const user = { id: '1', name: 'John Doe', email: 'john@example.com' };
      const token = 'test-token';
      
      useAuthStore.getState().login(user, token);
      
      expect(useAuthStore.getState().user).toEqual(user);
      expect(useAuthStore.getState().token).toBe(token);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('should logout user', () => {
      const user = { id: '1', name: 'John Doe', email: 'john@example.com' };
      useAuthStore.getState().login(user, 'test-token');
      useAuthStore.getState().logout();
      
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('useUIStore', () => {
    it('should toggle sidebar', () => {
      const initialState = useUIStore.getState().sidebarOpen;
      useUIStore.getState().toggleSidebar();
      
      expect(useUIStore.getState().sidebarOpen).toBe(!initialState);
    });

    it('should toggle cart', () => {
      const initialState = useUIStore.getState().cartOpen;
      useUIStore.getState().toggleCart();
      
      expect(useUIStore.getState().cartOpen).toBe(!initialState);
    });

    it('should add and remove notifications', () => {
      useUIStore.getState().addNotification({ message: 'Test', type: 'success' });
      
      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toBe('Test');
      
      useUIStore.getState().removeNotification(notifications[0].id);
      expect(useUIStore.getState().notifications).toHaveLength(0);
    });
  });

  describe('useMenuStore', () => {
    beforeEach(() => {
      useMenuStore.getState().setItems([]);
      useMenuStore.getState().setSelectedCategory(null);
      useMenuStore.getState().setSearchQuery('');
    });

    it('should set menu items', () => {
      const items = [
        { id: '1', name: 'Pizza', price: 299 },
        { id: '2', name: 'Burger', price: 199 }
      ];
      
      useMenuStore.getState().setItems(items);
      expect(useMenuStore.getState().items).toEqual(items);
    });

    it('should filter items by category', () => {
      const items = [
        { id: '1', name: 'Pizza', category: 'Italian', price: 299 },
        { id: '2', name: 'Burger', category: 'American', price: 199 }
      ];
      
      useMenuStore.getState().setItems(items);
      useMenuStore.getState().setSelectedCategory('Italian');
      
      const filtered = useMenuStore.getState().getFilteredItems();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Pizza');
    });

    it('should search items', () => {
      const items = [
        { id: '1', name: 'Margherita Pizza', category: 'Italian', price: 299 },
        { id: '2', name: 'Cheese Burger', category: 'American', price: 199 }
      ];
      
      useMenuStore.getState().setItems(items);
      useMenuStore.getState().setSearchQuery('pizza');
      
      const filtered = useMenuStore.getState().getFilteredItems();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Margherita Pizza');
    });
  });

  describe('useOffersStore', () => {
    beforeEach(() => {
      useOffersStore.getState().setOffers([]);
    });

    it('should set offers', () => {
      const offers = [
        { id: '1', title: '50% Off', discount: 50 },
        { id: '2', title: 'Buy 1 Get 1', discount: 0 }
      ];
      
      useOffersStore.getState().setOffers(offers);
      expect(useOffersStore.getState().offers).toEqual(offers);
    });

    it('should get active offers', () => {
      const now = new Date();
      const offers = [
        { 
          id: '1', 
          title: 'Active Offer', 
          isActive: true,
          validFrom: new Date(now.getTime() - 86400000).toISOString(),
          validUntil: new Date(now.getTime() + 86400000).toISOString()
        },
        { 
          id: '2', 
          title: 'Inactive Offer', 
          isActive: false,
          validFrom: new Date(now.getTime() - 86400000).toISOString(),
          validUntil: new Date(now.getTime() + 86400000).toISOString()
        }
      ];
      
      useOffersStore.getState().setOffers(offers);
      const active = useOffersStore.getState().activeOffers;
      
      expect(active).toHaveLength(1);
      expect(active[0].title).toBe('Active Offer');
    });
  });

  describe('useOrdersStore', () => {
    beforeEach(() => {
      useOrdersStore.getState().setOrders([]);
    });

    it('should set orders', () => {
      const orders = [
        { id: '1', status: 'pending', total: 299 },
        { id: '2', status: 'completed', total: 199 }
      ];
      
      useOrdersStore.getState().setOrders(orders);
      expect(useOrdersStore.getState().orders).toEqual(orders);
    });

    it('should add order', () => {
      const order = { id: '1', status: 'pending', total: 299 };
      
      useOrdersStore.getState().addOrder(order);
      expect(useOrdersStore.getState().orders).toHaveLength(1);
      expect(useOrdersStore.getState().orders[0]).toEqual(order);
    });

    it('should update order', () => {
      const order = { id: '1', status: 'pending', total: 299 };
      useOrdersStore.getState().addOrder(order);
      
      useOrdersStore.getState().updateOrder('1', { status: 'completed' });
      
      const updated = useOrdersStore.getState().orders[0];
      expect(updated.status).toBe('completed');
    });
  });
});
