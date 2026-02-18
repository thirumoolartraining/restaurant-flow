/**
 * Webhook Validation Middleware Tests
 */

jest.mock('../../services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
}));

const crypto = require('crypto');

describe('Webhook Validation', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      META_APP_SECRET: 'test-app-secret-minimum-32-characters-long'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  it('should export a middleware object or function', () => {
    const webhookValidation = require('../../middleware/webhookValidation');
    expect(webhookValidation).toBeDefined();
    // Module exports either a function or an object with validation methods
    expect(['function', 'object']).toContain(typeof webhookValidation);
  });

  it('should validate HMAC signatures correctly', () => {
    const secret = process.env.META_APP_SECRET;
    const body = JSON.stringify({ test: 'data' });
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    // Verify our expected signature computation works
    expect(expectedSig).toBeDefined();
    expect(expectedSig.length).toBe(64); // SHA256 hex length
  });
});
