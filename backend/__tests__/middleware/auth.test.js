/**
 * Auth Middleware Tests
 */
const jwt = require('jsonwebtoken');

// Mock environment
process.env.JWT_SECRET = 'test-jwt-secret-key-minimum-32-characters-long';

const authMiddleware = require('../../middleware/auth');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  it('should return 401 if no authorization header is provided', () => {
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required', code: 'NO_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if authorization header has no token', () => {
    req.headers.authorization = 'Bearer ';
    authMiddleware(req, res, next);

    // Empty string after split is falsy
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for an invalid token', () => {
    req.headers.authorization = 'Bearer invalid-token-123';
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for an expired token', () => {
    const expiredToken = jwt.sign(
      { id: 'user123', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    req.headers.authorization = `Bearer ${expiredToken}`;
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Token has expired', code: 'TOKEN_EXPIRED' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next and set req.user for a valid token', () => {
    const payload = { id: 'user123', role: 'admin', username: 'testuser' };
    const validToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    req.headers.authorization = `Bearer ${validToken}`;

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('user123');
    expect(req.user.role).toBe('admin');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 401 for a token signed with wrong secret', () => {
    const wrongToken = jwt.sign(
      { id: 'user123' },
      'wrong-secret-key-that-does-not-match-at-all',
      { expiresIn: '1h' }
    );
    req.headers.authorization = `Bearer ${wrongToken}`;
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
