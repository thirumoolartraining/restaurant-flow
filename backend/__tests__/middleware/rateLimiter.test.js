/**
 * Rate Limiter Middleware Tests
 */
const { createRateLimiter, adminRateLimiter, publicRateLimiter, authRateLimiter, strictRateLimiter, webhookRateLimiter } = require('../../middleware/rateLimiter');

describe('Rate Limiter Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn()
    };
    next = jest.fn();
  });

  describe('createRateLimiter', () => {
    it('should return a middleware function', () => {
      const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60000 });
      expect(typeof limiter).toBe('function');
    });

    it('should call next for requests within limit', () => {
      const limiter = createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
        keyPrefix: 'test-within'
      });

      limiter(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block requests exceeding the limit', () => {
      const limiter = createRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
        keyPrefix: 'test-exceed'
      });

      // Use a unique IP for this test
      req.ip = '10.0.0.99';

      // First 2 requests should pass
      limiter(req, res, next);
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);

      // 3rd request should be blocked
      limiter(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('should use custom error message', () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        message: 'Custom rate limit message',
        keyPrefix: 'test-msg'
      });

      req.ip = '10.0.0.100';
      limiter(req, res, next);
      limiter(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Custom rate limit message' })
      );
    });

    it('should separate limits by keyPrefix', () => {
      const limiter1 = createRateLimiter({ maxRequests: 1, windowMs: 60000, keyPrefix: 'prefix-a' });
      const limiter2 = createRateLimiter({ maxRequests: 1, windowMs: 60000, keyPrefix: 'prefix-b' });

      req.ip = '10.0.0.101';

      limiter1(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      limiter2(req, res, next);
      expect(next).toHaveBeenCalledTimes(2); // Different prefix, still allowed
    });
  });

  describe('Pre-configured limiters', () => {
    it('should export adminRateLimiter as a function', () => {
      expect(typeof adminRateLimiter).toBe('function');
    });

    it('should export publicRateLimiter as a function', () => {
      expect(typeof publicRateLimiter).toBe('function');
    });

    it('should export authRateLimiter as a function', () => {
      expect(typeof authRateLimiter).toBe('function');
    });

    it('should export strictRateLimiter as a function', () => {
      expect(typeof strictRateLimiter).toBe('function');
    });

    it('should export webhookRateLimiter as a function', () => {
      expect(typeof webhookRateLimiter).toBe('function');
    });

    it('adminRateLimiter should allow requests', () => {
      req.ip = '10.0.0.200';
      adminRateLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('publicRateLimiter should allow requests', () => {
      req.ip = '10.0.0.201';
      publicRateLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
