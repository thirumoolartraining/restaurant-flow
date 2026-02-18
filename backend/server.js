require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const dataEvents = require('./services/eventEmitter');
const { validateEnv } = require('./config/envValidation');
const { corsOptions } = require('./config/corsConfig');
const errorHandler = require('./middleware/errorHandler');
const { sanitizeInputs } = require('./middleware/inputValidation');
const logger = require('./services/logger');
const { swaggerUi, swaggerSpec } = require('./swagger');

const authRoutes = require('./routes/auth');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/order');
const webhookRoutes = require('./routes/webhook');
const paymentRoutes = require('./routes/payment');
const customerRoutes = require('./routes/customer');
const analyticsRoutes = require('./routes/analytics');
const aiRoutes = require('./routes/ai');
const categoryRoutes = require('./routes/category');
const publicRoutes = require('./routes/public');
const chatbotImagesRoutes = require('./routes/chatbotImages');
const deliveryBoyRoutes = require('./routes/deliveryboy');
const heroSectionRoutes = require('./routes/heroSection');
const offersRoutes = require('./routes/offers');
const whatsappBroadcastRoutes = require('./routes/whatsappBroadcast');
const settingsRoutes = require('./routes/settings');
const healthRoutes = require('./routes/health');
const orderScheduler = require('./services/orderScheduler');
const dailyCleanup = require('./services/dailyCleanup');
const categoryScheduler = require('./services/categoryScheduler');
const orderCleanup = require('./services/orderCleanup');
const cartCleanup = require('./services/cartCleanup');
const googleSheets = require('./services/googleSheets');

// Validate environment variables at startup
validateEnv(process.env.NODE_ENV === 'production');

const app = express();

// Trust proxy (required behind nginx/load balancer for correct req.ip)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API server (frontend handles its own)
  crossOriginEmbedderPolicy: false
}));

// Response compression
app.use(compression());

// CORS configuration (using environment-aware config)
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// Body parsing with size limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Global input sanitization
app.use(sanitizeInputs);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logging with structured logger
app.use('/api', (req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    type: 'request'
  });
  next();
});

// Swagger API documentation (disabled in production if preferred)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customSiteTitle: 'FoodAdmin API Docs'
  }));
}
// Swagger JSON spec always available for tools
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// MongoDB connection with reconnection handling
const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
    });
    logger.info('MongoDB connected successfully');
    
    // Start schedulers after DB connection
    orderScheduler.start();
    dailyCleanup.start();
    categoryScheduler.start();
    orderCleanup.start();
    cartCleanup.startCartCleanupScheduler();
    
    // Initialize Google Sheets - auto-create missing sheets, then initialize headers
    logger.info('Initializing Google Sheets...');
    await googleSheets.ensureAllSheetsExist();
    await googleSheets.initializeDailyReportsSheet();
    await googleSheets.initializeDashboardStatsSheet();
    await googleSheets.initializeCustomersSheet();
    logger.info('Google Sheets initialized');
  } catch (err) {
    logger.error('MongoDB connection error', { error: err.message, stack: err.stack });
    // Retry after 5 seconds
    logger.info('Retrying MongoDB connection in 5 seconds...');
    setTimeout(connectMongoDB, 5000);
  }
};

// MongoDB connection event handlers
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Attempting reconnect...');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected successfully');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', { error: err.message });
});

connectMongoDB();

app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/chatbot-images', chatbotImagesRoutes);
app.use('/api/delivery', deliveryBoyRoutes);
app.use('/api/hero-sections', heroSectionRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/whatsapp-broadcast', whatsappBroadcastRoutes);
app.use('/api/settings', settingsRoutes);

// Health check routes (comprehensive readiness/liveness checks)
app.use('/health', healthRoutes);

// Root route - API status
app.get('/', (req, res) => res.json({ 
  status: 'ok', 
  message: 'FoodAdmin API is running',
  version: '1.0.0'
}));

// SSE endpoint for real-time updates (authenticated)
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  // SSE is a notification-only channel (sends event type names, no sensitive data)
  // Actual data is fetched via authenticated API endpoints
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Broadcast to all SSE clients
const broadcast = (data) => {
  const payload = typeof data === 'string' ? { type: data } : data;
  sseClients.forEach(c => c.write(`data: ${JSON.stringify(payload)}\n\n`));
};

dataEvents.on('orders', () => broadcast('orders'));
dataEvents.on('dashboard', () => broadcast('dashboard'));
dataEvents.on('customers', () => broadcast('customers'));
dataEvents.on('menu', () => broadcast('menu'));
dataEvents.on('deliveryboys', () => broadcast('deliveryboys'));
dataEvents.on('offers', () => broadcast('offers'));

// Also listen for dataUpdate events (alternative format used in some routes)
dataEvents.on('dataUpdate', (data) => {
  if (data && data.type) {
    broadcast(data);
  }
});

// Admin-only Google Sheets sync routes (protected)
const authMiddleware = require('./middleware/auth');

app.get('/api/admin/test-sheets/:orderId/:status', authMiddleware, async (req, res) => {
  const { orderId, status } = req.params;
  try {
    const result = await googleSheets.updateOrderStatus(orderId, status, status === 'cancelled' ? 'cancelled' : null);
    res.json({ success: result, orderId, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/sync-cancelled', authMiddleware, async (req, res) => {
  const Order = require('./models/Order');
  try {
    const cancelledOrders = await Order.find({ status: 'cancelled' });
    let synced = 0;
    for (const order of cancelledOrders) {
      const result = await googleSheets.updateOrderStatus(order.orderId, 'cancelled', order.paymentStatus);
      if (result) synced++;
    }
    res.json({ success: true, total: cancelledOrders.length, synced });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/sync-pending-refunds', authMiddleware, async (req, res) => {
  try {
    const result = await googleSheets.syncPendingRefunds();
    res.json({ success: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Global error handler (must be LAST middleware)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

// ============ GRACEFUL SHUTDOWN ============
const SHUTDOWN_TIMEOUT = 15000; // 15 seconds max
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed - no longer accepting connections');
  });

  // Close SSE connections
  sseClients.forEach(client => {
    try { client.end(); } catch (e) { /* ignore */ }
  });
  sseClients.clear();
  logger.info('SSE clients disconnected');

  // Stop schedulers
  try {
    if (orderScheduler.stop) orderScheduler.stop();
    if (dailyCleanup.stop) dailyCleanup.stop();
    if (categoryScheduler.stop) categoryScheduler.stop();
    if (orderCleanup.stop) orderCleanup.stop();
    if (cartCleanup.stopCartCleanupScheduler) cartCleanup.stopCartCleanupScheduler();
    logger.info('Schedulers stopped');
  } catch (err) {
    logger.error('Error stopping schedulers', { error: err.message });
  }

  // Close MongoDB connection
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (err) {
    logger.error('Error closing MongoDB', { error: err.message });
  }

  // Close Redis connection
  try {
    const redis = require('./services/redis');
    if (redis.quit) await redis.quit();
    logger.info('Redis connection closed');
  } catch (err) {
    // Redis might not be initialized
    logger.warn('Redis close skipped', { error: err.message });
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
};

// Force exit after timeout
const forceShutdown = (signal) => {
  setTimeout(() => {
    logger.error(`Forced shutdown after ${SHUTDOWN_TIMEOUT}ms timeout`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT).unref();
  gracefulShutdown(signal);
};

process.on('SIGTERM', () => forceShutdown('SIGTERM'));
process.on('SIGINT', () => forceShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  forceShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || reason, stack: reason?.stack });
});

module.exports = { app, server };
