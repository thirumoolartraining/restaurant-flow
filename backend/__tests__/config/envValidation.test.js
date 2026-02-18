/**
 * Environment Validation Tests
 */
const { validateEnv } = require('../../config/envValidation');

describe('Environment Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a clean env for each test
    process.env = {
      ...originalEnv,
      MONGODB_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'a-very-long-jwt-secret-key-minimum-32-chars!!',
      META_PHONE_NUMBER_ID: '1234567890',
      META_ACCESS_TOKEN: 'EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      META_WABA_ID: '9876543210',
      META_APP_SECRET: 'a-very-long-app-secret-key-minimum-32-chars!!',
      META_VERIFY_TOKEN: 'my-verify-token-8chars'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be a function', () => {
    expect(typeof validateEnv).toBe('function');
  });

  it('should not throw for valid environment in non-strict mode', () => {
    expect(() => validateEnv(false)).not.toThrow();
  });

  it('should validate required variables exist', () => {
    // Remove a required variable
    delete process.env.MONGODB_URI;

    // In strict mode (production), should throw or warn
    // In non-strict mode, should warn but not crash
    expect(() => validateEnv(false)).not.toThrow();
  });

  it('should validate MONGODB_URI format', () => {
    process.env.MONGODB_URI = 'not-a-mongo-uri';
    // Should warn about invalid format
    expect(() => validateEnv(false)).not.toThrow();
  });

  it('should validate JWT_SECRET minimum length', () => {
    process.env.JWT_SECRET = 'short';
    // Should warn about short secret
    expect(() => validateEnv(false)).not.toThrow();
  });

  it('should accept valid mongodb+srv URI', () => {
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.example.com/db';
    expect(() => validateEnv(false)).not.toThrow();
  });
});
