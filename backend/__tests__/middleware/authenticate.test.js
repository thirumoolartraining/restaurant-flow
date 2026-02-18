/**
 * Tests for authenticate middleware
 * Covers: authenticate, optionalAuthenticate, authenticateDeliveryBoy
 */
const jwt = require('jsonwebtoken');

// Mock logger
jest.mock('../../services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock DeliveryBoy model
const mockDeliveryBoy = {
  _id: 'delivery123',
  name: 'Test Driver',
  email: 'driver@test.com',
  isActive: true,
  tokenVersion: 1
};

jest.mock('../../models/DeliveryBoy', () => ({
  findById: jest.fn(() => ({
    select: jest.fn()
  }))
}));

const { authenticate, optionalAuthenticate, authenticateDeliveryBoy } = require('../../middleware/authenticate');
const DeliveryBoy = require('../../models/DeliveryBoy');

const SECRET = 'test-secret-key';

beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

function createMockReqRes(token = null) {
  const req = {
    headers: {},
    method: 'GET',
    originalUrl: '/test'
  };
  if (token) {
    req.headers.authorization = `Bearer ${token}`;
  }
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('authenticate', () => {
  it('should reject requests without Authorization header', () => {
    const { req, res, next } = createMockReqRes();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NO_TOKEN' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject non-Bearer format', () => {
    const { req, res, next } = createMockReqRes();
    req.headers.authorization = 'Basic abc123';
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_FORMAT' }));
  });

  it('should reject empty token', () => {
    const { req, res, next } = createMockReqRes();
    req.headers.authorization = 'Bearer ';
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'EMPTY_TOKEN' }));
  });

  it('should reject expired token', () => {
    const token = jwt.sign({ id: '123', role: 'admin' }, SECRET, { expiresIn: '-1s' });
    const { req, res, next } = createMockReqRes(token);
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_EXPIRED' }));
  });

  it('should reject invalid token', () => {
    const { req, res, next } = createMockReqRes('invalid.token.value');
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });

  it('should accept valid token and set req.user', () => {
    const token = jwt.sign({ id: '123', role: 'admin', email: 'admin@test.com' }, SECRET, { expiresIn: '1h' });
    const { req, res, next } = createMockReqRes(token);
    authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({
      id: '123',
      role: 'admin',
      email: 'admin@test.com'
    }));
  });

  it('should handle missing JWT_SECRET gracefully', () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    const token = jwt.sign({ id: '123', role: 'admin' }, 'other-secret');
    const { req, res, next } = createMockReqRes(token);
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONFIG_ERROR' }));
    process.env.JWT_SECRET = originalSecret;
  });
});

describe('optionalAuthenticate', () => {
  it('should set req.user to null when no token', () => {
    const { req, res, next } = createMockReqRes();
    optionalAuthenticate(req, res, next);
    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  it('should authenticate when valid token provided', () => {
    const token = jwt.sign({ id: '123', role: 'admin' }, SECRET, { expiresIn: '1h' });
    const { req, res, next } = createMockReqRes(token);
    optionalAuthenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({ id: '123' }));
  });

  it('should reject invalid token even in optional mode', () => {
    const { req, res, next } = createMockReqRes('bad-token');
    optionalAuthenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('authenticateDeliveryBoy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject non-delivery role tokens', async () => {
    const token = jwt.sign({ id: '123', role: 'admin' }, SECRET, { expiresIn: '1h' });
    const { req, res, next } = createMockReqRes(token);

    await authenticateDeliveryBoy(req, res, next);
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'WRONG_ROLE' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject if delivery boy not found in DB', async () => {
    DeliveryBoy.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(null)
    });

    const token = jwt.sign({ id: 'delivery123', role: 'delivery', tokenVersion: 1 }, SECRET, { expiresIn: '1h' });
    const { req, res, next } = createMockReqRes(token);

    await authenticateDeliveryBoy(req, res, next);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCOUNT_DELETED' }));
  });

  it('should reject deactivated delivery boy', async () => {
    DeliveryBoy.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ ...mockDeliveryBoy, isActive: false })
    });

    const token = jwt.sign({ id: 'delivery123', role: 'delivery', tokenVersion: 1 }, SECRET, { expiresIn: '1h' });
    const { req, res, next } = createMockReqRes(token);

    await authenticateDeliveryBoy(req, res, next);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCOUNT_DEACTIVATED' }));
  });

  it('should reject expired token version', async () => {
    DeliveryBoy.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ ...mockDeliveryBoy, tokenVersion: 2 })
    });

    const token = jwt.sign({ id: 'delivery123', role: 'delivery', tokenVersion: 1 }, SECRET, { expiresIn: '1h' });
    const { req, res, next } = createMockReqRes(token);

    await authenticateDeliveryBoy(req, res, next);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_EXPIRED' }));
  });

  it('should authenticate valid delivery boy and set req.deliveryBoy', async () => {
    DeliveryBoy.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockDeliveryBoy)
    });

    const token = jwt.sign({ id: 'delivery123', role: 'delivery', tokenVersion: 1 }, SECRET, { expiresIn: '1h' });
    const { req, res, next } = createMockReqRes(token);

    await authenticateDeliveryBoy(req, res, next);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(next).toHaveBeenCalled();
    expect(req.deliveryBoy).toEqual(expect.objectContaining({
      name: 'Test Driver',
      isActive: true
    }));
  });
});
