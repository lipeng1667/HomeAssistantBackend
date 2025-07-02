/**
 * @file resetMetrics.js
 * @description Reset realtime statistics on program start/restart
 * @author Michael Lee
 * @created 2025-07-02
 * @modified 2025-07-02
 * 
 * This script resets only realtime webservice statistics (preserves user sessions)
 * on program start/restart. This ensures clean metrics while maintaining user state.
 * 
 * Modification Log:
 * - 2025-07-02: Initial implementation for program startup workflow
 * 
 * Functions:
 * - main(): Reset realtime stats and exit
 * 
 * Dependencies:
 * - Redis client for direct access without full config validation
 */

require('dotenv').config()
const { createClient } = require('redis')

// Minimal Redis config without full validation
const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || null,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'ha:'
}

/**
 * Reset only realtime statistics and exit
 * @async
 * @function main
 * @returns {Promise<void>} Promise resolving when stats are reset
 * @sideEffects Clears only realtime metrics, preserves user sessions
 * @throws Process exits with code 1 on errors
 */
async function main() {
  let client = null
  
  try {
    console.log('Resetting realtime statistics...')
    
    // Create Redis client with minimal config
    client = createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port
      },
      password: redisConfig.password,
      database: redisConfig.db
    })
    
    await client.connect()
    
    // Define patterns for realtime stats to clear
    const statsPatterns = [
      'connections:*',
      'requests:*', 
      'errors:*'
    ]

    const keysToDelete = []
    
    for (const pattern of statsPatterns) {
      const keys = await client.keys(`${redisConfig.keyPrefix}${pattern}`)
      keysToDelete.push(...keys)
    }
    
    if (keysToDelete.length > 0) {
      await client.del(keysToDelete)
      console.log(`✅ Reset ${keysToDelete.length} realtime stats keys`)
    } else {
      console.log('✅ No realtime stats to reset')
    }
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Error resetting stats:', error.message)
    process.exit(1)
  } finally {
    if (client && client.isOpen) {
      await client.disconnect()
    }
  }
}

main()