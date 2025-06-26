/**
 * @file errorHandler.js
 * @description Enhanced error handling middleware with structured logging
 * @author Michael Lee
 * @created 2025-06-26
 * @modified 2025-06-26
 * 
 * This file provides comprehensive error handling for the entire application
 * with structured logging, appropriate error responses, and security considerations.
 * 
 * Dependencies:
 * - config: Application configuration
 * 
 * Features:
 * - Global error handler with context logging
 * - Environment-aware error responses
 * - 404 not found handler
 * - Async error wrapper for route handlers
 * - Database error handling
 * - Security-conscious error messages
 */

const config = require('../config')

/**
 * Global error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  // Log full error details
  const errorInfo = {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
    userId: req.user?.id || req.admin?.id || 'anonymous'
  }

  console.error('Application Error:', errorInfo)

  // Determine error status
  const status = err.status || err.statusCode || 500

  // Prepare error response
  const errorResponse = {
    status: 'error',
    message: getErrorMessage(err, status),
    timestamp: new Date().toISOString()
  }

  // Add stack trace in development
  if (config.server.env === 'development') {
    errorResponse.stack = err.stack
    errorResponse.details = err
  }

  // Handle specific error types
  if (err.code === 'ECONNREFUSED') {
    errorResponse.message = 'Database connection failed'
  } else if (err.code === 'ER_DUP_ENTRY') {
    errorResponse.message = 'Duplicate entry detected'
  } else if (err.name === 'ValidationError') {
    errorResponse.message = 'Invalid input data'
  }

  res.status(status).json(errorResponse)
}

/**
 * Get appropriate error message based on environment
 * @param {Error} err - Error object
 * @param {number} status - HTTP status code
 * @returns {string} Error message
 */
const getErrorMessage = (err, status) => {
  if (config.server.env === 'development') {
    return err.message
  }

  // Generic messages for production
  const statusMessages = {
    400: 'Bad request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not found',
    409: 'Conflict',
    422: 'Unprocessable entity',
    429: 'Too many requests',
    500: 'Internal server error',
    502: 'Bad gateway',
    503: 'Service unavailable'
  }

  return statusMessages[status] || 'Something went wrong'
}

/**
 * 404 Not Found handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  })
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
}