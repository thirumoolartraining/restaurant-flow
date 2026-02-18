/**
 * Error Handler Middleware Tests
 */

// Mock dependencies before requiring the module
jest.mock('../../services/alerting', () => ({
  alertCriticalError: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../services/metricsRedis', () => ({
  recordError: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
}));

const errorHandler = require('../../middleware/errorHandler');
const alerting = require('../../services/alerting');
const metricsRedis = require('../../services/metricsRedis');

describe('Error Handler Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      path: '/api/test',
      method: 'GET',
      ip: '127.0.0.1',
      user: { id: 'user123' }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should return 500 for generic errors', async () => {
    const error = new Error('Something went wrong');
    await errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        timestamp: expect.any(String)
      })
    );
  });

  it('should use error statusCode if provided', async () => {
    const error = new Error('Not found');
    error.statusCode = 404;
    await errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should use error status if statusCode not provided', async () => {
    const error = new Error('Bad request');
    error.status = 400;
    await errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should record error in metrics', async () => {
    const error = new Error('Test error');
    await errorHandler(error, req, res, next);

    expect(metricsRedis.recordError).toHaveBeenCalled();
  });

  it('should not expose stack trace in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error = new Error('Internal failure');
    await errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Internal Server Error' // Generic message for 500
      })
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should expose error message in development', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const error = new Error('Detailed debug error');
    await errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Detailed debug error',
        stack: expect.any(String)
      })
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should send alert for 500 errors in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error = new Error('Critical failure');
    await errorHandler(error, req, res, next);

    expect(alerting.alertCriticalError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        path: '/api/test',
        method: 'GET'
      })
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should not send alert for non-500 errors', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error = new Error('Bad request');
    error.statusCode = 400;
    await errorHandler(error, req, res, next);

    expect(alerting.alertCriticalError).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it('should handle metrics recording failure gracefully', async () => {
    metricsRedis.recordError.mockRejectedValueOnce(new Error('Redis down'));
    const error = new Error('Test error');

    // Should not throw
    await errorHandler(error, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
