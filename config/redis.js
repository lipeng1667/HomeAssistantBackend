/**
 * @file config/redis.js
 * @description Redis connection and client management for distributed metrics and caching
 * @author Michael Lee
 * @created 2025-06-27
 * @modified 2025-06-27
 * 
 * This module provides a centralized Redis client with connection pooling,
 * automatic reconnection strategies, and error handling for the Home Assistant
 * backend. It supports distributed metrics collection across PM2 cluster instances.
 * 
 * Modification Log:
 * - 2025-06-27: Initial implementation with connection management and key prefixing
 * - 2025-06-27: Added comprehensive documentation and error handling
 * 
 * Functions:
 * - connect(): Establishes Redis connection with retry logic
 * - getClient(): Returns active Redis client instance
 * - isReady(): Checks Redis connection status
 * - disconnect(): Gracefully closes Redis connection
 * - key(string): Generates prefixed Redis keys
 * 
 * Dependencies:
 * - redis: Node.js Redis client library
 * - config/index.js: Application configuration
 */

const { createClient } = require('redis')
const config = require('./index.js')

class RedisClient {
  constructor() {
    this.client = null
    this.isConnected = false
  }

  /**
   * Initialize Redis connection with automatic reconnection strategy
   * @returns {Promise<Object>} Promise resolving to Redis client instance
   * @throws {Error} When Redis connection fails after retry attempts
   * @sideEffects Establishes persistent Redis connection, sets up event listeners
   */
  async connect() {
    try {
      const clientOptions = {
        socket: {
          host: config.redis.host,
          port: config.redis.port,
          reconnectStrategy: (retries) => {
            if (retries > 10) return new Error('Max reconnect attempts reached')
            return Math.min(retries * 50, 2000)
          }
        },
        database: config.redis.db,
        ...(config.redis.password && { password: config.redis.password })
      }

      this.client = createClient(clientOptions)

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err)
        this.isConnected = false
      })

      this.client.on('connect', () => {
        console.log('Redis Client Connected')
        this.isConnected = true
      })

      this.client.on('disconnect', () => {
        console.log('Redis Client Disconnected')
        this.isConnected = false
      })

      await this.client.connect()
      return this.client
    } catch (error) {
      console.error('Failed to connect to Redis:', error)
      throw error
    }
  }

  /**
   * Get active Redis client instance
   * @returns {Object} Redis client instance for database operations
   * @throws {Error} When Redis client is not connected or unavailable
   * @sideEffects None - read-only operation
   */
  getClient() {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected')
    }
    return this.client
  }

  /**
   * Check if Redis connection is ready for operations
   * @returns {boolean} True if Redis is connected and ready, false otherwise
   * @sideEffects None - read-only status check
   */
  isReady() {
    return this.isConnected && this.client?.isReady
  }

  /**
   * Gracefully disconnect from Redis server
   * @returns {Promise<void>} Promise resolving when disconnection is complete
   * @sideEffects Closes Redis connection, cleans up event listeners
   */
  async disconnect() {
    if (this.client) {
      await this.client.disconnect()
      this.isConnected = false
    }
  }

  /**
   * Generate prefixed Redis key for namespace isolation
   * @param {string} key - Base key name to be prefixed
   * @returns {string} Redis key with application prefix applied
   * @sideEffects None - pure function for key generation
   * @example key('users:123') => 'ha:users:123'
   */
  key(key) {
    return `${config.redis.keyPrefix}${key}`
  }
}

module.exports = new RedisClient()