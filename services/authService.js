/**
 * @file services/authService.js
 * @description Authentication service layer for user management and session handling
 * @author Michael Lee
 * @created 2025-07-02
 * @modified 2025-07-02
 * 
 * This service provides authentication business logic including user creation,
 * session management, and activity logging separated from HTTP concerns.
 * 
 * Modification Log:
 * - 2025-07-02: Initial implementation extracted from routes/auth.js
 * 
 * Functions:
 * - findUserByDeviceId(deviceId): Find user by device identifier
 * - createUserWithLog(deviceId): Create new user with activity log
 * - logUserActivity(userId, actionType, action): Log user activity
 * - createUserSession(userId, deviceId, clientIP): Create Redis session
 * - deleteUserSession(userId): Delete Redis session
 * - anonymousLogin(deviceId, clientIP): Handle anonymous login flow
 * - userLogout(userId): Handle user logout flow
 * 
 * Dependencies:
 * - config/database.js: MySQL connection pool
 * - config/redis.js: Redis client for session management
 */

const pool = require('../config/database');
const redisClient = require('../config/redis.js');

class AuthService {
  /**
   * Find user by device identifier
   * @async
   * @function findUserByDeviceId
   * @param {string} deviceId - Device identifier to search for
   * @returns {Promise<Object|null>} User object or null if not found
   * @throws {Error} Database connection or query errors
   * @sideEffects None - read-only database operation
   */
  async findUserByDeviceId(deviceId) {
    const [existingUsers] = await pool.execute(
      'SELECT * FROM users WHERE device_id = ? AND status = 0',
      [deviceId]
    );
    
    return existingUsers.length > 0 ? existingUsers[0] : null;
  }

  /**
   * Create new user with transaction and activity logging
   * @async
   * @function createUserWithLog
   * @param {string} deviceId - Device identifier for new user
   * @returns {Promise<number>} New user ID
   * @throws {Error} Database transaction or insertion errors
   * @sideEffects Creates user record and logs activity in database
   */
  async createUserWithLog(deviceId) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Create new user
      const [result] = await connection.execute(
        'INSERT INTO users (device_id) VALUES (?)',
        [deviceId]
      );
      const userId = result.insertId;

      // Log the login activity
      await connection.execute(
        'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 0, "anonymous_login")',
        [userId]
      );

      await connection.commit();
      return userId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Log user activity in database
   * @async
   * @function logUserActivity
   * @param {number} userId - User ID to log activity for
   * @param {number} actionType - Action type code (0=login, 3=logout, etc.)
   * @param {string} action - Action description string
   * @returns {Promise<void>} Promise resolving when log is created
   * @throws {Error} Database insertion errors
   * @sideEffects Inserts activity log record in database
   */
  async logUserActivity(userId, actionType, action) {
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, ?, ?)',
      [userId, actionType, action]
    );
  }

  /**
   * Create Redis session for user
   * @async
   * @function createUserSession
   * @param {number} userId - User ID for session
   * @param {string} deviceId - Device identifier
   * @param {string} clientIP - Client IP address
   * @returns {Promise<boolean>} True if session created successfully
   * @throws Does not throw - logs errors and returns false
   * @sideEffects Creates Redis hash with 7-day TTL
   */
  async createUserSession(userId, deviceId, clientIP) {
    if (!redisClient.isReady()) {
      console.warn('Redis not available for session creation');
      return false;
    }

    try {
      const client = redisClient.getClient();
      const userKey = redisClient.key(`user:${userId}`);
      const now = Date.now().toString();

      // Create session data
      await client.hSet(userKey, {
        device_id: deviceId,
        login_time: now,
        last_seen: now,
        active: 'true',
        ip_address: clientIP || 'unknown'
      });

      // Set TTL to 7 days
      await client.expire(userKey, 604800);
      return true;
    } catch (redisError) {
      console.error('Redis session creation failed:', redisError);
      return false;
    }
  }

  /**
   * Delete Redis session for user
   * @async
   * @function deleteUserSession
   * @param {number} userId - User ID to delete session for
   * @returns {Promise<boolean>} True if session deleted successfully
   * @throws Does not throw - logs errors and returns false
   * @sideEffects Removes Redis session data
   */
  async deleteUserSession(userId) {
    if (!redisClient.isReady()) {
      console.warn('Redis not available for session deletion');
      return false;
    }

    try {
      const client = redisClient.getClient();
      const userKey = redisClient.key(`user:${userId}`);
      await client.del(userKey);
      return true;
    } catch (redisError) {
      console.error('Redis session deletion failed:', redisError);
      return false;
    }
  }

  /**
   * Handle complete anonymous login flow
   * @async
   * @function anonymousLogin
   * @param {string} deviceId - Device identifier from client
   * @param {string} clientIP - Client IP address for session
   * @returns {Promise<Object>} Login result with user data
   * @throws {Error} Database or business logic errors
   * @sideEffects Creates user if needed, logs activity, creates Redis session
   * @example
   * const result = await authService.anonymousLogin('iPhone_ABC123', '192.168.1.100')
   * // Returns: { userId: 123, isNewUser: true, sessionCreated: true }
   */
  async anonymousLogin(deviceId, clientIP) {
    // Check if user exists
    const existingUser = await this.findUserByDeviceId(deviceId);
    
    let userId;
    let isNewUser = false;

    if (!existingUser) {
      // Create new user with activity log
      userId = await this.createUserWithLog(deviceId);
      isNewUser = true;
    } else {
      userId = existingUser.id;
      
      // Log login activity for existing user
      await this.logUserActivity(userId, 0, 'anonymous_login');
    }

    // Create Redis session
    const sessionCreated = await this.createUserSession(userId, deviceId, clientIP);

    return {
      userId,
      isNewUser,
      sessionCreated
    };
  }

  /**
   * Handle complete user logout flow
   * @async
   * @function userLogout
   * @param {number} userId - User ID to logout
   * @returns {Promise<Object>} Logout result
   * @throws {Error} Database or business logic errors
   * @sideEffects Deletes Redis session, logs logout activity
   * @example
   * const result = await authService.userLogout(123)
   * // Returns: { sessionDeleted: true, activityLogged: true }
   */
  async userLogout(userId) {
    // Delete Redis session
    const sessionDeleted = await this.deleteUserSession(userId);

    // Log logout activity
    await this.logUserActivity(userId, 3, 'logout');

    return {
      sessionDeleted,
      activityLogged: true
    };
  }
}

module.exports = new AuthService();