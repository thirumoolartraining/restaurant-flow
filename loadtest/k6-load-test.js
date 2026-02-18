/**
 * K6 Load Testing Script - Phase 6.9
 * 
 * Purpose: Performance testing and benchmarking
 * 
 * Usage:
 * - Smoke test: k6 run --vus 1 --duration 1m k6-load-test.js
 * - Load test: k6 run --vus 100 --duration 5m k6-load-test.js
 * - Stress test: k6 run --vus 200 --duration 10m k6-load-test.js
 * - Spike test: k6 run --stage 1m:10,1m:100,1m:200,1m:10 k6-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiResponseTime = new Trend('api_response_time');
const requestCount = new Counter('request_count');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'https://restaruntbot.onrender.com';
const API_URL = `${BASE_URL}/api`;

// Test scenarios
export const options = {
  scenarios: {
    // Smoke test - verify system works with minimal load
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { test_type: 'smoke' },
    },
    
    // Load test - normal expected load
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // Ramp up
        { duration: '5m', target: 50 },   // Stay at 50 users
        { duration: '2m', target: 100 },  // Ramp to 100
        { duration: '5m', target: 100 },  // Stay at 100
        { duration: '2m', target: 0 },    // Ramp down
      ],
      tags: { test_type: 'load' },
      startTime: '1m',
    },
    
    // Stress test - find breaking point
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 300 },
        { duration: '5m', target: 300 },
        { duration: '5m', target: 0 },
      ],
      tags: { test_type: 'stress' },
      startTime: '17m',
    },
    
    // Spike test - sudden traffic spike
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '10s', target: 500 },  // Spike!
        { duration: '3m', target: 500 },
        { duration: '10s', target: 10 },
        { duration: '3m', target: 10 },
        { duration: '10s', target: 0 },
      ],
      tags: { test_type: 'spike' },
      startTime: '42m',
    },
  },
  
  thresholds: {
    // 95% of requests should be below 500ms
    'http_req_duration': ['p(95)<500'],
    // 99% of requests should be below 1000ms
    'http_req_duration{test_type:load}': ['p(99)<1000'],
    // Error rate should be below 1%
    'errors': ['rate<0.01'],
    // 95% of requests should succeed
    'http_req_failed': ['rate<0.05'],
  },
};

// Test data
const testCustomer = {
  phone: '+919876543210',
  name: 'Load Test User',
  address: 'Test Address, Test City'
};

/**
 * Setup - runs once before all scenarios
 */
export function setup() {
  console.log('🚀 Starting load test...');
  console.log(`Base URL: ${BASE_URL}`);
  
  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check passed': (r) => r.status === 200,
  });
  
  return { baseUrl: BASE_URL };
}

/**
 * Main test function - runs for each VU iteration
 */
export default function (data) {
  // Test 1: Health Check
  testHealthCheck();
  sleep(1);
  
  // Test 2: Get Menu
  testGetMenu();
  sleep(1);
  
  // Test 3: Get Categories
  testGetCategories();
  sleep(1);
  
  // Test 4: Get Offers
  testGetOffers();
  sleep(1);
  
  // Test 5: Get Settings
  testGetSettings();
  sleep(2);
}

/**
 * Test health check endpoint
 */
function testHealthCheck() {
  const res = http.get(`${BASE_URL}/health`);
  
  const success = check(res, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 100ms': (r) => r.timings.duration < 100,
  });
  
  errorRate.add(!success);
  apiResponseTime.add(res.timings.duration);
  requestCount.add(1);
}

/**
 * Test get menu endpoint
 */
function testGetMenu() {
  const res = http.get(`${API_URL}/public/menu`);
  
  const success = check(res, {
    'menu status is 200': (r) => r.status === 200,
    'menu has items': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body) && body.length > 0;
      } catch {
        return false;
      }
    },
    'menu response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  errorRate.add(!success);
  apiResponseTime.add(res.timings.duration);
  requestCount.add(1);
}

/**
 * Test get categories endpoint
 */
function testGetCategories() {
  const res = http.get(`${API_URL}/public/categories`);
  
  const success = check(res, {
    'categories status is 200': (r) => r.status === 200,
    'categories response time < 300ms': (r) => r.timings.duration < 300,
  });
  
  errorRate.add(!success);
  apiResponseTime.add(res.timings.duration);
  requestCount.add(1);
}

/**
 * Test get offers endpoint
 */
function testGetOffers() {
  const res = http.get(`${API_URL}/public/offers`);
  
  const success = check(res, {
    'offers status is 200': (r) => r.status === 200,
    'offers response time < 300ms': (r) => r.timings.duration < 300,
  });
  
  errorRate.add(!success);
  apiResponseTime.add(res.timings.duration);
  requestCount.add(1);
}

/**
 * Test get settings endpoint
 */
function testGetSettings() {
  const res = http.get(`${API_URL}/public/settings`);
  
  const success = check(res, {
    'settings status is 200': (r) => r.status === 200,
    'settings response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  errorRate.add(!success);
  apiResponseTime.add(res.timings.duration);
  requestCount.add(1);
}

/**
 * Teardown - runs once after all scenarios
 */
export function teardown(data) {
  console.log('✅ Load test completed');
}

/**
 * Handle summary - custom summary output
 */
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'loadtest/summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  let summary = '\n';
  summary += `${indent}📊 Load Test Summary\n`;
  summary += `${indent}${'='.repeat(50)}\n\n`;
  
  // Scenarios
  summary += `${indent}Scenarios:\n`;
  for (const [name, scenario] of Object.entries(data.metrics.scenarios || {})) {
    summary += `${indent}  ${name}: ${scenario.values.count} iterations\n`;
  }
  summary += '\n';
  
  // HTTP metrics
  summary += `${indent}HTTP Metrics:\n`;
  summary += `${indent}  Requests: ${data.metrics.http_reqs?.values.count || 0}\n`;
  summary += `${indent}  Failed: ${data.metrics.http_req_failed?.values.rate || 0}%\n`;
  summary += `${indent}  Duration (avg): ${(data.metrics.http_req_duration?.values.avg || 0).toFixed(2)}ms\n`;
  summary += `${indent}  Duration (p95): ${(data.metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2)}ms\n`;
  summary += `${indent}  Duration (p99): ${(data.metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2)}ms\n`;
  summary += '\n';
  
  // Custom metrics
  summary += `${indent}Custom Metrics:\n`;
  summary += `${indent}  Error Rate: ${((data.metrics.errors?.values.rate || 0) * 100).toFixed(2)}%\n`;
  summary += `${indent}  API Response Time (avg): ${(data.metrics.api_response_time?.values.avg || 0).toFixed(2)}ms\n`;
  summary += `${indent}  Total Requests: ${data.metrics.request_count?.values.count || 0}\n`;
  summary += '\n';
  
  // Thresholds
  summary += `${indent}Thresholds:\n`;
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    const status = threshold.ok ? '✅' : '❌';
    summary += `${indent}  ${status} ${name}\n`;
  }
  
  return summary;
}
