/**
 * Environment Variable Validation
 * 
 * Purpose: Validate required environment variables at startup
 * Prevents runtime errors due to missing configuration
 * 
 * Usage: Call validateEnv() in server.js before starting server
 */

/**
 * Environment variable schema
 * Define all required and optional variables with validation rules
 */
const envSchema = {
  // Database
  MONGODB_URI: {
    required: true,
    validate: (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
    error: 'MONGODB_URI must be a valid MongoDB connection string'
  },
  
  // JWT Authentication
  JWT_SECRET: {
    required: true,
    validate: (value) => value.length >= 32,
    error: 'JWT_SECRET must be at least 32 characters long'
  },
  
  // Meta WhatsApp API
  META_PHONE_NUMBER_ID: {
    required: true,
    validate: (value) => /^\d+$/.test(value),
    error: 'META_PHONE_NUMBER_ID must be numeric'
  },
  
  META_ACCESS_TOKEN: {
    required: true,
    validate: (value) => value.length > 50,
    error: 'META_ACCESS_TOKEN appears invalid (too short)'
  },
  
  META_WABA_ID: {
    required: true,
    validate: (value) => /^\d+$/.test(value),
    error: 'META_WABA_ID must be numeric (your WhatsApp Business Account ID)'
  },

  META_APP_SECRET: {
    required: true,
    validate: (value) => value.length >= 32,
    error: 'META_APP_SECRET must be at least 32 characters long'
  },
  
  META_VERIFY_TOKEN: {
    required: true,
    validate: (value) => value.length >= 8,
    error: 'META_VERIFY_TOKEN must be at least 8 characters long'
  },

  META_APP_ID: {
    required: false,
    validate: (value) => !value || /^\d+$/.test(value),
    error: 'META_APP_ID must be numeric (needed for template image uploads)'
  },
  
  // Razorpay Payment
  RAZORPAY_KEY_ID: {
    required: false, // Optional if not using payments
    validate: (value) => !value || value.startsWith('rzp_'),
    error: 'RAZORPAY_KEY_ID must start with rzp_'
  },
  
  RAZORPAY_KEY_SECRET: {
    required: false,
    validate: (value) => !value || value.length >= 16,
    error: 'RAZORPAY_KEY_SECRET appears invalid'
  },
  
  // Cloudinary (for images)
  CLOUDINARY_CLOUD_NAME: {
    required: false,
    validate: (value) => !value || value.length > 0,
    error: 'CLOUDINARY_CLOUD_NAME cannot be empty if set'
  },
  
  CLOUDINARY_API_KEY: {
    required: false,
    validate: (value) => !value || /^\d+$/.test(value),
    error: 'CLOUDINARY_API_KEY must be numeric'
  },
  
  CLOUDINARY_API_SECRET: {
    required: false,
    validate: (value) => !value || value.length >= 16,
    error: 'CLOUDINARY_API_SECRET appears invalid'
  },
  
  // Google Sheets (for data export)
  GOOGLE_SHEETS_CREDENTIALS: {
    required: false,
    validate: (value) => {
      if (!value) return true;
      try {
        const parsed = JSON.parse(value);
        return parsed.type === 'service_account';
      } catch {
        return false;
      }
    },
    error: 'GOOGLE_SHEETS_CREDENTIALS must be valid JSON service account credentials'
  },
  
  // Groq AI (for voice transcription)
  GROQ_API_KEY: {
    required: false,
    validate: (value) => !value || value.startsWith('gsk_'),
    error: 'GROQ_API_KEY must start with gsk_'
  },
  
  // Server Configuration
  PORT: {
    required: false,
    default: '5000',
    validate: (value) => {
      const port = parseInt(value);
      return port > 0 && port < 65536;
    },
    error: 'PORT must be between 1 and 65535'
  },
  
  NODE_ENV: {
    required: false,
    default: 'development',
    validate: (value) => ['development', 'production', 'test'].includes(value),
    error: 'NODE_ENV must be development, production, or test'
  },
  
  // CORS Configuration
  ALLOWED_ORIGINS: {
    required: false, // Optional in development, recommended in production
    validate: (value) => {
      if (!value) return true; // Optional
      // Check if it's a comma-separated list of URLs
      const origins = value.split(',').map(o => o.trim());
      return origins.every(origin => {
        try {
          new URL(origin);
          return true;
        } catch {
          return false;
        }
      });
    },
    error: 'ALLOWED_ORIGINS must be comma-separated valid URLs'
  },

  // Firebase Admin SDK (for FCM push notifications)
  FIREBASE_PROJECT_ID: {
    required: false,
    validate: (value) => !value || value.length > 0,
    error: 'FIREBASE_PROJECT_ID cannot be empty if set'
  },

  FIREBASE_CLIENT_EMAIL: {
    required: false,
    validate: (value) => !value || value.includes('@'),
    error: 'FIREBASE_CLIENT_EMAIL must be a valid service account email'
  },

  FIREBASE_PRIVATE_KEY: {
    required: false,
    validate: (value) => !value || value.includes('PRIVATE KEY'),
    error: 'FIREBASE_PRIVATE_KEY must be a valid PEM private key'
  }
};

/**
 * Validate environment variables
 * 
 * @param {boolean} exitOnError - Exit process if validation fails (default: true)
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
function validateEnv(exitOnError = true) {
  const errors = [];
  const warnings = [];
  
  console.log('🔍 Validating environment variables...\n');
  
  // Check each variable in schema
  for (const [key, rules] of Object.entries(envSchema)) {
    const value = process.env[key];
    
    // Check if required variable is missing
    if (rules.required && !value) {
      errors.push(`❌ ${key} is required but not set`);
      continue;
    }
    
    // Set default if not provided
    if (!value && rules.default) {
      process.env[key] = rules.default;
      console.log(`ℹ️  ${key} not set, using default: ${rules.default}`);
      continue;
    }
    
    // Skip validation if optional and not set
    if (!rules.required && !value) {
      warnings.push(`⚠️  ${key} is not set (optional)`);
      continue;
    }
    
    // Validate value
    if (value && rules.validate && !rules.validate(value)) {
      errors.push(`❌ ${key}: ${rules.error}`);
      continue;
    }
    
    // Success
    console.log(`✅ ${key} is valid`);
  }
  
  // Print warnings
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(w => console.log(w));
  }
  
  // Print errors
  if (errors.length > 0) {
    console.error('\n❌ Environment validation failed:\n');
    errors.forEach(e => console.error(e));
    console.error('\nPlease check your .env file and ensure all required variables are set correctly.\n');
    
    if (exitOnError) {
      process.exit(1);
    }
    
    return { valid: false, errors };
  }
  
  console.log('\n✅ All environment variables validated successfully\n');
  return { valid: true, errors: [] };
}

/**
 * Get environment info (for debugging)
 * Masks sensitive values
 */
function getEnvInfo() {
  const info = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || '5000',
    database: process.env.MONGODB_URI ? 'configured' : 'missing',
    whatsapp: {
      phoneNumberId: process.env.META_PHONE_NUMBER_ID ? 'configured' : 'missing',
      accessToken: process.env.META_ACCESS_TOKEN ? 'configured' : 'missing',
      appSecret: process.env.META_APP_SECRET ? 'configured' : 'missing'
    },
    payment: {
      razorpay: process.env.RAZORPAY_KEY_ID ? 'configured' : 'not configured'
    },
    services: {
      cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'not configured',
      googleSheets: process.env.GOOGLE_SHEETS_CREDENTIALS ? 'configured' : 'not configured',
      groqAi: process.env.GROQ_API_KEY ? 'configured' : 'not configured'
    }
  };
  
  return info;
}

/**
 * Check if running in production
 */
function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
function isDevelopment() {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}

module.exports = {
  validateEnv,
  getEnvInfo,
  isProduction,
  isDevelopment
};
