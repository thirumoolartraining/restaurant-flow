/**
 * CORS Configuration Tests
 */
const { corsOptions } = require('../../config/corsConfig');

describe('CORS Configuration', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should export corsOptions object', () => {
    expect(corsOptions).toBeDefined();
    expect(typeof corsOptions).toBe('object');
  });

  it('should have credentials enabled', () => {
    expect(corsOptions.credentials).toBe(true);
  });

  it('should have optionsSuccessStatus set', () => {
    expect(corsOptions.optionsSuccessStatus).toBeDefined();
  });

  it('should have allowed methods', () => {
    expect(corsOptions.methods).toBeDefined();
    expect(corsOptions.methods).toContain('GET');
    expect(corsOptions.methods).toContain('POST');
    expect(corsOptions.methods).toContain('PUT');
    expect(corsOptions.methods).toContain('DELETE');
  });

  it('should have allowed headers', () => {
    expect(corsOptions.allowedHeaders).toBeDefined();
    expect(corsOptions.allowedHeaders).toContain('Content-Type');
    expect(corsOptions.allowedHeaders).toContain('Authorization');
  });

  it('should have origin as a function', () => {
    expect(typeof corsOptions.origin).toBe('function');
  });

  it('should allow requests with no origin (server-to-server)', () => {
    return new Promise((resolve) => {
      corsOptions.origin(undefined, (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(true);
        resolve();
      });
    });
  });
});
