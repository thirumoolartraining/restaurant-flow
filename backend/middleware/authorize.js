/**
 * Authorization Middleware
 * 
 * Purpose: Check user roles and permissions
 * Used after: authenticate middleware (requires req.user)
 * 
 * Role Hierarchy:
 * - admin: Full access to all resources
 * - delivery: Access to delivery-related endpoints
 * - user: Basic customer access
 */

/**
 * Authorize specific roles
 * 
 * @param {...string} allowedRoles - Roles that can access this route
 * @returns {Function} Express middleware
 * 
 * @example
 * router.get('/admin/orders', authenticate, authorize('admin'), handler)
 * router.get('/delivery/orders', authenticate, authorize('admin', 'delivery'), handler)
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
const logger = require('../services/logger');
    }
    
    // Check if user has required role
    const userRole = req.user.role;
    
    if (!userRole) {
      logger.error('❌ User has no role:', req.user);
      return res.status(403).json({ 
        error: 'User role not defined',
        code: 'NO_ROLE'
      });
    }
    
    // Check if user's role is in allowed roles
    if (!allowedRoles.includes(userRole)) {
      logger.warn(`⚠️ Authorization failed: ${userRole} tried to access ${req.method} ${req.originalUrl}`);
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: allowedRoles,
        current: userRole
      });
    }
    
    // Log authorization (for audit)
    logger.info(`✅ Authorized: ${userRole} - ${req.method} ${req.originalUrl}`);
    
    next();
  };
}

/**
 * Authorize admin only
 * Shorthand for authorize('admin')
 */
function authorizeAdmin(req, res, next) {
  return authorize('admin')(req, res, next);
}

/**
 * Authorize delivery partner or admin
 * Shorthand for authorize('admin', 'delivery')
 */
function authorizeDelivery(req, res, next) {
  return authorize('admin', 'delivery')(req, res, next);
}

/**
 * Check if user owns the resource
 * Used for endpoints where users can only access their own data
 * 
 * @param {Function} getResourceOwnerId - Function to extract owner ID from request
 * @returns {Function} Express middleware
 * 
 * @example
 * router.get('/orders/:id', authenticate, authorizeOwner(req => req.params.id), handler)
 */
function authorizeOwner(getResourceOwnerId) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }
    
    // Admins can access any resource
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Get resource owner ID
    const resourceOwnerId = getResourceOwnerId(req);
    const userId = req.user.id;
    
    // Check ownership
    if (resourceOwnerId !== userId && resourceOwnerId !== userId.toString()) {
      logger.warn(`⚠️ Ownership check failed: User ${userId} tried to access resource owned by ${resourceOwnerId}`);
      return res.status(403).json({ 
        error: 'You can only access your own resources',
        code: 'NOT_OWNER'
      });
    }
    
    next();
  };
}

/**
 * Check custom permission
 * 
 * @param {Function} checkPermission - Async function that returns true if allowed
 * @returns {Function} Express middleware
 * 
 * @example
 * router.delete('/orders/:id', authenticate, authorizeCustom(async (req) => {
 *   const order = await Order.findById(req.params.id);
 *   return order.status === 'pending';
 * }), handler)
 */
function authorizeCustom(checkPermission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }
    
    try {
      const allowed = await checkPermission(req);
      
      if (!allowed) {
        return res.status(403).json({ 
          error: 'Permission denied',
          code: 'PERMISSION_DENIED'
        });
      }
      
      next();
      
    } catch (error) {
      logger.error('Authorization check error:', error);
      return res.status(500).json({ 
        error: 'Authorization check failed',
        code: 'AUTH_CHECK_ERROR'
      });
    }
  };
}

module.exports = {
  authorize,
  authorizeAdmin,
  authorizeDelivery,
  authorizeOwner,
  authorizeCustom
};
