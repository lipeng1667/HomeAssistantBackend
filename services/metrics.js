/**
 * @file services/metrics.js
 * @description Redis-based metrics collection and aggregation service
 * @author Michael Lee
 * @created 2025-06-27
 */

import redisClient from '../config/redis.js'

class MetricsService {
  constructor() {
    this.instanceId = process.env.pm_id || `instance-${Date.now()}`
  }

  /**
   * Increment request counter
   * @param {string} endpoint - API endpoint
   * @param {number} [increment=1] - Increment value
   * @returns {Promise<void>}
   */
  async incrementRequests(endpoint, increment = 1) {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()
    const now = Date.now()
    const hour = Math.floor(now / 3600000) * 3600000

    try {
      const multi = client.multi()
      
      // Total requests
      multi.incrBy(redisClient.key('requests:total'), increment)
      
      // Per-endpoint requests
      multi.incrBy(redisClient.key(`requests:endpoint:${endpoint}`), increment)
      
      // Per-instance requests
      multi.incrBy(redisClient.key(`requests:instance:${this.instanceId}`), increment)
      
      // Hourly requests (with 24h TTL)
      multi.incrBy(redisClient.key(`requests:hourly:${hour}`), increment)
      multi.expire(redisClient.key(`requests:hourly:${hour}`), 86400)
      
      await multi.exec()
    } catch (error) {
      console.error('Error incrementing request metrics:', error)
    }
  }

  /**
   * Record response time
   * @param {string} endpoint - API endpoint
   * @param {number} responseTime - Response time in milliseconds
   * @returns {Promise<void>}
   */
  async recordResponseTime(endpoint, responseTime) {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()
    const now = Date.now()

    try {
      const multi = client.multi()
      
      // Add to sorted set for percentile calculations (keep last 1000 entries)
      multi.zAdd(redisClient.key(`response_times:${endpoint}`), {
        score: now,
        value: responseTime.toString()
      })
      multi.zRemRangeByRank(redisClient.key(`response_times:${endpoint}`), 0, -1001)
      
      // Update running averages
      const avgKey = redisClient.key(`avg_response:${endpoint}`)
      const countKey = redisClient.key(`response_count:${endpoint}`)
      
      multi.incrBy(countKey, 1)
      multi.incrByFloat(avgKey, responseTime)
      
      await multi.exec()
    } catch (error) {
      console.error('Error recording response time:', error)
    }
  }

  /**
   * Increment error counter
   * @param {string} endpoint - API endpoint
   * @param {number} statusCode - HTTP status code
   * @returns {Promise<void>}
   */
  async incrementErrors(endpoint, statusCode) {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()

    try {
      const multi = client.multi()
      
      // Total errors
      multi.incrBy(redisClient.key('errors:total'), 1)
      
      // Per-endpoint errors
      multi.incrBy(redisClient.key(`errors:endpoint:${endpoint}`), 1)
      
      // Per-status code
      multi.incrBy(redisClient.key(`errors:status:${statusCode}`), 1)
      
      await multi.exec()
    } catch (error) {
      console.error('Error incrementing error metrics:', error)
    }
  }

  /**
   * Get aggregated metrics
   * @returns {Promise<Object>} Metrics object
   */
  async getMetrics() {
    if (!redisClient.isReady()) {
      return { error: 'Redis not available' }
    }

    const client = redisClient.getClient()

    try {
      // Get basic counters
      const totalRequests = await client.get(redisClient.key('requests:total')) || 0
      const totalErrors = await client.get(redisClient.key('errors:total')) || 0
      
      // Get per-endpoint metrics
      const endpointKeys = await client.keys(redisClient.key('requests:endpoint:*'))
      const endpoints = {}
      
      for (const key of endpointKeys) {
        const endpoint = key.replace(redisClient.key('requests:endpoint:'), '')
        const requests = await client.get(key) || 0
        const errors = await client.get(redisClient.key(`errors:endpoint:${endpoint}`)) || 0
        
        endpoints[endpoint] = {
          requests: parseInt(requests),
          errors: parseInt(errors),
          errorRate: requests > 0 ? ((errors / requests) * 100).toFixed(2) : '0.00'
        }
      }

      // Get instance metrics
      const instanceKeys = await client.keys(redisClient.key('requests:instance:*'))
      const instances = {}
      
      for (const key of instanceKeys) {
        const instanceId = key.replace(redisClient.key('requests:instance:'), '')
        const requests = await client.get(key) || 0
        instances[instanceId] = parseInt(requests)
      }

      // Get hourly metrics for last 24 hours
      const hourlyMetrics = []
      const now = Date.now()
      
      for (let i = 23; i >= 0; i--) {
        const hour = Math.floor((now - (i * 3600000)) / 3600000) * 3600000
        const requests = await client.get(redisClient.key(`requests:hourly:${hour}`)) || 0
        hourlyMetrics.push({
          hour: new Date(hour).toISOString(),
          requests: parseInt(requests)
        })
      }

      return {
        total: {
          requests: parseInt(totalRequests),
          errors: parseInt(totalErrors),
          errorRate: totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : '0.00'
        },
        endpoints,
        instances,
        hourly: hourlyMetrics,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error getting metrics:', error)
      return { error: error.message }
    }
  }

  /**
   * Get response time statistics for an endpoint
   * @param {string} endpoint - API endpoint
   * @returns {Promise<Object>} Response time stats
   */
  async getResponseTimeStats(endpoint) {
    if (!redisClient.isReady()) return null

    const client = redisClient.getClient()

    try {
      const responseTimes = await client.zRange(
        redisClient.key(`response_times:${endpoint}`),
        0, -1,
        { BY: 'SCORE', REV: false }
      )

      if (responseTimes.length === 0) return null

      const times = responseTimes.map(t => parseFloat(t))
      times.sort((a, b) => a - b)

      const count = times.length
      const sum = times.reduce((a, b) => a + b, 0)
      const avg = sum / count

      return {
        count,
        avg: parseFloat(avg.toFixed(2)),
        min: times[0],
        max: times[count - 1],
        p50: times[Math.floor(count * 0.5)],
        p95: times[Math.floor(count * 0.95)],
        p99: times[Math.floor(count * 0.99)]
      }
    } catch (error) {
      console.error('Error getting response time stats:', error)
      return null
    }
  }

  /**
   * Reset all metrics
   * @returns {Promise<void>}
   */
  async resetMetrics() {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()

    try {
      const keys = await client.keys(redisClient.key('*'))
      if (keys.length > 0) {
        await client.del(keys)
      }
    } catch (error) {
      console.error('Error resetting metrics:', error)
    }
  }
}

export default new MetricsService()