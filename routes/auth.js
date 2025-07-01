/**
 * @file routes/auth.js
 * @description Redis-based authentication routes for APP user login and logout
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-07-01
 * 
 * This file handles user authentication routes including anonymous login
 * and logout functionality using Redis sessions.
 * 
 * Modification Log:
 * - 2025-06-17: Initial implementation with Redis sessions
 * - 2025-07-01: Complete rewrite to use Redis sessions
 * - 2025-07-01: Added Redis session creation and management
 * 
 * Functions:
 * - POST /api/auth/anonymous: Anonymous login with Redis session creation
 * - POST /api/auth/logout: User logout with Redis session deletion
 * 
 * Dependencies:
 * - express: Web framework
 * - mysql2: Database operations
 * - config/redis.js: Redis client for session management
 * 
 * Redis Schema:
 * - ha:user:{user_id}: HASH containing session and user data
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const redisClient = require('../config/redis.js');
const { authenticateUser } = require('../middleware/auth');

/**
 * @description Anonymous login endpoint
 * @async
 * @function anonymous
 * @route POST /api/auth/anonymous
 * 
 * @param {Object} req.body
 * @param {string} req.body.device_id - Device identifier
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - User data with session info
 * 
 * @throws {400} If device_id is missing
 * @throws {500} If server error occurs
 */
router.post('/anonymous', async (req, res) => {
  try {
    const { device_id } = req.body;

    if (!device_id) {
      return res.status(400).json({
        status: 'error',
        message: 'parameter not found'
      });
    }

    // Check if user exists
    const [existingUsers] = await pool.execute(
      'SELECT * FROM users WHERE device_id = ? AND status = 0',
      [device_id]
    );

    let userId;

    if (existingUsers.length === 0) {
      // Begin transaction for user creation and logging
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // Create new user
        const [result] = await connection.execute(
          'INSERT INTO users (device_id) VALUES (?)',
          [device_id]
        );
        userId = result.insertId;

        // Log the login activity
        await connection.execute(
          'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 0, "anonymous_login")',
          [userId]
        );

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } else {
      userId = existingUsers[0].id;

      // Log the login activity for existing user
      await pool.execute(
        'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 0, "anonymous_login")',
        [userId]
      );
    }

    // Create Redis session
    if (redisClient.isReady()) {
      try {
        const client = redisClient.getClient();
        const userKey = redisClient.key(`user:${userId}`);
        const now = Date.now().toString();
        const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

        // Create session data
        await client.hSet(userKey, {
          device_id,
          login_time: now,
          last_seen: now,
          active: 'true',
          ip_address: clientIP
        });

        // Set TTL to 7 days
        await client.expire(userKey, 604800);
      } catch (redisError) {
        console.error('Redis session creation failed:', redisError);
        // Continue without Redis session - app will still work
      }
    }

    res.json({
      status: 'success',
      data: {
        user: {
          id: userId
        }
      }
    });
  } catch (error) {
    console.error('Anonymous login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description User logout endpoint with Redis session deletion
 * @async
 * @function logout
 * @route POST /api/auth/logout
 * 
 * @param {Object} req.body
 * @param {number} req.body.user_id - User ID (required for session deletion)
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {string} Response.message - Success message
 * 
 * @throws {500} If server error occurs
 * 
 * @sideEffects
 * - Deletes Redis session for the user
 * - Logs logout activity in database
 */
router.post('/logout', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

    // Delete Redis session
    if (redisClient.isReady()) {
      try {
        const client = redisClient.getClient();
        const userKey = redisClient.key(`user:${userId}`);
        await client.del(userKey);
      } catch (redisError) {
        console.error('Redis session deletion failed:', redisError);
        // Continue with logout even if Redis fails
      }
    }

    // Log the logout activity
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 3, "logout")',
      [userId]
    );

    res.json({
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router; 