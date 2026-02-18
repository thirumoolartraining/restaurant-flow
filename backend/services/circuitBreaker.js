/**
 * Circuit Breaker Service
 * Phase 5.2: Reliability Improvements
 * 
 * Purpose: Prevent cascading failures from external API calls
 * Uses Opossum library for circuit breaker pattern
 * 
 * Features:
 * - Automatic failure detection
 * - Fallback strategies
 * - Health monitoring
 * - Automatic recovery
 */

const CircuitBreaker = require('opossum');
const { logError, logApiCall, warn } = require('./logger');
const { recordApiCall } = require('./metrics');

/**
 * Circuit breaker options for different services
 */
const circuitBreakerOptions = {
  // WhatsApp API - critical service
  whatsapp: {
    timeout: 8000, // 8 seconds (reduced from 10s — connection reuse makes calls faster)
    errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
    resetTimeout: 20000, // Try again after 20 seconds (faster recovery)
    rollingCountTimeout: 60000, // 1 minute rolling window
    rollingCountBuckets: 10,
    name: 'whatsapp-api',
    volumeThreshold: 5 // Minimum 5 requests before opening circuit
  },
  
  // Razorpay API - payment service
  razorpay: {
    timeout: 15000, // 15 seconds (payments can be slower)
    errorThresholdPercentage: 30, // More sensitive for payments
    resetTimeout: 60000, // Try again after 1 minute
    rollingCountTimeout: 120000, // 2 minute rolling window
    rollingCountBuckets: 10,
    name: 'razorpay-api',
    volumeThreshold: 3
  },
  
  // Google Sheets API - non-critical service
  sheets: {
    timeout: 20000, // 20 seconds (sheets can be slow)
    errorThresholdPercentage: 70, // Less sensitive
    resetTimeout: 120000, // Try again after 2 minutes
    rollingCountTimeout: 300000, // 5 minute rolling window
    rollingCountBuckets: 10,
    name: 'sheets-api',
    volumeThreshold: 5
  },
  
  // Cloudinary API - image service
  cloudinary: {
    timeout: 30000, // 30 seconds (image uploads can be slow)
    errorThresholdPercentage: 60,
    resetTimeout: 60000,
    rollingCountTimeout: 180000, // 3 minute rolling window
    rollingCountBuckets: 10,
    name: 'cloudinary-api',
    volumeThreshold: 3
  },
  
  // Groq AI API - voice transcription
  groq: {
    timeout: 15000, // 15 seconds
    errorThresholdPercentage: 50,
    resetTimeout: 45000,
    rollingCountTimeout: 120000,
    rollingCountBuckets: 10,
    name: 'groq-api',
    volumeThreshold: 3
  }
};

/**
 * Create a circuit breaker for a service
 * @param {Function} fn - The async function to wrap
 * @param {string} serviceName - Name of the service (whatsapp, razorpay, sheets, etc)
 * @param {Object} fallback - Optional fallback configuration
 * @returns {CircuitBreaker} Circuit breaker instance
 */
function createCircuitBreaker(fn, serviceName, fallback = null) {
  const options = circuitBreakerOptions[serviceName] || circuitBreakerOptions.whatsapp;
  
  const breaker = new CircuitBreaker(fn, options);
  
  // Event: Circuit opened (too many failures)
  breaker.on('open', () => {
    warn(`Circuit breaker OPENED for ${serviceName}`, {
      service: serviceName,
      state: 'open',
      message: 'Too many failures detected, circuit opened'
    });
  });
  
  // Event: Circuit half-opened (trying to recover)
  breaker.on('halfOpen', () => {
    warn(`Circuit breaker HALF-OPEN for ${serviceName}`, {
      service: serviceName,
      state: 'half-open',
      message: 'Attempting to recover, testing service'
    });
  });
  
  // Event: Circuit closed (recovered)
  breaker.on('close', () => {
    warn(`Circuit breaker CLOSED for ${serviceName}`, {
      service: serviceName,
      state: 'closed',
      message: 'Service recovered, circuit closed'
    });
  });
  
  // Event: Request succeeded
  breaker.on('success', (result, latency) => {
    logApiCall(serviceName, 'request', { 
      success: true, 
      latency,
      state: breaker.status.name
    });
    recordApiCall(serviceName, true, latency);
  });
  
  // Event: Request failed
  breaker.on('failure', (error) => {
    logError(`Circuit breaker failure for ${serviceName}`, error, {
      service: serviceName,
      state: breaker.status.name
    });
    recordApiCall(serviceName, false);
  });
  
  // Event: Request timeout
  breaker.on('timeout', () => {
    warn(`Circuit breaker timeout for ${serviceName}`, {
      service: serviceName,
      timeout: options.timeout,
      state: breaker.status.name
    });
    recordApiCall(serviceName, false);
  });
  
  // Event: Circuit rejected request (circuit is open)
  breaker.on('reject', () => {
    warn(`Circuit breaker REJECTED request for ${serviceName}`, {
      service: serviceName,
      state: 'open',
      message: 'Request rejected, circuit is open'
    });
    recordApiCall(serviceName, false);
  });
  
  // Set fallback if provided
  if (fallback) {
    breaker.fallback(fallback.handler);
    
    breaker.on('fallback', (result) => {
      warn(`Circuit breaker using FALLBACK for ${serviceName}`, {
        service: serviceName,
        fallbackUsed: true,
        message: fallback.message || 'Using fallback response'
      });
    });
  }
  
  return breaker;
}

