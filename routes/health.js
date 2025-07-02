/**
 * @file health.js
 * @description Health check endpoints for application monitoring
 * @author Michael Lee
 * @created 2025-06-26
 * @modified 2025-06-26
 * 
 * This file provides comprehensive health check endpoints for monitoring
 * application status, database connectivity, and system metrics.
 * 
 * Dependencies:
 * - express: Web framework
 * - mysql2: Database connection pool
 * - errorHandler: Async error handling
 * 
 * Routes:
 * - GET /health: Basic health status and uptime
 * - GET /health/db: Database connectivity check
 * - GET /health/detailed: Comprehensive system health information
 */

const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const { asyncHandler } = require('../middleware/errorHandler')

/**
 * Basic health check endpoint
 * @route GET /health
 * @returns {Object} Health status
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  })
})

/**
 * Database health check endpoint
 * @route GET /health/db
 * @returns {Object} Database connection status
 */
router.get('/health/db', asyncHandler(async (req, res) => {
  const start = Date.now()
  
  try {
    await pool.execute('SELECT 1 as health_check')
    const responseTime = Date.now() - start
    
    res.json({
      status: 'healthy',
      database: 'connected',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    const responseTime = Date.now() - start
    
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    })
  }
}))

/**
 * Detailed system health check
 * @route GET /health/detailed
 * @returns {Object} Detailed health information
 */
router.get('/health/detailed', asyncHandler(async (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.version,
      platform: process.platform,
      arch: process.arch
    },
    database: {
      status: 'unknown',
      responseTime: null
    }
  }

  // Test database connection
  const dbStart = Date.now()
  try {
    await pool.execute('SELECT 1 as health_check')
    healthCheck.database.status = 'connected'
    healthCheck.database.responseTime = `${Date.now() - dbStart}ms`
  } catch (error) {
    healthCheck.status = 'unhealthy'
    healthCheck.database.status = 'disconnected'
    healthCheck.database.error = error.message
    healthCheck.database.responseTime = `${Date.now() - dbStart}ms`
  }

  const statusCode = healthCheck.status === 'healthy' ? 200 : 503
  res.status(statusCode).json(healthCheck)
}))

module.exports = router