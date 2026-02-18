/**
 * Metrics Collection Service
 * Phase 4.2: Observability - Metrics & Monitoring
 * 
 * Purpose: Collect and expose application metrics
 * Features:
 * - Request counters (total, success, failure)
 * - Response time histograms
 * - Domain action metrics
 * - External API call tracking
 * - Business event counters
 * - In-memory storage (production: use Prometheus/StatsD)
 */

// In-memory metrics store
const metrics = {
  // Request metrics
  requests: {
    total: 0,
    success: 0,
    failure: 0,
    byMessageType: {},
    byRoute: {}
  },
  
  // Response time metrics (in ms)
  responseTimes: {
    orchestrator: [],
    domains: {},
    legacy: []
  },
  
  // Domain action metrics
  domainActions: {},
  
  // External API metrics
  externalApis: {
    whatsapp: { calls: 0, failures: 0, totalDuration: 0 },
    razorpay: { calls: 0, failures: 0, totalDuration: 0 },
    sheets: { calls: 0, failures: 0, totalDuration: 0 }
  },
  
  // Business events
  businessEvents: {
    'order.created': 0,
    'order.cancelled': 0,
    'payment.initiated': 0,
    'payment.completed': 0,
    'payment.failed': 0,
    'delivery.assigned': 0,
    'cart.item_added': 0,
    'cart.item_removed': 0
  },
  
  // System metrics
  system: {
    startTime: Date.now(),
    lastReset: Date.now()
  }
};

/**
 * Record incoming request
 * @param {string} messageType - Type of message (text, button, list, etc)
 * @param {string} route - Route taken (domain, legacy)
 */
function recordRequest(messageType, route = 'unknown') {
  metrics.requests.total++;
  metrics.requests.byMessageType[messageType] = (metrics.requests.byMessageType[messageType] || 0) + 1;
  metrics.requests.byRoute[route] = (metrics.requests.byRoute[route] || 0) + 1;
}

/**
 * Record request success
 */
function recordSuccess() {
  metrics.requests.success++;
}

/**
 * Record request failure
 */
function recordFailure() {
  metrics.requests.failure++;
}

/**
 * Record response time
 * @param {string} component - Component name (orchestrator, domain, legacy)
 * @param {number} durationMs - Duration in milliseconds
 * @param {string} detail - Additional detail (domain name, action, etc)
 */
function recordResponseTime(component, durationMs, detail = null) {
  if (component === 'orchestrator') {
    metrics.responseTimes.orchestrator.push(durationMs);
    // Keep only last 1000 measurements
    if (metrics.responseTimes.orchestrator.length > 1000) {
      metrics.responseTimes.orchestrator.shift();
    }
  } else if (component === 'domain' && detail) {
    if (!metrics.responseTimes.domains[detail]) {
      metrics.responseTimes.domains[detail] = [];
    }
    metrics.responseTimes.domains[detail].push(durationMs);
    if (metrics.responseTimes.domains[detail].length > 1000) {
      metrics.responseTimes.domains[detail].shift();
    }
  } else if (component === 'legacy') {
    metrics.responseTimes.legacy.push(durationMs);
    if (metrics.responseTimes.legacy.length > 1000) {
      metrics.responseTimes.legacy.shift();
    }
  }
}

/**
 * Record domain action execution
 * @param {string} domain - Domain name
 * @param {string} action - Action name
 * @param {boolean} success - Whether action succeeded
 */
function recordDomainAction(domain, action, success = true) {
  const key = `${domain}.${action}`;
  if (!metrics.domainActions[key]) {
    metrics.domainActions[key] = { total: 0, success: 0, failure: 0 };
  }
  metrics.domainActions[key].total++;
  if (success) {
    metrics.domainActions[key].success++;
  } else {
    metrics.domainActions[key].failure++;
  }
}

/**
 * Record external API call
 * @param {string} service - Service name (whatsapp, razorpay, sheets)
 * @param {boolean} success - Whether call succeeded
 * @param {number} durationMs - Duration in milliseconds
 */
function recordApiCall(service, success = true, durationMs = 0) {
  if (metrics.externalApis[service]) {
    metrics.externalApis[service].calls++;
    if (!success) {
      metrics.externalApis[service].failures++;
    }
    metrics.externalApis[service].totalDuration += durationMs;
  }
}

