/**
 * Auth API Unit Tests - Phase 6.6
 * 
 * Tests authentication logic:
 * - JWT token generation and verification
 * - Password hashing with bcrypt
 * - Input validation for auth fields
 */

// Mock logger
jest.mock('../../services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  stream: { write: jest.fn() }
}));

const jwt = require('jsonwebtoken');

const SECRET = 'test-jwt-secret-key-for-auth-tests';

beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
});

describe('Auth Unit Tests', () => {
  describe('JWT token generation', () => {
    it('should generate a valid JWT token', () => {
      const payload = { id: 'user123', role: 'admin', email: 'admin@test.com' };
      const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });
      
      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3);
      
      const decoded = jwt.verify(token, SECRET);
      expect(decoded.id).toBe('user123');
      expect(decoded.role).toBe('admin');
      expect(decoded.email).toBe('admin@test.com');
    });

    it('should reject token signed with wrong secret', () => {
      const token = jwt.sign({ id: '123' }, SECRET, { expiresIn: '1h' });
      
      expect(() => {
        jwt.verify(token, 'wrong-secret');
      }).toThrow();
    });

    it('should reject expired token', () => {
      const token = jwt.sign({ id: '123' }, SECRET, { expiresIn: '-1s' });
      
      expect(() => {
        jwt.verify(token, SECRET);
      }).toThrow('jwt expired');
    });

    it('should include expiration in token', () => {
      const token = jwt.sign({ id: '123' }, SECRET, { expiresIn: '7d' });
      const decoded = jwt.verify(token, SECRET);
      
      expect(decoded).toHaveProperty('exp');
      expect(decoded).toHaveProperty('iat');
      const sevenDays = 7 * 24 * 60 * 60;
      expect(decoded.exp - decoded.iat).toBeCloseTo(sevenDays, -1);
    });

    it('should encode role in token for RBAC', () => {
      const adminToken = jwt.sign({ id: '1', role: 'admin' }, SECRET);
      const deliveryToken = jwt.sign({ id: '2', role: 'delivery', tokenVersion: 1 }, SECRET);
      
      const adminDecoded = jwt.verify(adminToken, SECRET);
      const deliveryDecoded = jwt.verify(deliveryToken, SECRET);
      
      expect(adminDecoded.role).toBe('admin');
      expect(deliveryDecoded.role).toBe('delivery');
      expect(deliveryDecoded.tokenVersion).toBe(1);
    });
  });

  describe('Password hashing', () => {
    let bcrypt;
    
    beforeAll(() => {
      bcrypt = require('bcryptjs');
    });

    it('should hash password with salt rounds', async () => {
      const password = 'TestPass123!';
      const hash = await bcrypt.hash(password, 10);
      
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should verify correct password', async () => {
      const password = 'TestPass123!';
      const hash = await bcrypt.hash(password, 10);
      
      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject wrong password', async () => {
      const password = 'TestPass123!';
      const hash = await bcrypt.hash(password, 10);
      
      const isValid = await bcrypt.compare('WrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'TestPass123!';
      const hash1 = await bcrypt.hash(password, 10);
      const hash2 = await bcrypt.hash(password, 10);
      
      expect(hash1).not.toBe(hash2); // Different salts
      expect(await bcrypt.compare(password, hash1)).toBe(true);
      expect(await bcrypt.compare(password, hash2)).toBe(true);
    });
  });

  describe('Auth input validation', () => {
    it('should detect invalid email format', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      expect(emailRegex.test('valid@test.com')).toBe(true);
      expect(emailRegex.test('also.valid@test.co.in')).toBe(true);
      expect(emailRegex.test('invalid-email')).toBe(false);
      expect(emailRegex.test('@noname.com')).toBe(false);
      expect(emailRegex.test('noDomain@')).toBe(false);
    });

    it('should validate password strength', () => {
      const isStrongPassword = (pwd) => pwd && pwd.length >= 8;
      
      expect(isStrongPassword('StrongPass123')).toBe(true);
      expect(isStrongPassword('12345678')).toBe(true);
      expect(isStrongPassword('short')).toBeFalsy();
      expect(isStrongPassword('')).toBeFalsy();
      expect(isStrongPassword(null)).toBeFalsy();
    });

    it('should validate phone number format', () => {
      const isValidPhone = (phone) => /^\d{10,15}$/.test(phone);
      
      expect(isValidPhone('9876543210')).toBe(true);
      expect(isValidPhone('919876543210')).toBe(true);
      expect(isValidPhone('123')).toBe(false);
      expect(isValidPhone('not-a-phone')).toBe(false);
    });
  });
});
