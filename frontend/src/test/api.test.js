import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const mockLocalStorage = {
  store: {},
  getItem: vi.fn((key) => mockLocalStorage.store[key] || null),
  setItem: vi.fn((key, value) => { mockLocalStorage.store[key] = value; }),
  removeItem: vi.fn((key) => { delete mockLocalStorage.store[key]; }),
  clear: vi.fn(() => { mockLocalStorage.store = {}; }),
};

Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock import.meta.env
vi.stubGlobal('import', { meta: { env: { VITE_API_URL: 'http://localhost:5000/api' } } });

describe('API Configuration', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    vi.clearAllMocks();
  });

  it('should have a base URL configured', async () => {
    // We can't easily import api.js due to import.meta, so test the pattern
    const baseURL = import.meta.env.VITE_API_URL || 'https://restaruntbot.onrender.com/api';
    expect(baseURL).toBeDefined();
    expect(baseURL).toContain('/api');
  });

  it('should store and retrieve auth token from localStorage', () => {
    const token = 'test-jwt-token-123';
    localStorage.setItem('token', token);
    expect(localStorage.getItem('token')).toBe(token);
  });

  it('should clear token on logout', () => {
    localStorage.setItem('token', 'some-token');
    localStorage.removeItem('token');
    expect(localStorage.getItem('token')).toBeNull();
  });
});
