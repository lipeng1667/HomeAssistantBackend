/**
 * @file services/metrics.js
 * @description Redis-based metrics collection and aggregation service for PM2 cluster coordination
 * @author Michael Lee
 * @created 2025-06-27
 * @modified 2025-06-27
 * 
 * This service provides comprehensive metrics collection and aggregation across
 * multiple PM2 instances using Redis as the central data store. It tracks request
 * counts, response times, error rates, and provides time-series data for analytics.
 * 
 * Modification Log:
 * - 2025-06-27: Initial implementation with Redis-based metrics aggregation
 * - 2025-06-27: Added response time statistics and time-series storage
 * - 2025-06-27: Enhanced documentation and error handling
 * 
 * Functions:
 * - incrementRequests(endpoint, increment): Increment request counters
 * - recordResponseTime(endpoint, responseTime): Record response time metrics
 * - incrementErrors(endpoint, statusCode): Track error occurrences
 * - incrementConnections(): Increment active HTTP connection count
 * - decrementConnections(): Decrement active HTTP connection count
 * - updateMaxConnections(current): Update max connections if higher
 * - incrementAcceptedRequests(increment): Track accepted requests
 * - updateRequestSpeed(speed): Update current request processing speed
 * - updateMaxRequestSpeed(speed): Update maximum speed if higher
 * - getMetrics(): Retrieve aggregated metrics across all instances
 * - getResponseTimeStats(endpoint): Get response time statistics for endpoint
 * - resetMetrics(): Clear all stored metrics
 * 
 * Dependencies:
 * - config/redis.js: Redis client for data persistence
 * 
 * Redis Key Schema:
 * - ha:connections:http:current - Current active HTTP connections (cluster-wide)
 * - ha:connections:http:max_since_startup - Maximum connections since startup
 * - ha:requests:accepted - Total accepted requests across instances
 * - ha:requests:total - Global request counter
 * - ha:requests:speed_per_second - Current request processing speed
 * - ha:requests:max_speed_per_second - Maximum processing speed achieved
 * - ha:requests:endpoint:{method path} - Per-endpoint counters
 * - ha:requests:instance:{instanceId} - Per-instance counters
 * - ha:requests:hourly:{timestamp} - Hourly aggregated metrics
 * - ha:response_times:{endpoint} - Response time sorted sets
 * - ha:errors:total - Global error counter
 */

const redisClient = require('../config/redis.js')

class MetricsService {
  constructor() {
    this.instanceId = process.env.pm_id || `instance-${Date.now()}`
  }

