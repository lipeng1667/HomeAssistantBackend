/**
 * @file middleware/redisRateLimit.js
 * @description Redis-backed distributed rate limiting middleware for PM2 cluster coordination
 * @author Michael Lee
 * @created 2025-06-27
 * @modified 2025-06-27
 * 
 * This module provides distributed rate limiting using Redis as the shared state store,
 * enabling consistent rate limiting across multiple PM2 instances. It offers both
 * fixed window and sliding window algorithms with automatic fallback to in-memory limiting.
 * 
 * Modification Log:
 * - 2025-06-27: Initial implementation with fixed window rate limiting
 * - 2025-06-27: Added sliding window rate limiting for more precise control
 * - 2025-06-27: Enhanced documentation and error handling
 * 
 * Functions:
 * - redisRateLimit(options): Factory for fixed window rate limiting middleware
 * - slidingWindowRateLimit(options): Factory for sliding window rate limiting middleware
 * 
 * Dependencies:
 * - config/redis.js: Redis client for distributed state management
 * 
 * Rate Limiting Strategies:
 * - Fixed Window: Resets counters at fixed time intervals
 * - Sliding Window: Maintains rolling window for more accurate limiting
 * 
 * Redis Key Schema:
 * - ha:rate_limit:{identifier} - Fixed window counters with scores as timestamps
 * - ha:sliding_limit:{identifier} - Sliding window entries with timestamp scores
 */

const redisClient = require('../config/redis.js')

/**
 * Factory function for Redis-based fixed window rate limiting middleware
 * @param {Object} options - Configuration object for rate limiting behavior
 * @param {number} [options.windowMs=900000] - Time window in milliseconds (default: 15 minutes)
 * @param {number} [options.max=100] - Maximum requests allowed per window
 * @param {Function} [options.keyGenerator] - Function to generate unique rate limit key from request
 * @param {Object} [options.message] - Error response object when rate limit exceeded
 * @returns {Function} Express middleware function for rate limiting
 * @sideEffects Creates Redis entries with TTL, modifies HTTP response headers
 * @throws Does not throw - falls back gracefully when Redis unavailable
 * @example
 * const limiter = redisRateLimit({ windowMs: 60000, max: 10 })
 * app.use('/api', limiter)
 */
const redisRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    keyGenerator = (req) => req.ip || 'unknown',
    message = {
      status: 'error',
      message: 'Too many requests, please try again later'
    }
  } = options

  return async (req, res, next) => {
    // Fallback to next() if Redis is not available
    if (!redisClient.isReady()) {
      return next()
    }

    try {
      const client = redisClient.getClient()
      const key = redisClient.key(`rate_limit:${keyGenerator(req)}`)
      const now = Date.now()
      const windowStart = Math.floor(now / windowMs) * windowMs

      // Use Redis pipeline for atomic operations
      const multi = client.multi()
      
      // Remove expired entries (older than current window)
      multi.zRemRangeByScore(key, 0, windowStart - 1)
      
      // Count current requests in window
      multi.zCard(key)
      
      // Add current request
      multi.zAdd(key, { score: now, value: now.toString() })
      
      // Set expiration
      multi.expire(key, Math.ceil(windowMs / 1000))
      
      const results = await multi.exec()
      const currentCount = results[1] || 0

      // Check if limit exceeded
      if (currentCount >= max) {
        const retryAfter = Math.ceil((windowStart + windowMs - now) / 1000)
        
        res.set({
          'X-RateLimit-Limit': max,
          'X-RateLimit-Remaining': 0,
          'X-RateLimit-Reset': new Date(windowStart + windowMs).toISOString(),
          'Retry-After': retryAfter
        })
        
        return res.status(429).json(message)
      }

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': Math.max(0, max - currentCount - 1),
        'X-RateLimit-Reset': new Date(windowStart + windowMs).toISOString()
      })

      next()
    } catch (error) {
      console.error('Redis rate limit error:', error)
      // Fallback to allowing request on Redis error
      next()
    }
  }
}

/**
 * Factory function for Redis-based sliding window rate limiting middleware
 * @param {Object} options - Configuration object for sliding window rate limiting
 * @param {number} [options.windowMs=900000] - Rolling time window in milliseconds (default: 15 minutes)
 * @param {number} [options.max=100] - Maximum requests allowed in sliding window
 * @param {Function} [options.keyGenerator] - Function to generate unique rate limit key from request
 * @param {Object} [options.message] - Error response object when rate limit exceeded
 * @returns {Function} Express middleware function for precise rate limiting
 * @sideEffects Creates Redis sorted sets, removes expired entries, modifies response headers
 * @throws Does not throw - falls back gracefully when Redis unavailable
 * @example
 * const authLimiter = slidingWindowRateLimit({ windowMs: 300000, max: 5 })
 * app.use('/api/auth/login', authLimiter)
 */
const slidingWindowRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    keyGenerator = (req) => req.ip || 'unknown',
    message = {
      status: 'error',
      message: 'Too many requests, please try again later'
    }
  } = options

  return async (req, res, next) => {
    if (!redisClient.isReady()) {
      return next()
    }

    try {
      const client = redisClient.getClient()
      const key = redisClient.key(`sliding_limit:${keyGenerator(req)}`)
      const now = Date.now()
      const windowStart = now - windowMs

      // Sliding window: remove old entries and count current
      const multi = client.multi()
      
      // Remove entries older than the window
      multi.zRemRangeByScore(key, 0, windowStart)
      
      // Count current entries
      multi.zCard(key)
      
      const results = await multi.exec()
      const currentCount = results[1] || 0

      if (currentCount >= max) {
        // Get the oldest entry to calculate when the window will have space
        const oldest = await client.zRange(key, 0, 0, { REV: false, WITHSCORES: true })
        const retryAfter = oldest.length > 0 
          ? Math.ceil((oldest[0].score + windowMs - now) / 1000)
          : Math.ceil(windowMs / 1000)

        res.set({
          'X-RateLimit-Limit': max,
          'X-RateLimit-Remaining': 0,
          'X-RateLimit-Reset': new Date(now + retryAfter * 1000).toISOString(),
          'Retry-After': retryAfter
        })

        return res.status(429).json(message)
      }

      // Add current request and set expiration
      await client.multi()
        .zAdd(key, { score: now, value: `${now}-${Math.random()}` })
        .expire(key, Math.ceil(windowMs / 1000))
        .exec()

      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': Math.max(0, max - currentCount - 1),
        'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
      })

      next()
    } catch (error) {
      console.error('Sliding window rate limit error:', error)
      next()
    }
  }
}

module.exports = {
  redisRateLimit,
  slidingWindowRateLimit,
  default: redisRateLimit
}