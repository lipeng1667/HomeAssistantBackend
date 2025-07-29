/**
 * @file services/authService.js
 * @description Authentication service layer for anonymous user management and session handling
 * @author Michael Lee
 * @created 2025-07-02
 * @modified 2025-07-05
 * 
 * This service provides authentication business logic including anonymous user creation,
 * secure session management, and activity logging separated from HTTP concerns.
 * 
 * Modification Log:
 * - 2025-07-02: Initial implementation extracted from routes/auth.js
 * - 2025-07-03: Enhanced session security with status and device_id validation
 * - 2025-07-03: Renamed createUserSession to createAnonymousUserSession
 * - 2025-07-03: Added comprehensive validation to deleteUserSession
 * - 2025-07-05: Added password hashing utilities and user registration/login
 * - 2025-07-05: Added updateSessionStatus for Redis status management
 * 
 * Functions:
 * - findUserByDeviceId(deviceId): Find user by device identifier
 * - createUserWithLog(deviceId): Create new user with activity log
 * - logUserActivity(userId, actionType, action): Log user activity
 * - createAnonymousUserSession(userId, deviceId, clientIP): Create Redis session for anonymous users
 * - deleteUserSession(userId, deviceId): Delete Redis session with validation
 * - anonymousLogin(deviceId, clientIP): Handle anonymous login flow
 * - userLogout(userId, deviceId): Handle user logout flow with validation
 * - hashPassword(plainPassword): Hash plain password with SHA-256
 * - verifyPassword(storedHash, timestamp, receivedPassword): Verify timestamped password
 * - isValidSHA256(hash): Validate SHA-256 hash format
 * - registerUser(deviceId, accountName, phoneNumber, hashedPassword, existingUserId): Register new user
 * - userLogin(phoneNumber, password, timestamp, clientIP): User login with timestamped password
 * - updateSessionStatus(userId, status): Update Redis session status
 * - createUserSession(userId, deviceId, clientIP): Create Redis session for registered users
 * 
 * Security Features:
 * - Anonymous user status tracking in Redis sessions
 * - Device ID validation for session operations
 * - Secure session deletion with multiple validation checks
 * - Activity logging for audit trails
 * 
 * Dependencies:
 * - config/database.js: MySQL connection pool
 * - config/redis.js: Redis client for session management
 */

