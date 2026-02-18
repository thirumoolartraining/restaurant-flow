/**
 * Authentication Middleware (Legacy - kept for backward compatibility)
 * 
 * DEPRECATED: Use backend/middleware/authenticate.js instead
 * This file is kept to avoid breaking existing imports
 */

const { authenticate } = require('./authenticate');

// Export as default for backward compatibility
module.exports = authenticate;
