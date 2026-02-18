/**
 * Tests for metricsRedis service
 * Covers: scanKeys utility, recordRequest, resetMetrics
 */

// Mock logger
jest.mock('../../services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock Redis client
const mockRedis = {
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue('0'),
  del: jest.fn().mockResolvedValue(1),
  hincrby: jest.fn().mockResolvedValue(1),
  zadd: jest.fn().mockResolvedValue(1),
  zremrangebyrank: jest.fn().mockResolvedValue(0),
  zrevrange: jest.fn().mockResolvedValue([]),
  zrange: jest.fn().mockResolvedValue([]),
  hgetall: jest.fn().mockResolvedValue({}),
  scan: jest.fn()
};

jest.mock('../../services/redis', () => ({
  getClient: () => mockRedis
}));

const metricsRedis = require('../../services/metricsRedis');

describe('metricsRedis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('scanKeys (via getMetrics)', () => {
    it('should use SCAN instead of KEYS for production safety', async () => {
      // Set up scan to return empty results in one iteration
      mockRedis.scan.mockResolvedValue(['0', []]);
      mockRedis.get.mockResolvedValue('0');
      mockRedis.zrevrange.mockResolvedValue([]);

      await metricsRedis.getMetrics();

      // Verify SCAN is called (not KEYS)
      expect(mockRedis.scan).toHaveBeenCalled();
      // Verify scan was called with MATCH and COUNT params
      const scanCalls = mockRedis.scan.mock.calls;
      expect(scanCalls.length).toBeGreaterThan(0);
      expect(scanCalls[0]).toContain('MATCH');
      expect(scanCalls[0]).toContain('COUNT');
    });

    it('should iterate cursor until 0 is returned', async () => {
      // First call returns cursor '42' with some keys
      // Second call returns cursor '0' (done) with more keys
      mockRedis.scan
        .mockResolvedValueOnce(['42', ['metrics:requests:type:text']])
        .mockResolvedValueOnce(['0', ['metrics:requests:type:image']])
        // For subsequent pattern calls, return empty
        .mockResolvedValue(['0', []]);

      mockRedis.get
        .mockResolvedValueOnce('10') // total
        .mockResolvedValueOnce('5')  // daily
        .mockResolvedValueOnce('8')  // success
        .mockResolvedValueOnce('2')  // failure
        .mockResolvedValueOnce('1')  // errors total
        .mockResolvedValueOnce('1')  // errors daily
        .mockResolvedValue('3');     // type counts

      mockRedis.zrevrange.mockResolvedValue([]);

      const result = await metricsRedis.getMetrics();

      // Should have iterated scan twice for the first pattern
      expect(result).toHaveProperty('requests');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('domainActions');
      expect(result).toHaveProperty('externalApis');
      expect(result).toHaveProperty('businessEvents');
    });
  });

  describe('recordRequest', () => {
    it('should increment total and daily counters', async () => {
      await metricsRedis.recordRequest('text', '/api/orders');

      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('requests:total'));
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('requests:daily'));
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('requests:type:text'));
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('requests:route:/api/orders'));
      expect(mockRedis.expire).toHaveBeenCalled();
    });
  });

  describe('recordSuccess / recordFailure', () => {
    it('should increment success counter', async () => {
      await metricsRedis.recordSuccess();
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('requests:success'));
    });

    it('should increment failure counter', async () => {
      await metricsRedis.recordFailure();
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('requests:failure'));
    });
  });

  describe('recordDomainAction', () => {
    it('should track domain action with hash', async () => {
      await metricsRedis.recordDomainAction('orders', 'create', true);
      expect(mockRedis.hincrby).toHaveBeenCalledWith(expect.stringContaining('domain:orders:create'), 'total', 1);
      expect(mockRedis.hincrby).toHaveBeenCalledWith(expect.stringContaining('domain:orders:create'), 'success', 1);
    });

    it('should track failures', async () => {
      await metricsRedis.recordDomainAction('orders', 'create', false);
      expect(mockRedis.hincrby).toHaveBeenCalledWith(expect.stringContaining('domain:orders:create'), 'failure', 1);
    });
  });

  describe('recordError', () => {
    it('should increment error counters and add to recent errors', async () => {
      await metricsRedis.recordError('ValidationError', 'Invalid input');
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('errors:total'));
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('errors:type:ValidationError'));
      expect(mockRedis.zadd).toHaveBeenCalled();
    });
  });

  describe('resetMetrics', () => {
    it('should delete all metric keys using SCAN', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['0', ['metrics:key1', 'metrics:key2']]);

      await metricsRedis.resetMetrics();

      expect(mockRedis.scan).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith('metrics:key1', 'metrics:key2');
    });

    it('should handle empty metrics gracefully', async () => {
      mockRedis.scan.mockResolvedValue(['0', []]);

      await metricsRedis.resetMetrics();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('recordResponseTime', () => {
    it('should store response time in sorted set', async () => {
      await metricsRedis.recordResponseTime('webhook', 150);
      expect(mockRedis.zadd).toHaveBeenCalled();
      expect(mockRedis.zremrangebyrank).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled();
    });

    it('should support detail parameter', async () => {
      await metricsRedis.recordResponseTime('webhook', 150, 'text');
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        expect.stringContaining('response_time:webhook:text'),
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  describe('getResponseTimeStats', () => {
    it('should return zero stats when no data', async () => {
      mockRedis.zrange.mockResolvedValue([]);

      const result = await metricsRedis.getResponseTimeStats('webhook');
      expect(result).toEqual({ count: 0, avg: 0, p50: 0, p95: 0, p99: 0 });
    });

    it('should calculate percentiles correctly', async () => {
      // 100 values from 1 to 100
      const values = Array.from({ length: 100 }, (_, i) => `${Date.now()}:${i + 1}`);
      mockRedis.zrange.mockResolvedValue(values);

      const result = await metricsRedis.getResponseTimeStats('webhook');
      expect(result.count).toBe(100);
      expect(result.avg).toBe(51); // (1+2+...+100)/100 = 50.5 -> rounded
      expect(result.p50).toBe(51);
      expect(result.p95).toBe(96);
      expect(result.p99).toBe(100);
    });
  });
});
