/**
 * Server Graceful Shutdown & Configuration Tests
 * Tests server.js exports and configuration
 */

// Mock all heavy dependencies
jest.mock('mongoose', () => {
  const connection = {
    readyState: 1,
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(true)
  };
  return {
    connect: jest.fn().mockResolvedValue(true),
    connection,
    Schema: jest.fn().mockReturnValue({}),
    model: jest.fn().mockReturnValue({})
  };
});

jest.mock('../../services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../services/eventEmitter', () => ({
  on: jest.fn(),
  emit: jest.fn()
}));

jest.mock('../../services/orderScheduler', () => ({ start: jest.fn(), stop: jest.fn() }));
jest.mock('../../services/dailyCleanup', () => ({ start: jest.fn(), stop: jest.fn() }));
jest.mock('../../services/categoryScheduler', () => ({ start: jest.fn(), stop: jest.fn() }));
jest.mock('../../services/orderCleanup', () => ({ start: jest.fn(), stop: jest.fn() }));
jest.mock('../../services/cartCleanup', () => ({
  startCartCleanupScheduler: jest.fn(),
  stopCartCleanupScheduler: jest.fn()
}));
jest.mock('../../services/googleSheets', () => ({
  initializeDailyReportsSheet: jest.fn().mockResolvedValue(true),
  initializeDashboardStatsSheet: jest.fn().mockResolvedValue(true),
  initializeCustomersSheet: jest.fn().mockResolvedValue(true),
  updateOrderStatus: jest.fn(),
  syncPendingRefunds: jest.fn()
}));

jest.mock('../../config/envValidation', () => ({
  validateEnv: jest.fn()
}));

jest.mock('../../config/corsConfig', () => ({
  corsOptions: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
  }
}));

jest.mock('../../middleware/errorHandler', () => jest.fn((err, req, res, next) => {
  res.status(500).json({ error: 'Error' });
}));

jest.mock('../../middleware/inputValidation', () => ({
  sanitizeInputs: jest.fn((req, res, next) => next()),
  handleValidationErrors: jest.fn((req, res, next) => next()),
  validators: {}
}));

jest.mock('../../swagger', () => ({
  swaggerUi: { serve: [], setup: jest.fn(() => (req, res, next) => next()) },
  swaggerSpec: { openapi: '3.0.0', info: { title: 'Test' } }
}));

// Mock all route files
const mockRouter = jest.fn((req, res, next) => next());
jest.mock('../../routes/auth', () => mockRouter);
jest.mock('../../routes/menu', () => mockRouter);
jest.mock('../../routes/order', () => mockRouter);
jest.mock('../../routes/webhook', () => mockRouter);
jest.mock('../../routes/payment', () => mockRouter);
jest.mock('../../routes/customer', () => mockRouter);
jest.mock('../../routes/analytics', () => mockRouter);
jest.mock('../../routes/ai', () => mockRouter);
jest.mock('../../routes/category', () => mockRouter);
jest.mock('../../routes/public', () => mockRouter);
jest.mock('../../routes/chatbotImages', () => mockRouter);
jest.mock('../../routes/deliveryboy', () => mockRouter);
jest.mock('../../routes/heroSection', () => mockRouter);
jest.mock('../../routes/offers', () => mockRouter);
jest.mock('../../routes/whatsappBroadcast', () => mockRouter);
jest.mock('../../routes/settings', () => mockRouter);
jest.mock('../../routes/health', () => mockRouter);
jest.mock('../../middleware/auth', () => jest.fn((req, res, next) => next()));

describe('Server Configuration', () => {
  it('should validate environment at startup', () => {
    const { validateEnv } = require('../../config/envValidation');
    require('../../server');
    expect(validateEnv).toHaveBeenCalled();
  });

  it('should export app and server', () => {
    const serverModule = require('../../server');
    expect(serverModule).toHaveProperty('app');
    expect(serverModule).toHaveProperty('server');
  });
});
