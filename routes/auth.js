/**
 * @file auth.js
 * @description Authentication routes for user login and logout
 * @author Michael Lee
 * @created 2024-03-19
 * @modified 2024-03-19
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
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const jwt = require('jsonwebtoken');

/**
 * @description Anonymous login endpoint
 * @async
 * @function login
 * @route POST /api/auth/login
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
router.post('/login', async (req, res) => {
  try {
    const { device_id } = req.body;

    if (!device_id) {
      return res.status(400).json({
        status: 'error',
        message: 'Device ID is required'
      });
    }

    // Check if user exists
    const [existingUsers] = await pool.execute(
      'SELECT * FROM users WHERE device_id = ? AND status = 0',
      [device_id]
    );

    let userId;
    let userUuid;

    if (existingUsers.length === 0) {
      // Create new user
      userUuid = uuidv4();
      const [result] = await pool.execute(
        'INSERT INTO users (uuid, device_id) VALUES (?, ?)',
        [userUuid, device_id]
      );
      userId = result.insertId;
    } else {
      userId = existingUsers[0].id;
      userUuid = existingUsers[0].uuid;
    }

    // Log the login activity
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 0, "login")',
      [userId]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId, userUuid, device_id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    res.json({
      status: 'success',
      data: {
        token,
        user: {
          id: userId,
          uuid: userUuid,
          device_id
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
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