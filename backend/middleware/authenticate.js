/**
 * Authentication Middleware
 * 
 * Purpose: Verify JWT tokens and attach user to request
 * Used for: Admin routes, protected API endpoints
 * 
 * Flow:
 * 1. Extract token from Authorization header
 * 2. Verify JWT signature and expiration
 * 3. Attach decoded user to req.user
 * 4. Pass to next middleware
 */

const jwt = require('jsonwebtoken');
const logger = require('../services/logger');

/**
 * Authenticate JWT token
 * 
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Next middleware
 */
function authenticate(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }
    
    // Check Bearer format
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Invalid authorization format. Use: Bearer <token>',
        code: 'INVALID_FORMAT'
      });
    }
    
    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer '
    
    if (!token || token.trim() === '') {
      return res.status(401).json({ 
        error: 'Token is empty',
        code: 'EMPTY_TOKEN'
      });
    }
    
    // Verify JWT
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      logger.error('❌ JWT_SECRET not configured');
      return res.status(500).json({ 
        error: 'Server configuration error',
        code: 'CONFIG_ERROR'
      });
    }
    
    try {
      const decoded = jwt.verify(token, jwtSecret);
      
      // Attach user to request
      req.user = {
        id: decoded.id || decoded.userId,
        role: decoded.role,
        email: decoded.email,
        phone: decoded.phone
      };
      
      // Log authentication (for audit)
      logger.info(`🔐 Authenticated: ${req.user.role} (${req.user.id}) - ${req.method} ${req.originalUrl}`);
      
      next();
      
    } catch (jwtError) {
      // Handle specific JWT errors
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Token has expired',
          code: 'TOKEN_EXPIRED',
          expiredAt: jwtError.expiredAt
        });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
      
      if (jwtError.name === 'NotBeforeError') {
        return res.status(401).json({ 
          error: 'Token not yet valid',
          code: 'TOKEN_NOT_ACTIVE'
        });
      }
      
      // Unknown JWT error
      logger.error('JWT verification error:', jwtError);
      return res.status(401).json({ 
        error: 'Token verification failed',
        code: 'VERIFICATION_FAILED'
      });
    }
    
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    return res.status(500).json({ 
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 * Useful for endpoints that work for both authenticated and anonymous users
 */
function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided - continue as anonymous
    req.user = null;
    return next();
  }
  
  // Token provided - verify it
  authenticate(req, res, next);
}

/**
 * Authenticate delivery boy token
 * 
 * Uses the standard authenticate middleware first, then performs
 * delivery-specific checks: role validation, DB lookup, isActive,
 * tokenVersion revocation check.
 * 
 * Sets req.deliveryBoy with the full DeliveryBoy document (minus password).
 */
async function authenticateDeliveryBoy(req, res, next) {
  // First run standard JWT verification
  authenticate(req, res, async (err) => {
    if (err) return; // authenticate already sent 401

    try {
      // Check role
      if (req.user.role !== 'delivery') {
        return res.status(403).json({
          error: 'Access denied. Delivery boy role required.',
          code: 'WRONG_ROLE'
        });
      }

      // Fetch delivery boy from DB (stateful check)
      const DeliveryBoy = require('../models/DeliveryBoy');
      const deliveryBoy = await DeliveryBoy.findById(req.user.id).select('-password');

      if (!deliveryBoy) {
        return res.status(401).json({
          error: 'Account not found or deleted',
          code: 'ACCOUNT_DELETED'
        });
      }

      if (!deliveryBoy.isActive) {
        return res.status(403).json({
          error: 'Account deactivated. Contact admin.',
          code: 'ACCOUNT_DEACTIVATED'
        });
      }

      // Verify token version (allows session invalidation)
      const authHeader = req.headers.authorization;
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (deliveryBoy.tokenVersion !== undefined && deliveryBoy.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({
          error: 'Session expired. Please login again.',
          code: 'SESSION_EXPIRED'
        });
      }

      // Attach delivery boy to request
      req.deliveryBoy = deliveryBoy;
      next();
    } catch (error) {
      logger.error('Delivery boy authentication error:', error);
      return res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR'
      });
    }
  });
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  authenticateDeliveryBoy
};
