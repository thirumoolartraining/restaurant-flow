/**
 * Token Refresh Routes - Phase 6.3
 * 
 * Purpose: Handle JWT token refresh and revocation
 */

const express = require('express');
const logger = require('../services/logger');
const router = express.Router();
const jwtRefresh = require('../services/jwtRefresh');
const { authRateLimiter } = require('../middleware/rateLimiter');

// Rate limiting for token routes
router.use(authRateLimiter);
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/inputValidation');
const authenticate = require('../middleware/authenticate');

/**
 * @route   POST /api/token/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', [
  body('refreshToken')
    .trim()
    .notEmpty().withMessage('Refresh token is required')
    .isLength({ min: 40, max: 100 }).withMessage('Invalid refresh token format'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    // Rotate refresh token and get new token pair
    const tokens = jwtRefresh.rotateRefreshToken(refreshToken);
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: tokens
    });
  } catch (error) {
    logger.error('Token refresh error:', error.message);
    
    res.status(401).json({
      success: false,
      message: error.message || 'Failed to refresh token'
    });
  }
});

/**
 * @route   POST /api/token/revoke
 * @desc    Revoke a refresh token (logout)
 * @access  Private
 */
router.post('/revoke', authenticate, [
  body('refreshToken')
    .trim()
    .notEmpty().withMessage('Refresh token is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    const revoked = jwtRefresh.revokeRefreshToken(refreshToken);
    
    if (revoked) {
      res.json({
        success: true,
        message: 'Token revoked successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }
  } catch (error) {
    logger.error('Token revoke error:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to revoke token'
    });
  }
});

/**
 * @route   POST /api/token/revoke-all
 * @desc    Revoke all refresh tokens for current user
 * @access  Private
 */
router.post('/revoke-all', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const revokedCount = jwtRefresh.revokeAllUserTokens(userId);
    
    res.json({
      success: true,
      message: `Revoked ${revokedCount} token(s)`,
      data: { revokedCount }
    });
  } catch (error) {
    logger.error('Revoke all tokens error:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to revoke tokens'
    });
  }
});

/**
 * @route   GET /api/token/stats
 * @desc    Get token statistics (admin only)
 * @access  Private (Admin)
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const stats = jwtRefresh.getTokenStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Token stats error:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to get token stats'
    });
  }
});

module.exports = router;
