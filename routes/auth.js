/**
 * @file routes/auth.js
 * @description HTTP routes for user authentication with service layer delegation
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-07-02
 * 
 * This file provides HTTP endpoint handlers for user authentication, delegating
 * business logic to the authentication service layer. Focuses on request/response
 * handling, validation, and error management.
 * 
 * Modification Log:
 * - 2025-06-17: Initial implementation with Redis sessions
 * - 2025-07-01: Complete rewrite to use Redis sessions
 * - 2025-07-01: Added Redis session creation and management
 * - 2025-07-02: Refactored to use service layer architecture
 * 
 * Functions:
 * - POST /api/auth/anonymous: Anonymous login endpoint handler
 * - POST /api/auth/register: User registration endpoint handler
 * - POST /api/auth/login: User login endpoint handler
 * - POST /api/auth/logout: User logout endpoint handler
 * 
 * Dependencies:
 * - express: Web framework for HTTP routing
 * - services/authService: Authentication business logic layer
 * - middleware/userAuth: User authentication middleware
 * 
 * Architecture:
 * - Thin controller pattern - minimal logic in routes
 * - Service layer delegation for business operations
 * - Clear separation of HTTP concerns from business logic
 */

const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authenticateUser } = require('../middleware/userAuth');

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

    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const result = await authService.anonymousLogin(device_id, clientIP);

    res.json({
      status: 'success',
      data: {
        user: {
          id: result.userId
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
 * @description User registration endpoint
 * @async
 * @function register
 * @route POST /api/auth/register
 * 
 * @param {Object} req.body
 * @param {string} req.body.device_id - Device identifier
 * @param {string} req.body.account_name - Username
 * @param {string} req.body.phone_number - Phone number
 * @param {string} req.body.password - SHA-256 hash of password
 * @param {string} req.body.user_id - Optional existing user ID for upgrade
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - User data
 * 
 * @throws {400} If required parameters are missing or invalid
 * @throws {500} If server error occurs
 */
router.post('/register', async (req, res) => {
  try {
    const { device_id, account_name, phone_number, password, user_id } = req.body;

    // Validate required parameters
    if (!device_id || !account_name || !phone_number || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'parameter invalid'
      });
    }

    // Validate password hash format (64 hex characters)
    if (!/^[a-f0-9]{64}$/i.test(password)) {
      return res.status(400).json({
        status: 'error',
        message: 'parameter invalid'
      });
    }

    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const result = await authService.registerUser(
      device_id,
      account_name,
      phone_number,
      password,
      user_id ? parseInt(user_id) : null
    );

    res.json({
      status: 'success',
      data: {
        user: {
          id: result.userId
        }
      }
    });
  } catch (error) {
    console.error('Registration error:', error);

    if (error.message === 'Phone number already registered') {
      return res.status(400).json({
        status: 'error',
        message: 'parameter invalid'
      });
    }

    if (error.message === 'User validation failed - device ID mismatch') {
      return res.status(400).json({
        status: 'error',
        message: 'parameter invalid'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description User login endpoint
 * @async
 * @function login
 * @route POST /api/auth/login
 * 
 * @param {Object} req.body
 * @param {string} req.body.user_id - User ID
 * @param {string} req.body.phone_number - Phone number
 * @param {string} req.body.password - SHA-256(storedHash + timestamp)
 * @param {Object} req.headers
 * @param {string} req.headers.x-timestamp - Timestamp used in password hash
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - User data
 * 
 * @throws {400} If required parameters are missing
 * @throws {403} If authentication fails
 * @throws {500} If server error occurs
 */
router.post('/login', async (req, res) => {
  try {
    const { user_id, phone_number, password } = req.body;
    const timestamp = req.headers['x-timestamp'];

    // Validate required parameters
    if (!user_id || !phone_number || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'parameter invalid'
      });
    }

    // Validate password hash format
    if (!/^[a-f0-9]{64}$/i.test(password)) {
      return res.status(400).json({
        status: 'error',
        message: 'parameter invalid'
      });
    }

    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const result = await authService.userLogin(
      phone_number,
      password,
      parseInt(timestamp),
      clientIP
    );

    res.json({
      status: 'success',
      data: {
        user: {
          id: result.userId,
          name: result.userName,
          status: result.userStatus
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);

    if (error.message === 'User not found' || error.message === 'Invalid password') {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description User logout endpoint with Redis session deletion and validation
 * @async
 * @function logout
 * @route POST /api/auth/logout
 * 
 * @param {Object} req.body
 * @param {number} req.body.user_id - User ID (required for session deletion)
 * @param {string} req.body.device_id - Device ID (required for validation)
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {string} Response.message - Success message
 * 
 * @throws {400} If device_id is missing
 * @throws {500} If server error occurs
 * 
 * @sideEffects
 * - Validates session status and device_id before deletion
 * - Deletes Redis session for the user
 * - Logs logout activity in database
 */
router.post('/logout', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { device_id } = req.body;

    if (!device_id) {
      return res.status(400).json({
        status: 'error',
        message: 'parameter is required'
      });
    }

    const result = await authService.userLogout(userId, device_id);

    if (!result.sessionDeleted) {
      return res.status(400).json({
        status: 'error',
        message: 'Session validation failed or session not found'
      });
    }

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