const express = require('express');
const logger = require('../services/logger');
const router = express.Router();
const ChatbotImage = require('../models/ChatbotImage');
const cloudinaryService = require('../services/cloudinary');
const chatbotImagesService = require('../services/chatbotImages');
const auth = require('../middleware/auth');
const { adminRateLimiter } = require('../middleware/rateLimiter');
const multer = require('multer');

// Apply admin rate limiting
router.use(adminRateLimiter);

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Rate limiting for chatbot images routes
router.use(adminRateLimiter);

// Default images configuration (no URLs - admin must upload)
const defaultImages = [
  {
    key: 'welcome',
    name: 'Welcome Message',
    description: 'Shown when customer sends Hi/Hello - Restaurant welcome image with Perivi Hotel branding',
    imageUrl: ''
  },
  {
    key: 'my_orders',
    name: 'My Orders',
    description: 'Shown when customer clicks My Orders button',
    imageUrl: ''
  },
  {
    key: 'cart_cleared',
    name: 'Cart Cleared',
    description: 'Shown when customer clears their cart',
    imageUrl: ''
  },
  {
    key: 'added_to_cart',
    name: 'Added to Cart',
    description: 'Shown when item is added to cart',
    imageUrl: ''
  },
  {
    key: 'order_confirmed',
    name: 'Order Confirmed',
    description: 'Shown when order is confirmed (COD)',
    imageUrl: ''
  },
  {
    key: 'no_orders_found',
    name: 'No Orders Found',
    description: 'Shown when customer has no order history',
    imageUrl: ''
  },
  {
    key: 'your_orders',
    name: 'Your Orders',
    description: 'Shown when displaying order history',
    imageUrl: ''
  },
  {
    key: 'no_active_orders',
    name: 'No Active Orders',
    description: 'Shown when no orders to track',
    imageUrl: ''
  },
  {
    key: 'order_cancelled',
    name: 'Order Cancelled',
    description: 'Shown when order is cancelled',
    imageUrl: ''
  },
  {
    key: 'payment_success',
    name: 'Payment Success',
    description: 'Shown when online payment is successful',
    imageUrl: ''
  },
  {
    key: 'preparing',
    name: 'Preparing Order',
    description: 'Shown when order status changes to preparing',
    imageUrl: ''
  },
  {
    key: 'out_for_delivery',
    name: 'Out for Delivery',
    description: 'Shown when order is out for delivery',
    imageUrl: ''
  },
  {
    key: 'ready',
    name: 'Order Ready',
    description: 'Shown when order is ready for pickup/delivery',
    imageUrl: ''
  },
  {
    key: 'delivered',
    name: 'Order Delivered',
    description: 'Shown when order is delivered',
    imageUrl: ''
  },
  {
    key: 'item_not_available',
    name: 'Item Not Available',
    description: 'Shown when requested item is not available',
    imageUrl: ''
  },
  {
    key: 'order_tracking',
    name: 'Order Tracking',
    description: 'Shown when displaying order tracking details',
    imageUrl: ''
  },
  {
    key: 'order_summary',
    name: 'Order Summary',
    description: 'Shown when displaying order summary before payment',
    imageUrl: ''
  },
  {
    key: 'order_details',
    name: 'Order Details',
    description: 'Shown when displaying order details with payment link',
    imageUrl: ''
  },
  {
    key: 'browse_menu',
    name: 'Browse Menu',
    description: 'Shown when displaying menu browsing options (Veg/Non-Veg/All)',
    imageUrl: ''
  },
  {
    key: 'payment_timeout_cancelled',
    name: 'Payment Timeout Cancelled',
    description: 'Shown when order is cancelled due to payment not received within 15 minutes',
    imageUrl: ''
  },
  {
    key: 'cart_empty',
    name: 'Cart Empty',
    description: 'Shown when customer views an empty cart',
    imageUrl: ''
  },
  {
    key: 'help_support',
    name: 'Help & Support',
    description: 'Shown when displaying help and support information',
    imageUrl: ''
  },
  {
    key: 'view_cart',
    name: 'View Cart',
    description: 'Shown when displaying cart with items',
    imageUrl: ''
  },
  {
    key: 'open_website',
    name: 'Open Website',
    description: 'Shown when user selects Open Website option with CTA button',
    imageUrl: ''
  },
  {
    key: 'cart_expiry_warning',
    name: 'Cart Expiry Warning',
    description: 'Shown when cart items will expire in 10 minutes due to inactivity',
    imageUrl: ''
  },
  {
    key: 'cart_items_removed',
    name: 'Cart Items Removed',
    description: 'Shown when cart items are removed after 30 minutes of inactivity',
    imageUrl: ''
  },
  {
    key: 'pickup_confirmed',
    name: 'Pickup Order Confirmed',
    description: 'Shown when pickup order is confirmed by admin from dashboard',
    imageUrl: ''
  },
  {
    key: 'pickup_order_requested',
    name: 'Pickup Order Requested',
    description: 'Shown when customer places a self-pickup pay-at-hotel order request',
    imageUrl: ''
  },
  {
    key: 'pickup_ready',
    name: 'Pickup Order Ready',
    description: 'Shown when pickup order is ready for collection at restaurant',
    imageUrl: ''
  },
  {
    key: 'pickup_completed',
    name: 'Pickup Order Completed',
    description: 'Shown when customer has picked up their order (with bill and order details)',
    imageUrl: ''
  },
  {
    key: 'pickup_tracking',
    name: 'Pickup Order Tracking',
    description: 'Shown when customer tracks their pickup order status',
    imageUrl: ''
  },
  {
    key: 'pickup_cancelled',
    name: 'Pickup Order Cancelled',
    description: 'Shown when pickup order is successfully cancelled',
    imageUrl: ''
  },
  {
    key: 'pickup_cancel_restricted',
    name: 'Pickup Cancel Restricted',
    description: 'Shown when customer tries to cancel pickup order after confirmation',
    imageUrl: ''
  },
  {
    key: 'pickup_order_summary',
    name: 'Pickup Order Summary',
    description: 'Shown when displaying order summary for self-pickup before payment selection',
    imageUrl: ''
  },
  {
    key: 'pickup_cancelled_by_restaurant',
    name: 'Pickup Order Cancelled by Restaurant',
    description: 'Shown when admin cancels a self-pickup pay-at-hotel order from the app',
    imageUrl: ''
  },
  {
    key: 'order_cancelled_by_restaurant',
    name: 'Delivery Order Cancelled by Restaurant',
    description: 'Shown when admin cancels a COD delivery order from the app',
    imageUrl: ''
  },
  {
    key: 'offer_not_eligible',
    name: 'Offer Not Eligible',
    description: 'Shown when customer tries to claim a targeted offer they are not eligible for (shared link)',
    imageUrl: ''
  }
];

