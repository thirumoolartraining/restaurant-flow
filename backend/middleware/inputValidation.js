/**
 * Input Validation Middleware - Phase 6.3
 * 
 * Purpose: Comprehensive input sanitization and validation using express-validator
 * 
 * Features:
 * - Request body validation
 * - Query parameter validation
 * - Path parameter validation
 * - Automatic sanitization
 * - Custom validation rules
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  
  next();
};

/**
 * Common validation rules
 */
const validationRules = {
  // User validation
  email: body('email')
    .trim()
    .isEmail().withMessage('Invalid email address')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email too long'),
  
  password: body('password')
    .trim()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .isLength({ max: 128 }).withMessage('Password too long')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
  
  phone: body('phone')
    .trim()
    .matches(/^(\+91|91)?[6-9]\d{9}$/).withMessage('Invalid Indian mobile number')
    .customSanitizer(value => {
      // Normalize to +91 format
      const cleaned = value.replace(/[\s\-\(\)]/g, '');
      if (cleaned.startsWith('+91')) return cleaned;
      if (cleaned.startsWith('91')) return '+' + cleaned;
      return '+91' + cleaned.replace(/^0+/, '');
    }),
  
  name: body('name')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Name can only contain letters and spaces')
    .escape(),
  
  // Menu item validation
  itemName: body('name')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Item name must be 2-100 characters')
    .escape(),
  
  itemDescription: body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description too long')
    .escape(),
  
  price: body('price')
    .isFloat({ min: 0, max: 100000 }).withMessage('Invalid price')
    .toFloat(),
  
  quantity: body('quantity')
    .isInt({ min: 1, max: 50 }).withMessage('Quantity must be between 1 and 50')
    .toInt(),
  
  // Category validation
  category: body('category')
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Category must be 2-50 characters')
    .escape(),
  
  // Order validation
  orderId: param('orderId')
    .trim()
    .matches(/^[A-Z0-9]+$/).withMessage('Invalid order ID format')
    .isLength({ min: 5, max: 20 }).withMessage('Invalid order ID length'),
  
  // Location validation
  latitude: body('latitude')
    .isFloat({ min: 8, max: 37 }).withMessage('Invalid latitude for India')
    .toFloat(),
  
  longitude: body('longitude')
    .isFloat({ min: 68, max: 97 }).withMessage('Invalid longitude for India')
    .toFloat(),
  
  address: body('address')
    .trim()
    .isLength({ min: 10, max: 500 }).withMessage('Address must be 10-500 characters')
    .escape(),
  
  // Payment validation
  amount: body('amount')
    .isFloat({ min: 1, max: 100000 }).withMessage('Invalid amount')
    .toFloat(),
  
  // ID validation
  mongoId: param('id')
    .trim()
    .isMongoId().withMessage('Invalid ID format'),
  
  // Boolean validation
  boolean: body('*')
    .optional()
    .isBoolean().withMessage('Must be true or false')
    .toBoolean(),
  
  // Date validation
  date: body('date')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .toDate(),
  
  // URL validation
  url: body('url')
    .optional()
    .trim()
    .isURL().withMessage('Invalid URL')
    .isLength({ max: 2048 }).withMessage('URL too long'),
  
  // Search query validation
  searchQuery: query('q')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Search query must be 1-100 characters')
    .escape(),
  
  // Pagination validation
  page: query('page')
    .optional()
    .isInt({ min: 1, max: 1000 }).withMessage('Invalid page number')
    .toInt(),
  
  limit: query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt()
};

/**
 * Validation chains for specific routes
 */
const validators = {
  // Auth validators
  register: [
    validationRules.email,
    validationRules.password,
    validationRules.name,
    validationRules.phone,
    handleValidationErrors
  ],
  
  login: [
    validationRules.email,
    body('password').trim().notEmpty().withMessage('Password is required'),
    handleValidationErrors
  ],
  
  // Menu validators
  createMenuItem: [
    validationRules.itemName,
    validationRules.itemDescription,
    validationRules.price,
    validationRules.category,
    body('foodType')
      .isIn(['veg', 'nonveg', 'egg']).withMessage('Invalid food type'),
    body('available')
      .optional()
      .isBoolean().withMessage('Available must be true or false')
      .toBoolean(),
    handleValidationErrors
  ],
  
  updateMenuItem: [
    validationRules.mongoId,
    validationRules.itemName.optional(),
    validationRules.itemDescription,
    validationRules.price.optional(),
    handleValidationErrors
  ],
  
  // Cart validators
  addToCart: [
    body('itemId').trim().isMongoId().withMessage('Invalid item ID'),
    validationRules.quantity,
    handleValidationErrors
  ],
  
  // Order validators
  createOrder: [
    body('serviceType')
      .isIn(['delivery', 'pickup']).withMessage('Invalid service type'),
    body('paymentMethod')
      .isIn(['online', 'cod']).withMessage('Invalid payment method'),
    handleValidationErrors
  ],
  
  updateOrderStatus: [
    validationRules.orderId,
    body('status')
      .isIn(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'])
      .withMessage('Invalid order status'),
    handleValidationErrors
  ],
  
  // Location validators
  updateLocation: [
    validationRules.latitude,
    validationRules.longitude,
    validationRules.address,
    handleValidationErrors
  ],
  
  // Payment validators
  createPayment: [
    validationRules.amount,
    validationRules.orderId,
    handleValidationErrors
  ],
  
  // Search validators
  search: [
    validationRules.searchQuery,
    validationRules.page,
    validationRules.limit,
    handleValidationErrors
  ],
  
  // Generic ID validator
  validateId: [
    validationRules.mongoId,
    handleValidationErrors
  ],
  
  // Phone validator
  validatePhone: [
    validationRules.phone,
    handleValidationErrors
  ]
};

/**
 * Sanitize all string inputs
 */
const sanitizeInputs = (req, res, next) => {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    }
  }
  
  // Sanitize query
  if (req.query && typeof req.query === 'object') {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim();
      }
    }
  }
  
  next();
};

module.exports = {
  validators,
  validationRules,
  handleValidationErrors,
  sanitizeInputs
};
