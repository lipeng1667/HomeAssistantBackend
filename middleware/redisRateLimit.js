/**
 * @file middleware/redisRateLimit.js
 * @description Redis-backed distributed rate limiting middleware
 * @author Michael Lee
 * @created 2025-06-27
 */

import redisClient from '../config/redis.js'

/**
 * Redis-based rate limiting middleware factory
 * @param {Object} options - Rate limiting options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @param {string} options.keyGenerator - Function to generate rate limit key
 * @param {Object} options.message - Error message object
 * @returns {Function} Express middleware function
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
 * Sliding window rate limiter with more precise control
 * @param {Object} options - Rate limiting options
 * @returns {Function} Express middleware function
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

export { redisRateLimit, slidingWindowRateLimit }
export default redisRateLimit