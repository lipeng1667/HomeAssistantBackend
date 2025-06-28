/**
 * @file middleware/metrics.js
 * @description Express middleware for automatic metrics collection on HTTP requests
 * @author Michael Lee
 * @created 2025-06-27
 * @modified 2025-06-27
 * 
 * This middleware automatically captures metrics for all HTTP requests including
 * request counts, response times, and error rates. It integrates with the Redis-based
 * metrics service to provide cluster-wide visibility across PM2 instances.
 * 
 * Modification Log:
 * - 2025-06-27: Initial implementation with request/response tracking
 * - 2025-06-27: Added localhost filtering and error handling
 * - 2025-06-27: Enhanced documentation and middleware pattern compliance
 * 
 * Functions:
 * - metricsMiddleware(req, res, next): Express middleware function for metrics collection
 * 
 * Dependencies:
 * - services/metrics.js: Redis-based metrics service
 * 
 * Behavior:
 * - Skips localhost requests (dashboard/health checks)
 * - Captures request start time and endpoint identification
 * - Records response time and status code upon completion
 * - Automatically tracks error rates for 4xx/5xx responses
 */

const metricsService = require('../services/metrics.js')

/**
 * Express middleware for automatic HTTP request metrics collection
 * @param {Object} req - Express request object containing route and client info
 * @param {Object} res - Express response object for intercepting completion
 * @param {Function} next - Next middleware function in the Express chain
 * @returns {void} Calls next() to continue middleware chain
 * @sideEffects Modifies res.end to capture response metrics, calls metrics service
 * @throws Does not throw - all metrics operations are wrapped in error handling
 * @example
 * app.use(metricsMiddleware) // Apply to all routes
 * app.use('/api', metricsMiddleware) // Apply to specific routes
 */
const metricsMiddleware = (req, res, next) => {
  // Skip localhost requests (same as original logic)
  if (req.ip === '127.0.0.1' || req.ip === '::1' || req.hostname === 'localhost') {
    return next()
  }

  const startTime = Date.now()
  const endpoint = req.route?.path || req.path || 'unknown'
  const method = req.method

  // Increment request counter
  metricsService.incrementRequests(`${method} ${endpoint}`).catch(console.error)

  // Override res.end to capture response metrics
  const originalEnd = res.end
  res.end = function(...args) {
    const responseTime = Date.now() - startTime
    const statusCode = res.statusCode

    // Record response time
    metricsService.recordResponseTime(`${method} ${endpoint}`, responseTime).catch(console.error)

    // Track accepted vs total requests
    if (statusCode < 400) {
      // Request was accepted (not an error)
      metricsService.incrementAcceptedRequests(1).catch(console.error)
    }

    // Record errors (4xx, 5xx status codes)
    if (statusCode >= 400) {
      metricsService.incrementErrors(`${method} ${endpoint}`, statusCode).catch(console.error)
    }

    // Call original end method
    originalEnd.apply(this, args)
  }

  next()
}

module.exports = metricsMiddleware