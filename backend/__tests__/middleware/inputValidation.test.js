/**
 * Input Validation Middleware Tests
 */
const { handleValidationErrors, sanitizeInputs } = require('../../middleware/inputValidation');

describe('Input Validation Middleware', () => {
  describe('handleValidationErrors', () => {
    let req, res, next;

    beforeEach(() => {
      req = {};
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      next = jest.fn();
    });

    it('should be a function', () => {
      expect(typeof handleValidationErrors).toBe('function');
    });
  });

  describe('sanitizeInputs', () => {
    let req, res, next;

    beforeEach(() => {
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      next = jest.fn();
    });

    it('should be a function', () => {
      expect(typeof sanitizeInputs).toBe('function');
    });

    it('should call next for normal input', () => {
      req = {
        body: { name: 'Test Item', price: 100 },
        query: {},
        params: {}
      };

      sanitizeInputs(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should trim string values in body', () => {
      req = {
        body: { name: '  Hello World  ' },
        query: {},
        params: {}
      };

      sanitizeInputs(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body.name).toBe('Hello World');
    });

    it('should trim query parameters', () => {
      req = {
        body: {},
        query: { search: '  test query  ' },
        params: {}
      };

      sanitizeInputs(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.query.search).toBe('test query');
    });

    it('should preserve non-string values', () => {
      req = {
        body: { price: 100, available: true, tags: ['veg', 'spicy'] },
        query: {},
        params: {}
      };

      sanitizeInputs(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body.price).toBe(100);
      expect(req.body.available).toBe(true);
    });

    it('should not modify nested objects (only top-level strings)', () => {
      req = {
        body: {
          user: { name: '  Bold Name  ' }
        },
        query: {},
        params: {}
      };

      sanitizeInputs(req, res, next);
      expect(next).toHaveBeenCalled();
      // sanitizeInputs only trims top-level strings
      expect(req.body.user.name).toBe('  Bold Name  ');
    });

    it('should handle empty body gracefully', () => {
      req = {
        body: {},
        query: {},
        params: {}
      };

      sanitizeInputs(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should handle undefined body gracefully', () => {
      req = {
        query: {},
        params: {}
      };

      sanitizeInputs(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
