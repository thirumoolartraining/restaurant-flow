// Chatbot Images Service - Get dynamic images for WhatsApp messages
const ChatbotImage = require('../models/ChatbotImage');
const logger = require('./logger');

// Cache for images (refresh every 5 minutes)
let imageCache = {};
let lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const chatbotImagesService = {
  /**
   * Get image URL by key
   * @param {string} key - Image key (e.g., 'cart_cleared', 'order_confirmed')
   * @returns {Promise<string|null>} - Image URL or null if not configured
   */
  async getImageUrl(key) {
    try {
      const now = Date.now();
      // Return from cache if within TTL
      if ((now - lastCacheTime) < CACHE_TTL && key in imageCache) {
        return imageCache[key];
      }

      // Cache expired — reload ALL images in one query instead of individual lookups
      if ((now - lastCacheTime) >= CACHE_TTL) {
        const images = await ChatbotImage.find().lean();
        imageCache = {};
        images.forEach(img => {
          if (img.imageUrl) {
            imageCache[img.key] = img.imageUrl;
          }
        });
        lastCacheTime = now;
      }

      return imageCache[key] || null;
    } catch (error) {
      logger.error(`Error fetching chatbot image ${key}:`, error.message);
      return null;
    }
  },

  /**
   * Refresh cache - call this after image updates
   */
  clearCache() {
    imageCache = {};
    lastCacheTime = 0;
  },

  /**
   * Get all images (for preloading)
   * @returns {Promise<Object>} - Object with all image URLs
   */
  async getAllImages() {
    try {
      const images = await ChatbotImage.find();
      const result = {};
      
      images.forEach(img => {
        if (img.imageUrl) {
          result[img.key] = img.imageUrl;
        }
      });

      // Update cache
      imageCache = result;
      lastCacheTime = Date.now();
      
      return result;
    } catch (error) {
      logger.error('Error fetching all chatbot images:', error.message);
      return {};
    }
  }
};

module.exports = chatbotImagesService;
