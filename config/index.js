/**
 * @file config/index.js
 * @description Centralized configuration management with validation
 * @author Michael Lee
 * @created 2025-06-26
 * @modified 2025-06-26
 * 
 * This file provides centralized configuration management for the entire
 * application with environment variable validation and security checks.
 * 
 * Dependencies:
 * - dotenv: Environment variable loading
 * 
 * Environment Variables:
 * - JWT_SECRET: Secret key for user JWT tokens (required, 32+ chars)
 * - JWT_ADMIN_SECRET: Secret key for admin JWT tokens (required, 32+ chars)
 * - DB_HOST: Database host (required)
 * - DB_USER: Database user (required)
 * - DB_PASSWORD: Database password (required)
 * - DB_NAME: Database name (required)
 * - PORT: Server port (default: 10000)
 * - NODE_ENV: Environment mode (default: development)
 */

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 10000,
    env: process.env.NODE_ENV || 'development',
    host: process.env.HOST || '0.0.0.0'
  },
  
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'home_assistant',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 20,
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT, 10) || 100,
    acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT, 10) || 60000,
    timeout: parseInt(process.env.DB_TIMEOUT, 10) || 60000,
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 300000
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    adminSecret: process.env.JWT_ADMIN_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    maxAuthAttempts: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 5
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined'
  }
}

// Validate required configuration
const requiredEnvVars = [
  'JWT_SECRET',
  'JWT_ADMIN_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME'
]

const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '))
  console.error('Please check your .env file and ensure all required variables are set')
  process.exit(1)
}

// Validate JWT secrets are not default values
const dangerousDefaults = [
  'your-secret-key',
  'your-admin-secret-key',
  'secret',
  'admin-secret'
]

if (dangerousDefaults.includes(config.jwt.secret) || 
    dangerousDefaults.includes(config.jwt.adminSecret)) {
  console.error('JWT secrets cannot use default values. Please set secure random values.')
  process.exit(1)
}

// Validate JWT secrets are sufficiently complex
if (config.jwt.secret.length < 32 || config.jwt.adminSecret.length < 32) {
  console.error('JWT secrets must be at least 32 characters long')
  process.exit(1)
}

module.exports = config