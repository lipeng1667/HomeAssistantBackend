/**
 * @file auth.js
 * @description Authentication middleware for user and admin routes
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-06-17
 * 
 * This file provides middleware functions for JWT token verification
 * and user/admin session management.
 * 
 * Dependencies:
 * - jsonwebtoken: JWT token handling
 * - mysql2: Database operations
 * 
 * Environment Variables:
 * - JWT_SECRET: Secret key for user JWT tokens
 * - JWT_ADMIN_SECRET: Secret key for admin JWT tokens
 */

const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const config = require('../config');

/**
 * @description Middleware to restrict access to localhost only
 * @function localhostOnly
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const localhostOnly = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  // Check if the request is from localhost
  const isLocalhost = clientIP === '127.0.0.1' ||
    clientIP === '::1' ||
    clientIP === 'localhost' ||
    clientIP === '::ffff:127.0.0.1' || // IPv4-mapped IPv6
    clientIP === '::ffff:127.0.0.1:10000'; // With port
  
  if (!isLocalhost) {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. This endpoint is only accessible from localhost.'
    });
  }
  
  next();
};

/**
 * @description Middleware for user authentication
 * @async
 * @function authenticateUser
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * 
 * @returns {void}
 * 
 * @throws {401} If no token is provided
 * @throws {401} If token is invalid
 * @throws {401} If token is expired
 * @throws {401} If user is not found or inactive
 * @throws {500} If server error occurs
 */
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    // Verify user exists and is active
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE id = ? AND status = 0',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found or inactive'
      });
    }

    req.user = {
      id: decoded.userId,
      uuid: decoded.userUuid,
      device_id: decoded.device_id
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired'
      });
    }
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

/**
 * @description Middleware for admin authentication
 * @async
 * @function authenticateAdmin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * 
 * @returns {void}
 * 
 * @throws {401} If no token is provided
 * @throws {401} If token is invalid
 * @throws {401} If token is expired
 * @throws {401} If admin is not found or inactive
 * @throws {500} If server error occurs
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.adminSecret);

    // Verify admin exists and is active
    const [admins] = await pool.execute(
      'SELECT * FROM admins WHERE id = ? AND status = 0',
      [decoded.adminId]
    );

    if (admins.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'Admin not found or inactive'
      });
    }

    req.admin = {
      id: decoded.adminId,
      username: decoded.username
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired'
      });
    }
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

module.exports = {
  authenticateUser,
  authenticateAdmin,
  localhostOnly
}; 