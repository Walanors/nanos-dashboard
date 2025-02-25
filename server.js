// server.js - Simple wrapper to run the TypeScript server
// This avoids module system conflicts

// Set production environment
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Use ts-node to run the TypeScript server with a specific tsconfig
require('ts-node').register({
  transpileOnly: true,
  project: './tsconfig.server-runtime.json'
});

// Import and run the server
require('./src/server/index.ts'); 