/**
 * Get health status of all circuit breakers
 * @returns {Object} Health status of all breakers
 */
function getCircuitBreakerHealth() {
  const health = {};
  
  Object.keys(circuitBreakers).forEach(service => {
    const breaker = circuitBreakers[service];
    if (breaker) {
      const stats = breaker.stats;
      health[service] = {
        state: breaker.status.name,
        isOpen: breaker.opened,
        isHalfOpen: breaker.halfOpen,
        isClosed: breaker.closed,
        stats: {
          fires: stats.fires,
          successes: stats.successes,
          failures: stats.failures,
          rejects: stats.rejects,
          timeouts: stats.timeouts,
          fallbacks: stats.fallbacks,
          latencyMean: Math.round(stats.latencyMean),
          percentiles: {
            p50: Math.round(stats.percentiles['0.5']),
            p95: Math.round(stats.percentiles['0.95']),
            p99: Math.round(stats.percentiles['0.99'])
          }
        }
      };
    }
  });
  
  return health;
}

/**
 * Reset a specific circuit breaker
 * @param {string} serviceName - Name of the service
 */
function resetCircuitBreaker(serviceName) {
  const breaker = circuitBreakers[serviceName];
  if (breaker) {
    breaker.close();
    warn(`Circuit breaker manually RESET for ${serviceName}`, {
      service: serviceName,
      action: 'manual_reset'
    });
  }
}

/**
 * Reset all circuit breakers
 */
function resetAllCircuitBreakers() {
  Object.keys(circuitBreakers).forEach(service => {
    resetCircuitBreaker(service);
  });
}

// Store circuit breaker instances
const circuitBreakers = {};

/**
 * Register a circuit breaker for a service
 * @param {string} serviceName - Name of the service
 * @param {Function} fn - The async function to wrap
 * @param {Object} fallback - Optional fallback configuration
 * @returns {CircuitBreaker} Circuit breaker instance
 */
function registerCircuitBreaker(serviceName, fn, fallback = null) {
  if (circuitBreakers[serviceName]) {
    return circuitBreakers[serviceName];
  }
  
  const breaker = createCircuitBreaker(fn, serviceName, fallback);
  circuitBreakers[serviceName] = breaker;
  
  return breaker;
}

/**
 * Get a registered circuit breaker
 * @param {string} serviceName - Name of the service
 * @returns {CircuitBreaker|null} Circuit breaker instance or null
 */
function getCircuitBreaker(serviceName) {
  return circuitBreakers[serviceName] || null;
}

/**
 * Execute a function with circuit breaker protection
 * @param {string} serviceName - Name of the service
 * @param {Function} fn - The async function to execute
 * @param {Array} args - Arguments to pass to the function
 * @param {Object} fallback - Optional fallback configuration
 * @returns {Promise} Result of the function or fallback
 */
async function executeWithCircuitBreaker(serviceName, fn, args = [], fallback = null) {
  let breaker = getCircuitBreaker(serviceName);
  
  if (!breaker) {
    breaker = registerCircuitBreaker(serviceName, fn, fallback);
  }
  
  try {
    return await breaker.fire(...args);
  } catch (error) {
    // If circuit is open and no fallback, throw error
    if (breaker.opened && !fallback) {
      const circuitError = new Error(`Service ${serviceName} is currently unavailable (circuit open)`);
      circuitError.code = 'CIRCUIT_OPEN';
      circuitError.service = serviceName;
      throw circuitError;
    }
    throw error;
  }
}

module.exports = {
  createCircuitBreaker,
  registerCircuitBreaker,
  getCircuitBreaker,
  executeWithCircuitBreaker,
  getCircuitBreakerHealth,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
  circuitBreakerOptions,
  
  // Metadata
  getMetadata: () => ({
    version: '5.2',
    phase: 'Phase 5.2: Circuit Breakers',
    features: [
      'Automatic failure detection',
      'Configurable thresholds per service',
      'Fallback strategies',
      'Health monitoring',
      'Automatic recovery',
      'Event-driven logging'
    ],
    services: Object.keys(circuitBreakerOptions)
  })
};
