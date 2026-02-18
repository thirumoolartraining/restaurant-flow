/**
 * Menu Handler Domain Tests - Phase 6.6
 *
 * Tests menuHandler domain functions:
 * - showMainMenu
 * - browseMenu
 * - showCategory
 * - showItemDetails
 * - filterByFoodType
 * - searchItem
 */

// Mock logger first
jest.mock('../../services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock whatsapp service
jest.mock('../../services/whatsapp', () => ({
  sendButtons: jest.fn().mockResolvedValue(true),
  sendImageWithButtons: jest.fn().mockResolvedValue(true),
  sendList: jest.fn().mockResolvedValue(true),
  sendMessage: jest.fn().mockResolvedValue(true)
}));

// Mock chatbotImages
jest.mock('../../services/chatbotImages', () => ({
  getImageUrl: jest.fn().mockResolvedValue(null)
}));

// Mock conversationState
jest.mock('../../services/conversationState', () => ({
  transitionTo: jest.fn(),
  setFoodTypePreference: jest.fn(),
  getFoodTypePreference: jest.fn().mockReturnValue('all'),
  setSelectedCategory: jest.fn(),
  setSelectedItem: jest.fn(),
  setContext: jest.fn(),
  getContext: jest.fn()
}));

// Mock MenuItem model
jest.mock('../../models/MenuItem', () => {
  const mockSort = jest.fn().mockReturnThis();
  const mockSkip = jest.fn().mockReturnThis();
  const mockLimit = jest.fn().mockResolvedValue([]);

  return {
    find: jest.fn(() => ({
      sort: mockSort,
      skip: mockSkip,
      limit: mockLimit
    })),
    findById: jest.fn(),
    countDocuments: jest.fn().mockResolvedValue(0)
  };
});

// Mock Category model
jest.mock('../../models/Category', () => ({
  find: jest.fn().mockResolvedValue([])
}));

const menuHandler = require('../../services/domains/menuHandler');
const whatsapp = require('../../services/whatsapp');
const chatbotImagesService = require('../../services/chatbotImages');
const MenuItem = require('../../models/MenuItem');
const conversationState = require('../../services/conversationState');

// Helper to create mock customer
function createMockCustomer(overrides = {}) {
  return {
    name: 'Test Customer',
    phone: '919876543210',
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
}

describe('menuHandler', () => {
  const phone = '919876543210';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('showMainMenu', () => {
    it('should send welcome with buttons (no image)', async () => {
      const customer = createMockCustomer();
      chatbotImagesService.getImageUrl.mockResolvedValue(null);

      await menuHandler.showMainMenu(customer, phone);

      expect(chatbotImagesService.getImageUrl).toHaveBeenCalledWith('welcome');
      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        phone,
        expect.stringContaining('Welcome Test Customer'),
        expect.arrayContaining([
          expect.objectContaining({ id: 'order_food' }),
          expect.objectContaining({ id: 'my_orders' }),
          expect.objectContaining({ id: 'open_website' })
        ])
      );
      expect(conversationState.transitionTo).toHaveBeenCalledWith(customer, 'main_menu');
      expect(customer.save).toHaveBeenCalled();
    });

    it('should send image with buttons when welcome image exists', async () => {
      const customer = createMockCustomer();
      chatbotImagesService.getImageUrl.mockResolvedValue('https://img.test/welcome.jpg');

      await menuHandler.showMainMenu(customer, phone);

      expect(whatsapp.sendImageWithButtons).toHaveBeenCalledWith(
        phone,
        'https://img.test/welcome.jpg',
        expect.stringContaining('Welcome'),
        expect.any(Array)
      );
    });
  });

  describe('browseMenu', () => {
    it('should show categories with list when items available', async () => {
      const customer = createMockCustomer();
      MenuItem.find.mockResolvedValueOnce([
        { category: 'Starters', foodType: 'veg', available: true, name: 'Paneer Tikka' },
        { category: 'Starters', foodType: 'nonveg', available: true, name: 'Chicken 65' },
        { category: 'Mains', foodType: 'veg', available: true, name: 'Dal Fry' }
      ]);

      await menuHandler.browseMenu(customer, phone);

      expect(MenuItem.find).toHaveBeenCalledWith({ available: true });
      expect(whatsapp.sendList).toHaveBeenCalledWith(
        phone,
        expect.any(String),
        expect.stringContaining('3 items'),
        'View Categories',
        expect.any(Array)
      );
      expect(customer.save).toHaveBeenCalled();
    });

    it('should filter items by veg food type', async () => {
      const customer = createMockCustomer();
      MenuItem.find.mockResolvedValueOnce([
        { category: 'Starters', foodType: 'veg', available: true },
        { category: 'Starters', foodType: 'nonveg', available: true }
      ]);

      await menuHandler.browseMenu(customer, phone, 'veg');

      // Only veg items in the list
      expect(whatsapp.sendList).toHaveBeenCalledWith(
        phone,
        expect.stringContaining('Veg'),
        expect.stringContaining('1 item'),
        'View Categories',
        expect.any(Array)
      );
    });

    it('should show no items message when category empty', async () => {
      const customer = createMockCustomer();
      MenuItem.find.mockResolvedValueOnce([]);

      await menuHandler.browseMenu(customer, phone);

      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        phone,
        expect.stringContaining('No'),
        expect.any(Array)
      );
    });
  });

  describe('showCategory', () => {
    it('should show items in a category', async () => {
      const customer = createMockCustomer();
      conversationState.getFoodTypePreference.mockReturnValue('all');
      MenuItem.countDocuments.mockResolvedValueOnce(2);

      const mockItems = [
        { _id: 'item1', name: 'Paneer Tikka', price: 250, foodType: 'veg', category: 'Starters' },
        { _id: 'item2', name: 'Chicken 65', price: 300, foodType: 'nonveg', category: 'Starters' }
      ];
      MenuItem.find.mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockItems)
          })
        })
      });

      await menuHandler.showCategory(customer, phone, { category: 'Starters' });

      expect(whatsapp.sendList).toHaveBeenCalledWith(
        phone,
        expect.stringContaining('Starters'),
        expect.any(String),
        'View Items',
        expect.any(Array)
      );
      expect(conversationState.setSelectedCategory).toHaveBeenCalledWith(customer, 'Starters');
      expect(customer.save).toHaveBeenCalled();
    });

    it('should show no items message when category is empty', async () => {
      const customer = createMockCustomer();
      MenuItem.countDocuments.mockResolvedValueOnce(0);
      MenuItem.find.mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      await menuHandler.showCategory(customer, phone, { category: 'Empty' });

      expect(whatsapp.sendMessage).toHaveBeenCalledWith(
        phone,
        expect.stringContaining('No items available')
      );
    });
  });

  describe('showItemDetails', () => {
    it('should show item details with buttons', async () => {
      const customer = createMockCustomer();
      const mockItem = {
        _id: 'item123',
        name: 'Paneer Tikka',
        description: 'Grilled paneer cubes',
        price: 250,
        category: 'Starters',
        foodType: 'veg',
        available: true,
        preparationTime: 20,
        image: null
      };
      MenuItem.findById.mockResolvedValueOnce(mockItem);

      await menuHandler.showItemDetails(customer, phone, { itemId: 'item123' });

      expect(MenuItem.findById).toHaveBeenCalledWith('item123');
      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        phone,
        expect.stringContaining('Paneer Tikka'),
        expect.arrayContaining([
          expect.objectContaining({ id: 'add_to_cart_item123' }),
          expect.objectContaining({ id: 'view_menu' }),
          expect.objectContaining({ id: 'view_cart' })
        ])
      );
      expect(conversationState.setSelectedItem).toHaveBeenCalledWith(customer, 'item123');
      expect(customer.save).toHaveBeenCalled();
    });

    it('should show not available when item missing', async () => {
      const customer = createMockCustomer();
      MenuItem.findById.mockResolvedValueOnce(null);

      await menuHandler.showItemDetails(customer, phone, { itemId: 'missing' });

      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        phone,
        expect.stringContaining('not available'),
        expect.any(Array)
      );
    });

    it('should send image when item has image url', async () => {
      const customer = createMockCustomer();
      const mockItem = {
        _id: 'item456',
        name: 'Biryani',
        description: 'Hyderabadi biryani',
        price: 350,
        category: 'Rice',
        foodType: 'nonveg',
        available: true,
        preparationTime: 30,
        image: 'https://img.test/biryani.jpg'
      };
      MenuItem.findById.mockResolvedValueOnce(mockItem);

      await menuHandler.showItemDetails(customer, phone, { itemId: 'item456' });

      expect(whatsapp.sendImageWithButtons).toHaveBeenCalledWith(
        phone,
        'https://img.test/biryani.jpg',
        expect.stringContaining('Biryani'),
        expect.any(Array)
      );
    });
  });

  describe('filterByFoodType', () => {
    const items = [
      { foodType: 'veg', name: 'Dal' },
      { foodType: 'nonveg', name: 'Chicken' },
      { foodType: 'egg', name: 'Omelette' },
      { foodType: 'veg', name: 'Paneer' }
    ];

    it('should return all items when foodType is all', () => {
      const result = menuHandler.filterByFoodType(items, 'all');
      expect(result).toHaveLength(4);
    });

    it('should filter veg items only', () => {
      const result = menuHandler.filterByFoodType(items, 'veg');
      expect(result).toHaveLength(2);
      expect(result.every(i => i.foodType === 'veg')).toBe(true);
    });

    it('should filter nonveg items only', () => {
      const result = menuHandler.filterByFoodType(items, 'nonveg');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Chicken');
    });

    it('should return all when no foodType provided', () => {
      const result = menuHandler.filterByFoodType(items, null);
      expect(result).toHaveLength(4);
    });
  });

  describe('FOOD_TYPES constant', () => {
    it('should export correct food type constants', () => {
      expect(menuHandler.FOOD_TYPES).toEqual({
        VEG: 'veg',
        NON_VEG: 'nonveg',
        EGG: 'egg',
        ALL: 'all'
      });
    });
  });
});