// Initialize default images if not exist
router.post('/init', auth, async (req, res) => {
  try {
    for (const img of defaultImages) {
      await ChatbotImage.findOneAndUpdate(
        { key: img.key },
        img,
        { upsert: true, new: true }
      );
    }
    res.json({ message: 'Default images initialized', count: defaultImages.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all chatbot images
router.get('/', auth, async (req, res) => {
  try {
    let images = await ChatbotImage.find().sort('name');
    
    // If no images exist, initialize all defaults
    if (images.length === 0) {
      logger.info('[Chatbot Images] No images found, initializing defaults...');
      for (const img of defaultImages) {
        try {
          await ChatbotImage.create(img);
        } catch (createErr) {
          logger.error(`[Chatbot Images] Error creating ${img.key}:`, createErr.message);
        }
      }
      images = await ChatbotImage.find().sort('name');
    } else {
      // Check for missing images and add them
      const existingKeys = images.map(img => img.key);
      const missingImages = defaultImages.filter(img => !existingKeys.includes(img.key));
      
      if (missingImages.length > 0) {
        logger.info(`[Chatbot Images] Found ${missingImages.length} missing images, adding them...`);
        for (const img of missingImages) {
          try {
            await ChatbotImage.create(img);
            logger.info(`[Chatbot Images] Added missing image: ${img.key}`);
          } catch (createErr) {
            logger.error(`[Chatbot Images] Error creating ${img.key}:`, createErr.message);
            // Continue with other images even if one fails
          }
        }
        images = await ChatbotImage.find().sort('name');
      }
    }
    
    res.json(images);
  } catch (error) {
    logger.error('[Chatbot Images] GET error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single image by key (for chatbot use - no auth)
router.get('/key/:key', async (req, res) => {
  try {
    const image = await ChatbotImage.findOne({ key: req.params.key });
    if (!image) {
      // Return default if not found
      const defaultImg = defaultImages.find(d => d.key === req.params.key);
      if (defaultImg) {
        return res.json({ imageUrl: defaultImg.imageUrl });
      }
      return res.status(404).json({ error: 'Image not found' });
    }
    res.json({ imageUrl: image.imageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload and update image
router.put('/:key', auth, upload.single('image'), async (req, res) => {
  try {
    const { key } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Find existing image
    let chatbotImage = await ChatbotImage.findOne({ key });
    
    // Delete old image from Cloudinary if exists
    if (chatbotImage?.cloudinaryPublicId) {
      try {
        await cloudinaryService.deleteImage(chatbotImage.cloudinaryPublicId);
      } catch (e) {
        logger.info('Could not delete old image:', e.message);
      }
    }

    // Upload new image to Cloudinary with 2:1 aspect ratio (1200x600)
    const cloudinary = require('cloudinary').v2;
    
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'restaurant-bot/chatbot-images',
          public_id: `chatbot_${key}_${Date.now()}`,
          transformation: [
            { width: 1200, height: 600, crop: 'fill', gravity: 'center' },
            { quality: 'auto:best', fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Update or create image record
    const defaultImg = defaultImages.find(d => d.key === key);
    
    chatbotImage = await ChatbotImage.findOneAndUpdate(
      { key },
      {
        key,
        name: defaultImg?.name || key,
        description: defaultImg?.description || '',
        imageUrl: uploadResult.secure_url,
        cloudinaryPublicId: uploadResult.public_id,
        aspectRatio: '2:1'
      },
      { upsert: true, new: true }
    );

    // Clear cache so new image is used immediately
    chatbotImagesService.clearCache();
    logger.info(`[Chatbot Images] Cache cleared after uploading ${key}`);

    res.json(chatbotImage);
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reset image to default
router.post('/:key/reset', auth, async (req, res) => {
  try {
    const { key } = req.params;
    const defaultImg = defaultImages.find(d => d.key === key);
    
    if (!defaultImg) {
      return res.status(404).json({ error: 'Invalid image key' });
    }

    // Find and delete from Cloudinary if custom image exists
    const existing = await ChatbotImage.findOne({ key });
    if (existing?.cloudinaryPublicId) {
      try {
        await cloudinaryService.deleteImage(existing.cloudinaryPublicId);
      } catch (e) {
        logger.info('Could not delete image:', e.message);
      }
    }

    // Reset to default
    const chatbotImage = await ChatbotImage.findOneAndUpdate(
      { key },
      { ...defaultImg, cloudinaryPublicId: null },
      { upsert: true, new: true }
    );

    // Clear cache so reset takes effect immediately
    chatbotImagesService.clearCache();
    logger.info(`[Chatbot Images] Cache cleared after resetting ${key}`);

    res.json(chatbotImage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
