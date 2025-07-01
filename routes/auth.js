/**
 * @file auth.js
 * @description Authentication routes for user login and logout
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-06-17
 * 
 * This file handles user authentication routes including anonymous login
 * and logout functionality. It manages user sessions and activity logging.
 * 
 * Dependencies:
 * - express: Web framework
 * - uuid: UUID generation
 * - jsonwebtoken: JWT token handling
 * - mysql2: Database operations
 * 
 * Environment Variables:
 * - JWT_SECRET: Secret key for JWT tokens
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');

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
 * @returns {Object} Response.data - User data and token
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

    res.json({
      status: 'success',
      data: {
        user: {
          id: userId,
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
 * @description User logout endpoint
 * @async
 * @function logout
 * @route POST /api/auth/logout
 * 
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {string} Response.message - Success message
 * 
 * @throws {500} If server error occurs
 */
router.post('/logout', async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

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