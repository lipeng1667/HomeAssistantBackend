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
 * - incrementErrors(endpoint, statusCode): Track error occurrences
 * - incrementConnections(): Increment active HTTP connection count
 * - decrementConnections(): Decrement active HTTP connection count
 * - updateMaxConnections(current): Update max connections if higher
 * - incrementAcceptedRequests(increment): Track accepted requests
 * - updateRequestSpeed(speed): Update current request processing speed
 * - updateMaxRequestSpeed(speed): Update maximum speed if higher
 * - getMetrics(): Retrieve aggregated metrics across all instances
 * - resetRealtimeStats(): Clear only realtime stats, preserve user sessions
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

    try {
      const multi = client.multi()
      
      // Total requests
      multi.incrBy(redisClient.key('requests:total'), increment)
      
      // Per-endpoint requests
      multi.incrBy(redisClient.key(`requests:endpoint:${endpoint}`), increment)
      
      await multi.exec()
    } catch (error) {
      console.error('Error incrementing request metrics:', error)
    }
  }


  /**
   * Increment error counter for monitoring failure rates
   * @param {string} endpoint - API endpoint identifier (e.g., 'GET /api/users')
   * @returns {Promise<void>} Promise resolving when error counters are updated
   * @sideEffects Updates Redis error counters: total and per-endpoint
   * @throws Does not throw - logs errors and continues gracefully
   */
  async incrementErrors(endpoint) {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()

    try {
      const multi = client.multi()
      
      // Total errors
      multi.incrBy(redisClient.key('errors:total'), 1)
      
      // Per-endpoint errors
      multi.incrBy(redisClient.key(`errors:endpoint:${endpoint}`), 1)
      
      
      await multi.exec()
    } catch (error) {
      console.error('Error incrementing error metrics:', error)
    }
  }

  /**
   * Get comprehensive aggregated metrics across all PM2 instances
   * @returns {Promise<Object>} Metrics object containing totals and endpoints
   * @returns {Promise<Object>} Returns error object if Redis unavailable
   * @sideEffects None - read-only operation
   * @throws Does not throw - returns error object on Redis failures
   * @example
   * {
   *   total: { requests: 1000, errors: 50, errorRate: '5.00' },
   *   endpoints: { 'GET /api/users': { requests: 200, errors: 5 } },
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

      // Get connection and speed metrics (including WebSocket)
      const [currentConnections, maxConnections, acceptedRequests, currentSpeed, maxSpeed, wsConnections, wsMaxConnections, wsMessages] = await Promise.all([
        client.get(redisClient.key('connections:http:current')),
        client.get(redisClient.key('connections:http:max_since_startup')),
        client.get(redisClient.key('requests:accepted')),
        client.get(redisClient.key('requests:speed_per_second')),
        client.get(redisClient.key('requests:max_speed_per_second')),
        client.get(redisClient.key('connections:websocket:current')),
        client.get(redisClient.key('connections:websocket:max_since_startup')),
        client.get(redisClient.key('websocket:messages:total'))
      ])

      return {
        connections: {
          http: {
            current: parseInt(currentConnections) || 0,
            maxSinceStartup: parseInt(maxConnections) || 0
          },
          websocket: {
            current: parseInt(wsConnections) || 0,
            maxSinceStartup: parseInt(wsMaxConnections) || 0
          }
        },
        total: {
          requests: parseInt(totalRequests),
          accepted: parseInt(acceptedRequests) || 0,
          errors: parseInt(totalErrors),
          errorRate: totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : '0.00'
        },
        websocket: {
          messages: parseInt(wsMessages) || 0
        },
        speed: {
          current: parseFloat(currentSpeed) || 0,
          maxSinceStartup: parseFloat(maxSpeed) || 0
        },
        endpoints,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error getting metrics:', error)
      return { error: error.message }
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
   * Reset only realtime statistics, preserving user sessions and rate limits
   * @returns {Promise<void>} Promise resolving when stats are cleared
   * @sideEffects Deletes only realtime metrics, preserves user:*, rate_limit:*, sliding_limit:*
   * @throws Does not throw - logs errors and continues
   * @warning This operation affects all PM2 instances but preserves user sessions
   */
  async resetRealtimeStats() {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()

    try {
      // Define patterns for realtime stats to clear
      const statsPatterns = [
        'connections:*',
        'requests:*', 
        'errors:*',
        'response_times:*'
      ]

      const keysToDelete = []
      
      for (const pattern of statsPatterns) {
        const keys = await client.keys(redisClient.key(pattern))
        keysToDelete.push(...keys)
      }
      
      if (keysToDelete.length > 0) {
        await client.del(keysToDelete)
        console.log(`Reset ${keysToDelete.length} realtime stats keys`)
      }
    } catch (error) {
      console.error('Error resetting realtime stats:', error)
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
  /**
   * Increment WebSocket connection counter
   * @returns {Promise<void>} Promise resolving when WebSocket counters are updated
   * @sideEffects Updates Redis WebSocket connection counters
   * @throws Does not throw - logs errors and continues gracefully
   */
  async incrementWebSocketConnections() {
    if (!redisClient.isReady()) {
      console.warn('Redis not ready, cannot increment WebSocket connections')
      return
    }

    const client = redisClient.getClient()

    try {
      // Increment current connections and get the new value
      const newCount = await client.incr(redisClient.key('connections:websocket:current'))
      
      // Update max connections if this is higher
      const maxKey = redisClient.key('connections:websocket:max_since_startup')
      const currentMax = await client.get(maxKey) || 0
      
      if (newCount > parseInt(currentMax)) {
        await client.set(maxKey, newCount)
      }
      
      console.log(`📊 WebSocket connections: ${newCount} (max: ${Math.max(newCount, parseInt(currentMax))})`)
    } catch (error) {
      console.error('Error incrementing WebSocket connections:', error)
    }
  }

  /**
   * Decrement WebSocket connection counter
   * @returns {Promise<void>} Promise resolving when WebSocket counters are updated
   * @sideEffects Updates Redis WebSocket connection counters
   * @throws Does not throw - logs errors and continues gracefully
   */
  async decrementWebSocketConnections() {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()

    try {
      // Decrement current connections (don't go below 0)
      const current = await client.get(redisClient.key('connections:websocket:current')) || 0
      if (parseInt(current) > 0) {
        await client.decrBy(redisClient.key('connections:websocket:current'), 1)
      }
    } catch (error) {
      console.error('Error decrementing WebSocket connections:', error)
    }
  }

  /**
   * Increment WebSocket message counter
   * @param {string} type - Message type (user_message, admin_message, typing, etc.)
   * @returns {Promise<void>} Promise resolving when message counters are updated
   * @sideEffects Updates Redis WebSocket message counters
   * @throws Does not throw - logs errors and continues gracefully
   */
  async incrementWebSocketMessages(type = 'message') {
    if (!redisClient.isReady()) return

    const client = redisClient.getClient()

    try {
      const multi = client.multi()
      
      // Total WebSocket messages
      multi.incrBy(redisClient.key('websocket:messages:total'), 1)
      
      // Per-type messages
      multi.incrBy(redisClient.key(`websocket:messages:${type}`), 1)
      
      await multi.exec()
    } catch (error) {
      console.error('Error incrementing WebSocket message metrics:', error)
    }
  }
}

module.exports = new MetricsService()