/**
 * Record business event
 * @param {string} event - Event name
 */
function recordEvent(event) {
  if (metrics.businessEvents[event] !== undefined) {
    metrics.businessEvents[event]++;
  } else {
    metrics.businessEvents[event] = 1;
  }
}

/**
 * Calculate percentile from array of values
 * @param {Array<number>} values - Array of numbers
 * @param {number} percentile - Percentile to calculate (0-100)
 * @returns {number} Percentile value
 */
function calculatePercentile(values, percentile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate average from array of values
 * @param {Array<number>} values - Array of numbers
 * @returns {number} Average value
 */
function calculateAverage(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Get current metrics snapshot
 * @returns {Object} Metrics snapshot
 */
function getMetrics() {
  const uptime = Date.now() - metrics.system.startTime;
  const timeSinceReset = Date.now() - metrics.system.lastReset;
  
  return {
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime / 1000),
      formatted: formatDuration(uptime)
    },
    timeSinceReset: {
      seconds: Math.floor(timeSinceReset / 1000),
      formatted: formatDuration(timeSinceReset)
    },
    requests: {
      ...metrics.requests,
      successRate: metrics.requests.total > 0 
        ? ((metrics.requests.success / metrics.requests.total) * 100).toFixed(2) + '%'
        : '0%'
    },
    responseTimes: {
      orchestrator: {
        count: metrics.responseTimes.orchestrator.length,
        avg: Math.round(calculateAverage(metrics.responseTimes.orchestrator)),
        p50: Math.round(calculatePercentile(metrics.responseTimes.orchestrator, 50)),
        p95: Math.round(calculatePercentile(metrics.responseTimes.orchestrator, 95)),
        p99: Math.round(calculatePercentile(metrics.responseTimes.orchestrator, 99))
      },
      domains: Object.keys(metrics.responseTimes.domains).reduce((acc, domain) => {
        const times = metrics.responseTimes.domains[domain];
        acc[domain] = {
          count: times.length,
          avg: Math.round(calculateAverage(times)),
          p95: Math.round(calculatePercentile(times, 95))
        };
        return acc;
      }, {}),
      legacy: {
        count: metrics.responseTimes.legacy.length,
        avg: Math.round(calculateAverage(metrics.responseTimes.legacy)),
        p95: Math.round(calculatePercentile(metrics.responseTimes.legacy, 95))
      }
    },
    domainActions: metrics.domainActions,
    externalApis: Object.keys(metrics.externalApis).reduce((acc, service) => {
      const api = metrics.externalApis[service];
      acc[service] = {
        ...api,
        avgDuration: api.calls > 0 ? Math.round(api.totalDuration / api.calls) : 0,
        failureRate: api.calls > 0 ? ((api.failures / api.calls) * 100).toFixed(2) + '%' : '0%'
      };
      return acc;
    }, {}),
    businessEvents: metrics.businessEvents
  };
}

/**
 * Reset metrics (useful for testing or periodic resets)
 */
function resetMetrics() {
  metrics.requests = {
    total: 0,
    success: 0,
    failure: 0,
    byMessageType: {},
    byRoute: {}
  };
  metrics.responseTimes = {
    orchestrator: [],
    domains: {},
    legacy: []
  };
  metrics.domainActions = {};
  Object.keys(metrics.externalApis).forEach(service => {
    metrics.externalApis[service] = { calls: 0, failures: 0, totalDuration: 0 };
  });
  Object.keys(metrics.businessEvents).forEach(event => {
    metrics.businessEvents[event] = 0;
  });
  metrics.system.lastReset = Date.now();
}

/**
 * Format duration in human-readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

module.exports = {
  recordRequest,
  recordSuccess,
  recordFailure,
  recordResponseTime,
  recordDomainAction,
  recordApiCall,
  recordEvent,
  getMetrics,
  resetMetrics,
  
  // Metadata
  getMetadata: () => ({
    version: '4.2',
    phase: 'Phase 4.2: Metrics Collection',
    features: [
      'Request counters',
      'Response time histograms',
      'Domain action tracking',
      'External API monitoring',
      'Business event counters',
      'In-memory storage'
    ],
    note: 'Production: Replace with Prometheus/StatsD for persistence'
  })
};
