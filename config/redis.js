/**
 * @file config/redis.js
 * @description Redis connection and client management
 * @author Michael Lee
 * @created 2025-06-27
 */

import { createClient } from 'redis'
import config from './index.js'

class RedisClient {
  constructor() {
    this.client = null
    this.isConnected = false
  }

  /**
   * Initialize Redis connection
   * @returns {Promise<void>}
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
   * Get Redis client instance
   * @returns {Object} Redis client
   */
  getClient() {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected')
    }
    return this.client
  }

  /**
   * Check if Redis is connected
   * @returns {boolean}
   */
  isReady() {
    return this.isConnected && this.client?.isReady
  }

  /**
   * Gracefully disconnect from Redis
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.client) {
      await this.client.disconnect()
      this.isConnected = false
    }
  }

  /**
   * Generate prefixed key
   * @param {string} key - Key name
   * @returns {string} Prefixed key
   */
  key(key) {
    return `${config.redis.keyPrefix}${key}`
  }
}

export default new RedisClient()