const pool = require('../config/database');
const redisClient = require('../config/redis.js');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

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
      'SELECT * FROM users WHERE device_id = ? AND status >= 0',
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
   * Create Redis session for anonymous user 
   * @async
   * @function createAnonymousUserSession
   * @param {number} userId - User ID for session
   * @param {string} deviceId - Device identifier
   * @param {string} clientIP - Client IP address
   * @returns {Promise<Object>} Session creation result with token
   * @throws Does not throw - logs errors and returns false
   * @sideEffects Creates Redis hash with 7-day TTL
   */
  async createAnonymousUserSession(userId, deviceId, clientIP) {
    if (!redisClient.isReady()) {
      console.warn('Redis not available for session creation');
      return { success: false, sessionToken: null };
    }

    try {
      const client = redisClient.getClient();
      const userKey = redisClient.key(`user:${userId}`);
      const now = Date.now().toString();
      const sessionToken = uuidv4();

      // Create enhanced session data
      await client.hSet(userKey, {
        device_id: deviceId,
        login_time: now,
        last_seen: now,
        status: 'anonymous',
        user_status: '0', // Default normal user
        username: '', // Empty for anonymous
        session_token: sessionToken,
        ip_address: clientIP || 'unknown'
      });

      // Set TTL to 7 days
      await client.expire(userKey, 604800);
      return { success: true, sessionToken };
    } catch (redisError) {
      console.error('Redis session creation failed:', redisError);
      return { success: false, sessionToken: null };
    }
  }

  /**
   * Delete Redis session for user
   * @async
   * @function deleteUserSession
   * @param {number} userId - User ID to delete session fo
   * @param {string} deviceId - device ID to logoutr
   * @returns {Promise<boolean>} True if session deleted successfully
   * @throws Does not throw - logs errors and returns false
   * @sideEffects Removes Redis session data
   */
  async deleteUserSession(userId, deviceId) {
    if (!redisClient.isReady()) {
      console.warn('Redis not available for session deletion');
      return false;
    }

    try {
      const client = redisClient.getClient();
      const userKey = redisClient.key(`user:${userId}`);

      // Get current session data to validate
      const sessionData = await client.hGetAll(userKey);

      // Check if session exists
      if (!sessionData.device_id) {
        console.warn(`Session not found for user ${userId}`);
        return false;
      }

      // Validate status is 'anonymous'
      if (sessionData.status !== 'anonymous') {
        console.warn(`Invalid session status for user ${userId}: ${sessionData.status}`);
        return false;
      }

      // Validate device_id matches
      if (sessionData.device_id !== deviceId) {
        console.warn(`Device ID mismatch for user ${userId}: expected ${sessionData.device_id}, got ${deviceId}`);
        return false;
      }

      // All validations passed, delete the session
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
    const sessionResult = await this.createAnonymousUserSession(userId, deviceId, clientIP);

    return {
      userId,
      isNewUser,
      sessionCreated: sessionResult.success,
      sessionToken: sessionResult.sessionToken
    };
  }

  /**
   * Handle complete user logout flow
   * @async
   * @function userLogout
   * @param {number} userId - User ID to logout
   * @param {string} deviceId - device ID to logout
   * @returns {Promise<Object>} Logout result
   * @throws {Error} Database or business logic errors
   * @sideEffects Deletes Redis session, logs logout activity
   * @example
   * const result = await authService.userLogout(123)
   * // Returns: { sessionDeleted: true, activityLogged: true }
   */
  async userLogout(userId, deviceId) {
    // Delete Redis session
    const sessionDeleted = await this.deleteUserSession(userId, deviceId);

    // Log logout activity
    await this.logUserActivity(userId, 3, 'logout');

    return {
      sessionDeleted,
      activityLogged: true
    };
  }

  /**
   * Hash plain password using SHA-256
   * @function hashPassword
   * @param {string} plainPassword - Plain text password to hash
   * @returns {string} SHA-256 hash (64 hex characters)
   * @throws {Error} If password is empty or invalid
   * @sideEffects None - pure function
   */
  hashPassword(plainPassword) {
    if (!plainPassword || typeof plainPassword !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    return crypto.createHash('sha256').update(plainPassword).digest('hex');
  }

  /**
   * Verify timestamped password for login authentication
   * @function verifyPassword
   * @param {string} storedHash - SHA-256 hash stored in database
   * @param {number} timestamp - Timestamp used in client-side hashing
   * @param {string} receivedPassword - SHA-256(storedHash + timestamp) from client
   * @returns {boolean} True if password verification succeeds
   * @throws {Error} If parameters are invalid
   * @sideEffects None - pure function
   */
  verifyPassword(storedHash, timestamp, receivedPassword) {
    if (!storedHash || !timestamp || !receivedPassword) {
      throw new Error('All parameters are required for password verification');
    }

    if (!this.isValidSHA256(storedHash) || !this.isValidSHA256(receivedPassword)) {
      throw new Error('Invalid SHA-256 hash format');
    }

    // Compute expected hash: SHA-256(storedHash + timestamp)
    const payload = `${storedHash}${timestamp}`;
    const expectedHash = crypto.createHash('sha256').update(payload).digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(receivedPassword, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  }

  /**
   * Validate SHA-256 hash format
   * @function isValidSHA256
   * @param {string} hash - Hash string to validate
   * @returns {boolean} True if hash is valid SHA-256 format
   * @throws Does not throw - returns false for invalid input
   * @sideEffects None - pure function
   */
  isValidSHA256(hash) {
    if (!hash || typeof hash !== 'string') {
      return false;
    }

    // SHA-256 produces 64 hex characters
    const sha256Regex = /^[a-f0-9]{64}$/i;
    return sha256Regex.test(hash);
  }

  /**
   * Register new user with username, phone, and hashed password
   * @async
   * @function registerUser
   * @param {string} deviceId - Device identifier
   * @param {string} accountName - Username for account
   * @param {string} phoneNumber - Phone number
   * @param {string} hashedPassword - SHA-256 hash of password
   * @param {number} existingUserId - Optional existing user ID for upgrade
   * @returns {Promise<Object>} Registration result
   * @throws {Error} Database or validation errors
   * @sideEffects Creates/updates user record, logs activity
   */
  async registerUser(deviceId, accountName, phoneNumber, hashedPassword, existingUserId = null) {
    // Validate hashed password format
    if (!this.isValidSHA256(hashedPassword)) {
      throw new Error('Invalid password hash format');
    }

    // Check if phone number already exists
    const [existingPhone] = await pool.execute(
      'SELECT id FROM users WHERE phone_number = ? AND status >= 0',
      [phoneNumber]
    );

    if (existingPhone.length > 0) {
      throw new Error('Phone number already registered');
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let userId;

      if (existingUserId) {
        // Upgrade existing anonymous user
        const [result] = await connection.execute(
          'UPDATE users SET username = ?, phone_number = ?, password = ?, updated_at = NOW() WHERE id = ? AND device_id = ? AND status >= 0',
          [accountName, phoneNumber, hashedPassword, existingUserId, deviceId]
        );

        if (result.affectedRows === 0) {
          throw new Error('User validation failed - device ID mismatch');
        }

        userId = existingUserId;
      } else {
        // Create new user
        const [result] = await connection.execute(
          'INSERT INTO users (device_id, username, phone_number, password) VALUES (?, ?, ?, ?)',
          [deviceId, accountName, phoneNumber, hashedPassword]
        );
        userId = result.insertId;
      }

      // Log registration activity
      await connection.execute(
        'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 0, "user_registration")',
        [userId]
      );

      await connection.commit();

      // Get user data
      const [userData] = await connection.execute(
        'SELECT username, status FROM users WHERE id = ?',
        [userId]
      );

      await connection.commit();

      // Create new session for registered user (or update existing)
      const sessionResult = await this.createUserSession(
        userId, 
        deviceId, 
        null, // clientIP not available in register context
        userData[0].username,
        userData[0].status
      );

      return {
        userId,
        userName: userData[0].username,
        userStatus: userData[0].status,
        sessionToken: sessionResult.sessionToken,
        isUpgrade: !!existingUserId
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * User login with phone number and timestamped password
   * @async
   * @function userLogin
   * @param {string} phoneNumber - Phone number for login
   * @param {string} password - SHA-256(storedHash + timestamp) from client
   * @param {number} timestamp - Timestamp from request headers
   * @param {string} clientIP - Client IP address
   * @param {number|null} expectedUserId - Optional user ID for validation
   * @returns {Promise<Object>} Login result
   * @throws {Error} Authentication or database errors
   * @sideEffects Logs activity, creates Redis session
   */
  async userLogin(phoneNumber, password, timestamp, clientIP, expectedUserId = null) {
    // Find user by phone number
    const [users] = await pool.execute(
      'SELECT id, device_id, password, username, status FROM users WHERE phone_number = ? AND status >= 0',
      [phoneNumber]
    );

    if (users.length === 0) {
      throw new Error('User not found');
    }

    const user = users[0];

    // Optional user ID validation
    if (expectedUserId !== null && user.id !== expectedUserId) {
      throw new Error('User ID mismatch');
    }

    // Verify password using stored hash and timestamp
    const isValidPassword = this.verifyPassword(user.password, timestamp, password);

    if (!isValidPassword) {
      throw new Error('Invalid password');
    }

    // Create Redis session with user data
    const sessionResult = await this.createUserSession(
      user.id, 
      user.device_id, 
      clientIP,
      user.username,
      user.status
    );

    // Log login activity
    await this.logUserActivity(user.id, 0, 'user_login');

    return {
      userId: user.id,
      userName: user.username,
      userStatus: user.status,
      sessionToken: sessionResult.sessionToken,
      sessionCreated: sessionResult.success
    };
  }

  /**
   * Update Redis session status for user
   * @async
   * @function updateSessionStatus
   * @param {number} userId - User ID to update
   * @param {string} status - New status ('anonymous', 'login', 'blocked')
   * @returns {Promise<boolean>} True if status updated successfully
   * @throws Does not throw - logs errors and returns false
   * @sideEffects Updates status field in Redis session
   */
  async updateSessionStatus(userId, status) {
    if (!redisClient.isReady()) {
      console.warn('Redis not available for session status update');
      return false;
    }

    try {
      const client = redisClient.getClient();
      const userKey = redisClient.key(`user:${userId}`);

      // Update status and last_seen
      await client.hSet(userKey, {
        status: status,
        last_seen: Date.now().toString()
      });

      return true;
    } catch (redisError) {
      console.error('Redis session status update failed:', redisError);
      return false;
    }
  }

  /**
   * Create Redis session for registered user
   * @async
   * @function createUserSession
   * @param {number} userId - User ID for session
   * @param {string} deviceId - Device identifier
   * @param {string} clientIP - Client IP address
   * @param {string} username - Username for session
   * @param {number} userStatus - User status (0=normal, 87=admin)
   * @returns {Promise<Object>} Session creation result with token
   * @throws Does not throw - logs errors and returns false
   * @sideEffects Creates Redis hash with 7-day TTL
   */
  async createUserSession(userId, deviceId, clientIP, username = '', userStatus = 0) {
    if (!redisClient.isReady()) {
      console.warn('Redis not available for session creation');
      return { success: false, sessionToken: null };
    }

    try {
      const client = redisClient.getClient();
      const userKey = redisClient.key(`user:${userId}`);
      const now = Date.now().toString();
      const sessionToken = uuidv4();

      // Create enhanced session data
      await client.hSet(userKey, {
        device_id: deviceId,
        login_time: now,
        last_seen: now,
        status: 'login',
        user_status: userStatus.toString(),
        username: username,
        session_token: sessionToken,
        ip_address: clientIP || 'unknown'
      });

      // Set TTL to 7 days
      await client.expire(userKey, 604800);
      return { success: true, sessionToken };
    } catch (redisError) {
      console.error('Redis session creation failed:', redisError);
      return { success: false, sessionToken: null };
    }
  }
}

module.exports = new AuthService();