/**
 * JWT Refresh Token Service - Phase 6.3
 * 
 * Purpose: Implement JWT refresh token rotation for enhanced security
 * 
 * Features:
 * - Refresh token generation and validation
 * - Token rotation on refresh
 * - Automatic cleanup of expired tokens
 * - Blacklist for revoked tokens
 */

const jwt = require('jsonwebtoken');
const logger = require('./logger');
const crypto = require('crypto');

// In-memory storage for refresh tokens (use Redis in production for scalability)
const refreshTokens = new Map();
const blacklistedTokens = new Set();

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

/**
 * Generate access token (short-lived)
 */
function generateAccessToken(userId, role) {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generate refresh token (long-lived)
 */
function generateRefreshToken(userId, role) {
  const refreshToken = crypto.randomBytes(40).toString('hex');
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
  
  // Store refresh token with metadata
  refreshTokens.set(refreshToken, {
    userId,
    role,
    createdAt: new Date(),
    expiresAt,
    used: false
  });
  
  return refreshToken;
}

/**
 * Generate both access and refresh tokens
 */
function generateTokenPair(userId, role) {
  const accessToken = generateAccessToken(userId, role);
  const refreshToken = generateRefreshToken(userId, role);
  
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRY,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRY
  };
}

/**
 * Validate and rotate refresh token
 */
function rotateRefreshToken(refreshToken) {
  // Check if token is blacklisted
  if (blacklistedTokens.has(refreshToken)) {
    throw new Error('Refresh token has been revoked');
  }
  
  // Get token data
  const tokenData = refreshTokens.get(refreshToken);
  
  if (!tokenData) {
    throw new Error('Invalid refresh token');
  }
  
  // Check if token has expired
  if (new Date() > tokenData.expiresAt) {
    refreshTokens.delete(refreshToken);
    throw new Error('Refresh token has expired');
  }
  
  // Check if token has already been used (prevents replay attacks)
  if (tokenData.used) {
    // Token reuse detected - revoke all tokens for this user
    revokeAllUserTokens(tokenData.userId);
    throw new Error('Refresh token has already been used - security breach detected');
  }
  
  // Mark old token as used
  tokenData.used = true;
  
  // Generate new token pair
  const newTokens = generateTokenPair(tokenData.userId, tokenData.role);
  
  // Blacklist old refresh token
  blacklistedTokens.add(refreshToken);
  
  // Clean up old token after a grace period (5 minutes)
  setTimeout(() => {
    refreshTokens.delete(refreshToken);
    blacklistedTokens.delete(refreshToken);
  }, 5 * 60 * 1000);
  
  return newTokens;
}

/**
 * Revoke a specific refresh token
 */
function revokeRefreshToken(refreshToken) {
  const tokenData = refreshTokens.get(refreshToken);
  
  if (tokenData) {
    blacklistedTokens.add(refreshToken);
    refreshTokens.delete(refreshToken);
    return true;
  }
  
  return false;
}

/**
 * Revoke all refresh tokens for a user
 */
function revokeAllUserTokens(userId) {
  let revokedCount = 0;
  
  for (const [token, data] of refreshTokens.entries()) {
    if (data.userId === userId) {
      blacklistedTokens.add(token);
      refreshTokens.delete(token);
      revokedCount++;
    }
  }
  
  return revokedCount;
}

/**
 * Verify access token
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
}

/**
 * Clean up expired tokens (run periodically)
 */
function cleanupExpiredTokens() {
  const now = new Date();
  let cleanedCount = 0;
  
  for (const [token, data] of refreshTokens.entries()) {
    if (now > data.expiresAt) {
      refreshTokens.delete(token);
      blacklistedTokens.delete(token);
      cleanedCount++;
    }
  }
  
  logger.info(`🧹 Cleaned up ${cleanedCount} expired refresh tokens`);
  return cleanedCount;
}

/**
 * Get token statistics
 */
function getTokenStats() {
  return {
    activeRefreshTokens: refreshTokens.size,
    blacklistedTokens: blacklistedTokens.size,
    totalTokens: refreshTokens.size + blacklistedTokens.size
  };
}

// Schedule automatic cleanup every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  verifyAccessToken,
  cleanupExpiredTokens,
  getTokenStats,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY
};
