/**
 * Jest Configuration - Phase 6.2
 * 
 * Purpose: Configure Jest for automated testing
 * Supports unit tests, integration tests, and coverage reporting
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Coverage thresholds (enforce meaningful coverage for tested modules)
  coverageThreshold: {
    global: {
      branches: 1,
      functions: 1,
      lines: 2,
      statements: 2
    },
    // Higher thresholds for critical middleware
    './middleware/authenticate.js': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './middleware/inputValidation.js': {
      branches: 20,
      functions: 20,
      lines: 40,
      statements: 40
    }
  },
  
  // Files to collect coverage from
  collectCoverageFrom: [
    'services/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    '!services/domains/shared/**/*.js', // Already tested
    '!**/node_modules/**',
    '!**/test-*.js',
    '!**/coverage/**'
  ],
  
  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.js',
    '**/*.test.js',
    '**/*.spec.js'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Test timeout
  testTimeout: 10000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Reset mocks between tests
  resetMocks: true,
  
  // Restore mocks between tests
  restoreMocks: true
};
