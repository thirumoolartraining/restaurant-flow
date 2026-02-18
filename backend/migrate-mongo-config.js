/**
 * Migrate-Mongo Configuration - Phase 6.7
 * 
 * Purpose: Database migration management
 * 
 * Usage:
 * - npm run migrate:create <migration-name>
 * - npm run migrate:up
 * - npm run migrate:down
 * - npm run migrate:status
 */

require('dotenv').config();

const config = {
  mongodb: {
    url: process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant',
    
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      minPoolSize: 2
    }
  },

  // The migrations dir, can be an relative or absolute path
  migrationsDir: 'migrations',

  // The mongodb collection where the applied changes are stored
  changelogCollectionName: 'changelog',

  // The file extension to create migrations
  migrationFileExtension: '.js',

  // Enable the algorithm to create a checksum of the file contents
  useFileHash: false,

  // Don't change this, unless you know what you're doing
  moduleSystem: 'commonjs'
};

module.exports = config;
