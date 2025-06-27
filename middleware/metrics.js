/**
 * @file middleware/metrics.js
 * @description Express middleware for metrics collection
 * @author Michael Lee
 * @created 2025-06-27
 */

import metricsService from '../services/metrics.js'

/**
 * Metrics collection middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
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

    // Record errors (4xx, 5xx status codes)
    if (statusCode >= 400) {
      metricsService.incrementErrors(`${method} ${endpoint}`, statusCode).catch(console.error)
    }

    // Call original end method
    originalEnd.apply(this, args)
  }

  next()
}

export default metricsMiddleware