  /**
   * Increment request counter for endpoint across cluster instances
   * @param {string} endpoint - API endpoint identifier (e.g., 'GET /api/users')
   * @param {number} [increment=1] - Increment value for batch operations
   * @returns {Promise<void>} Promise resolving when counters are updated
   * @sideEffects Updates Redis counters: total, per-endpoint, per-instance, hourly
   * @throws Does not throw - logs errors and continues gracefully
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
   * Record response time for performance analytics and percentile calculations
   * @param {string} endpoint - API endpoint identifier (e.g., 'GET /api/users')
   * @param {number} responseTime - Response time in milliseconds (positive number)
   * @returns {Promise<void>} Promise resolving when response time is recorded
   * @sideEffects Updates Redis sorted sets and running averages, maintains 1000 recent entries
   * @throws Does not throw - logs errors and continues gracefully
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
   * Increment error counter for monitoring failure rates
   * @param {string} endpoint - API endpoint identifier (e.g., 'GET /api/users')
   * @param {number} statusCode - HTTP status code (4xx or 5xx for errors)
   * @returns {Promise<void>} Promise resolving when error counters are updated
   * @sideEffects Updates Redis error counters: total, per-endpoint, per-status-code
   * @throws Does not throw - logs errors and continues gracefully
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
   * Get comprehensive aggregated metrics across all PM2 instances
   * @returns {Promise<Object>} Metrics object containing totals, endpoints, instances, hourly data
   * @returns {Promise<Object>} Returns error object if Redis unavailable
   * @sideEffects None - read-only operation
   * @throws Does not throw - returns error object on Redis failures
   * @example
   * {
   *   total: { requests: 1000, errors: 50, errorRate: '5.00' },
   *   endpoints: { 'GET /api/users': { requests: 200, errors: 5 } },
   *   instances: { 'instance-1': 300, 'instance-2': 700 },
   *   hourly: [{ hour: '2025-06-27T10:00:00.000Z', requests: 100 }]
   * }
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

      // Get connection and speed metrics
      const [currentConnections, maxConnections, acceptedRequests, currentSpeed, maxSpeed] = await Promise.all([
        client.get(redisClient.key('connections:http:current')),
        client.get(redisClient.key('connections:http:max_since_startup')),
        client.get(redisClient.key('requests:accepted')),
        client.get(redisClient.key('requests:speed_per_second')),
        client.get(redisClient.key('requests:max_speed_per_second'))
      ])

      return {
        connections: {
          current: parseInt(currentConnections) || 0,
          maxSinceStartup: parseInt(maxConnections) || 0
        },
        total: {
          requests: parseInt(totalRequests),
          accepted: parseInt(acceptedRequests) || 0,
          errors: parseInt(totalErrors),
          errorRate: totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : '0.00'
        },
        speed: {
          current: parseFloat(currentSpeed) || 0,
          maxSinceStartup: parseFloat(maxSpeed) || 0
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
   * Get detailed response time statistics for performance analysis
   * @param {string} endpoint - API endpoint identifier (e.g., 'GET /api/users')
   * @returns {Promise<Object|null>} Response time statistics or null if no data
   * @sideEffects None - read-only operation
   * @throws Does not throw - returns null on errors
   * @example
   * {
   *   count: 1000,
   *   avg: 150.5,
   *   min: 50,
   *   max: 500,
   *   p50: 140,
   *   p95: 300,
   *   p99: 450
   * }
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
   * Increment active HTTP connection count (cluster-wide)
   * @returns {Promise<void>} Promise resolving when connection count is updated
   * @sideEffects Increments ha:connections:http:current across all instances
   * @throws Does not throw - logs errors and continues gracefully
   */
  async incrementConnections() {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()

    try {
      const newCount = await client.incr(redisClient.key('connections:http:current'))
      
      // Update max connections if this is higher
      const maxKey = redisClient.key('connections:http:max_since_startup')
      const currentMax = await client.get(maxKey) || 0
      
      if (newCount > parseInt(currentMax)) {
        await client.set(maxKey, newCount)
      }
    } catch (error) {
      console.error('Error incrementing connection count:', error)
    }
  }

  /**
   * Decrement active HTTP connection count (cluster-wide)
   * @returns {Promise<void>} Promise resolving when connection count is updated
   * @sideEffects Decrements ha:connections:http:current, ensures non-negative
   * @throws Does not throw - logs errors and continues gracefully
   */
  async decrementConnections() {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()

    try {
      const currentCount = await client.get(redisClient.key('connections:http:current')) || 0
      
      if (parseInt(currentCount) > 0) {
        await client.decr(redisClient.key('connections:http:current'))
      }
    } catch (error) {
      console.error('Error decrementing connection count:', error)
    }
  }

  /**
   * Increment accepted requests count (cluster-wide)
   * @param {number} [increment=1] - Number of accepted requests to add
   * @returns {Promise<void>} Promise resolving when accepted count is updated
   * @sideEffects Increments ha:requests:accepted across all instances
   * @throws Does not throw - logs errors and continues gracefully
   */
  async incrementAcceptedRequests(increment = 1) {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()

    try {
      await client.incrBy(redisClient.key('requests:accepted'), increment)
    } catch (error) {
      console.error('Error incrementing accepted requests:', error)
    }
  }

  /**
   * Update current request processing speed (cluster-wide)
   * @param {number} speed - Current requests per second
   * @returns {Promise<void>} Promise resolving when speed is updated
   * @sideEffects Updates ha:requests:speed_per_second and max speed if higher
   * @throws Does not throw - logs errors and continues gracefully
   */
  async updateRequestSpeed(speed) {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()

    try {
      const multi = client.multi()
      
      // Update current speed
      multi.set(redisClient.key('requests:speed_per_second'), speed)
      
      // Update max speed if this is higher
      const maxKey = redisClient.key('requests:max_speed_per_second')
      const currentMax = await client.get(maxKey) || 0
      
      if (speed > parseFloat(currentMax)) {
        multi.set(maxKey, speed)
      }
      
      await multi.exec()
    } catch (error) {
      console.error('Error updating request speed:', error)
    }
  }

  /**
   * Reset all metrics by clearing Redis data - USE WITH CAUTION
   * @returns {Promise<void>} Promise resolving when all metrics are cleared
   * @sideEffects Deletes ALL application metrics from Redis permanently
   * @throws Does not throw - logs errors and continues
   * @warning This operation is irreversible and affects all PM2 instances
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

module.exports = new MetricsService()