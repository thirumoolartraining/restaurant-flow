/**
 * CORS Configuration
 * 
 * Purpose: Secure cross-origin resource sharing
 * Strategy: Environment-aware origins, no wildcards in production
 * 
 * Security:
 * - Production: Explicit allowed origins from environment variables
 * - Development: Localhost origins for local development
 * - No wildcard (*) origins in production
 * - Credentials support for authenticated requests
 */

const { isProduction, isDevelopment } = require('./envValidation');

/**
 * Get allowed origins based on environment
 * 
 * Production: Uses ALLOWED_ORIGINS from .env (comma-separated)
 * Development: Allows common localhost ports
 * 
 * @returns {string[]} Array of allowed origin URLs
 */
function getAllowedOrigins() {
  // Always allow the production frontend
  const productionOrigins = [
    'https://restarunt-bot.vercel.app'
  ];

  if (isProduction()) {
    // Production: Use explicit origins from environment
    const envOrigins = process.env.ALLOWED_ORIGINS || '';
    
    // Parse comma-separated origins
    const origins = envOrigins
      .split(',')
      .map(origin => origin.trim())
      .filter(origin => origin.length > 0);
    
    // Validate origins (must be HTTPS in production)
    const validOrigins = origins.filter(origin => {
      if (!origin.startsWith('https://')) {
        console.warn(`⚠️ CORS: Ignoring non-HTTPS origin in production: ${origin}`);
        return false;
      }
      return true;
    });
    
    // Merge with hardcoded production origins (deduplicate)
    const allOrigins = [...new Set([...productionOrigins, ...validOrigins])];
    
    if (allOrigins.length === 0) {
      console.warn('⚠️ CORS: No valid origins configured for production!');
      console.warn('   Set ALLOWED_ORIGINS in .env (comma-separated HTTPS URLs)');
    }
    
    return allOrigins;
  } else {
    // Development: Allow common localhost ports + production frontend
    return [
      ...productionOrigins,
      'http://localhost:3000',  // React default
      'http://localhost:5173',  // Vite default
      'http://localhost:5000',  // Backend default
      'http://localhost:8080',  // Alternative
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:8080'
    ];
  }
}

/**
 * CORS options for Express
 * 
 * Features:
 * - Origin validation with explicit whitelist
 * - Credentials support (cookies, auth headers)
 * - Preflight caching (24 hours)
 * - Comprehensive method and header support
 */
const corsOptions = {
  /**
   * Origin validation function
   * 
   * @param {string} origin - Request origin
   * @param {Function} callback - Callback(error, allow)
   */
  origin: function (origin, callback) {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in whitelist
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (origin.endsWith('.vercel.app') && origin.includes('nexovent-labs')) {
      // Allow Vercel preview deployments for the project
      callback(null, true);
    } else {
      // Log blocked origin for security monitoring
      console.warn(`⚠️ CORS blocked origin: ${origin}`);
      console.warn(`   Allowed origins: ${allowedOrigins.join(', ')}`);
      
      // Reject with CORS error
      callback(new Error('Not allowed by CORS'));
    }
  },
  
  // Allow credentials (cookies, authorization headers)
  credentials: true,
  
  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  
  // Allowed request headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-HTTP-Method-Override',
    'Accept'
  ],
  
  // Exposed response headers (accessible to client)
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After'
  ],
  
  // Preflight cache duration (24 hours)
  maxAge: 86400,
  
  // Pass CORS preflight response to next handler
  preflightContinue: false,
  
  // Provide successful OPTIONS response status
  optionsSuccessStatus: 204
};

/**
 * Get CORS configuration info (for debugging)
 * 
 * @returns {Object} CORS configuration details
 */
function getCorsInfo() {
  return {
    environment: isProduction() ? 'production' : 'development',
    allowedOrigins: getAllowedOrigins(),
    credentialsEnabled: corsOptions.credentials,
    allowedMethods: corsOptions.methods,
    allowedHeaders: corsOptions.allowedHeaders,
    maxAge: corsOptions.maxAge
  };
}

/**
 * Validate CORS configuration
 * 
 * Checks:
 * - Production has explicit origins configured
 * - No wildcard origins in production
 * - All production origins use HTTPS
 * 
 * @returns {Object} Validation result { valid: boolean, warnings: string[] }
 */
function validateCorsConfig() {
  const warnings = [];
  
  if (isProduction()) {
    const origins = getAllowedOrigins();
    
    // Check if origins are configured
    if (origins.length === 0) {
      warnings.push('No ALLOWED_ORIGINS configured for production');
    }
    
    // Check for wildcard
    if (origins.includes('*')) {
      warnings.push('Wildcard (*) origin not allowed in production');
    }
    
    // Check for HTTP origins
    const httpOrigins = origins.filter(o => o.startsWith('http://'));
    if (httpOrigins.length > 0) {
      warnings.push(`HTTP origins in production: ${httpOrigins.join(', ')}`);
    }
    
    // Check for localhost in production
    const localhostOrigins = origins.filter(o => o.includes('localhost') || o.includes('127.0.0.1'));
    if (localhostOrigins.length > 0) {
      warnings.push(`Localhost origins in production: ${localhostOrigins.join(', ')}`);
    }
  }
  
  return {
    valid: warnings.length === 0,
    warnings
  };
}

module.exports = {
  corsOptions,
  getAllowedOrigins,
  getCorsInfo,
  validateCorsConfig
};
