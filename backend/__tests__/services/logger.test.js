/**
 * Logger Service Tests
 */
const logger = require('../../services/logger');

describe('Logger Service', () => {
  it('should export a logger object', () => {
    expect(logger).toBeDefined();
  });

  it('should have info method', () => {
    expect(typeof logger.info).toBe('function');
  });

  it('should have error method', () => {
    expect(typeof logger.error).toBe('function');
  });

  it('should have warn method', () => {
    expect(typeof logger.warn).toBe('function');
  });

  it('should have debug method', () => {
    expect(typeof logger.debug).toBe('function');
  });

  it('should have createChildLogger method', () => {
    expect(typeof logger.createChildLogger).toBe('function');
  });

  it('should have withCorrelation method', () => {
    expect(typeof logger.withCorrelation).toBe('function');
  });

  it('should have startTimer method', () => {
    expect(typeof logger.startTimer).toBe('function');
  });

  it('should have logError method', () => {
    expect(typeof logger.logError).toBe('function');
  });

  it('should have logEvent method', () => {
    expect(typeof logger.logEvent).toBe('function');
  });

  it('should have logPerformance method', () => {
    expect(typeof logger.logPerformance).toBe('function');
  });

  it('should not throw when logging info', () => {
    expect(() => logger.info('test info message')).not.toThrow();
  });

  it('should not throw when logging error', () => {
    expect(() => logger.error('test error message')).not.toThrow();
  });

  it('should not throw when logging with metadata', () => {
    expect(() => logger.info('test', { key: 'value', nested: { a: 1 } })).not.toThrow();
  });

  it('should create a child logger with context', () => {
    const child = logger.createChildLogger({ service: 'test-service' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
    expect(typeof child.error).toBe('function');
  });

  it('should create correlation logger', () => {
    const correlated = logger.withCorrelation('test-corr-id-123');
    expect(correlated).toBeDefined();
    expect(typeof correlated.info).toBe('function');
  });

  it('should return timer function from startTimer', () => {
    const endTimer = logger.startTimer('test-operation');
    expect(typeof endTimer).toBe('function');
    const duration = endTimer();
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('should have getMetadata function', () => {
    expect(typeof logger.getMetadata).toBe('function');
    const meta = logger.getMetadata();
    expect(meta).toHaveProperty('version');
    expect(meta).toHaveProperty('features');
    expect(Array.isArray(meta.features)).toBe(true);
  });
});
