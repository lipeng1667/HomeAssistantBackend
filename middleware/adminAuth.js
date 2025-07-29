/**
 * @file middleware/adminAuth.js
 * @description Enhanced admin authentication middleware with session token support
 * @author Claude Code
 * @created 2025-07-23
 * @modified 2025-07-29
 * 
 * This middleware provides scalable admin authentication and authorization
 * with enhanced security features including session token validation and
 * comprehensive audit logging for all admin operations.
 * 
 * Functions:
 * - requireAdmin: Middleware to ensure user has admin status (87)
 * - authenticateAdmin: Full admin authentication with session token support
 * - validateSessionToken: Optional session token validation middleware
 * - requireAdminOrOwner: Middleware to allow admin or resource owner access
 * - logAdminAction: Enhanced audit logging with IP tracking
 * - isAdmin: Helper function to check if user is admin
 * - checkAdminPermission: Flexible permission checker for specific operations
 * 
 * Security Features:
 * - Enhanced admin status validation (user_status = 87)
 * - Optional session token validation for sensitive operations
 * - Comprehensive audit logging with IP addresses and endpoints
 * - Failed access attempt logging
 * - Integration with Redis session management
 * 
 * Dependencies:
 * - config/database.js: MySQL connection pool for audit logging
 * - config/redis.js: Redis client for session management
 * - middleware/userAuth.js: Base user authentication
 */

const pool = require('../config/database');
const redisClient = require('../config/redis.js');
const { authenticateUser } = require('./userAuth');

/**
 * Check if user has admin status
 * @function isAdmin
 * @param {Object} user - User object from authentication
 * @returns {boolean} True if user has admin status (87)
 */
const isAdmin = (user) => {
  return user && user.user_status === 87;
};

/**
 * Enhanced admin action logging with IP tracking
 * @async
 * @function logAdminAction
 * @param {number} adminId - Admin user ID
 * @param {string} action - Action performed
 * @param {Object} details - Additional action details with ip_address, endpoint, etc.
 * @returns {Promise<void>}
 */
const logAdminAction = async (adminId, action, details = {}) => {
  try {
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action, metadata) VALUES (?, 99, ?, ?)',
      [adminId, `admin_${action}`, JSON.stringify({
        ...details,
        timestamp: new Date().toISOString()
      })]
    );
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Don't throw error to prevent admin operations from failing due to logging issues
  }
};

/**
 * Middleware to require admin status (87)
 * @function requireAdmin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 * @returns {void}
 */
const requireAdmin = (req, res, next) => {
  // First check if user is authenticated
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required'
    });
  }

  // Check admin status
  if (!isAdmin(req.user)) {
    // Log unauthorized admin access attempt
    logAdminAction(req.user.id, 'unauthorized_access_attempt', {
      endpoint: req.path,
      method: req.method,
      ip_address: req.ip || 'unknown'
    }).catch(console.error);

    return res.status(403).json({
      status: 'error',
      message: 'Admin access required'
    });
  }

  next();
};

/**
 * Middleware to allow admin or resource owner access
 * @function requireAdminOrOwner
 * @param {string} ownerIdParam - Parameter name containing owner ID (e.g., 'userId', 'id')
 * @returns {Function} Express middleware function
 */
const requireAdminOrOwner = (ownerIdParam = 'userId') => {
  return (req, res, next) => {
    // First check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const ownerId = parseInt(req.params[ownerIdParam] || req.body[ownerIdParam]);
    const userId = req.user.id;

    // Allow if user is admin or owns the resource
    if (isAdmin(req.user) || userId === ownerId) {
      // Log admin action if admin is accessing someone else's resource
      if (isAdmin(req.user) && userId !== ownerId) {
        logAdminAction(userId, 'access_user_resource', {
          target_type: 'user',
          target_id: ownerId,
          endpoint: req.path,
          method: req.method,
          ip_address: req.ip || 'unknown'
        }).catch(console.error);
      }
      
      next();
    } else {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied: Admin or owner access required'
      });
    }
  };
};

/**
 * Check specific admin permissions for different operations
 * @function checkAdminPermission
 * @param {string} operation - Operation type (user_management, content_moderation, system_admin, analytics)
 * @returns {Function} Express middleware function
 */
const checkAdminPermission = (operation) => {
  return (req, res, next) => {
    // First check if user is authenticated and is admin
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    if (!isAdmin(req.user)) {
      return res.status(403).json({
        status: 'error',
        message: 'Admin access required'
      });
    }

    // For now, all admin operations are allowed for status 87 users
    // In the future, you could implement more granular permissions here
    // based on different admin levels (e.g., 50 = moderator, 87 = admin, 99 = super admin)
    
    // Log the specific admin operation
    logAdminAction(req.user.id, operation, {
      target_type: 'permission_check',
      endpoint: req.path,
      method: req.method,
      operation: operation,
      ip_address: req.ip || 'unknown'
    }).catch(console.error);

    next();
  };
};

/**
 * Express middleware to enhance request with admin utilities
 * @function enhanceAdminContext
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const enhanceAdminContext = (req, res, next) => {
  // Add admin utilities to request object
  req.adminUtils = {
    isAdmin: () => isAdmin(req.user),
    logAction: (action, details) => 
      logAdminAction(req.user.id, action, { ...details, ip_address: req.ip }),
    requiresAdmin: () => !isAdmin(req.user)
  };

  next();
};

/**
 * Session token validation middleware for enhanced admin security
 * @async
 * @function validateSessionToken
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} Calls next() on success or sends 401 error response
 */
const validateSessionToken = async (req, res, next) => {
  try {
    const providedToken = req.headers['x-session-token'];
    
    // If no token provided, skip validation (optional middleware)
    if (!providedToken) {
      return next();
    }

    // Check if provided token matches session token
    if (req.user && req.user.session_token && req.user.session_token !== providedToken) {
      await logAdminAction(req.user.id, 'invalid_session_token', {
        ip_address: req.ip || 'unknown',
        endpoint: req.path
      });

      return res.status(401).json({
        status: 'error',
        message: 'Invalid session token'
      });
    }

    next();
  } catch (error) {
    console.error('Session token validation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Session token validation failed'
    });
  }
};

/**
 * Full admin authentication middleware with enhanced security
 * @async
 * @function authenticateAdmin
 * @param {Object} req - Express request object with user_id in body
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} Calls next() on success or sends error response
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    // First run standard user authentication
    await new Promise((resolve, reject) => {
      authenticateUser(req, res, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Check admin status
    if (!isAdmin(req.user)) {
      await logAdminAction(req.user.id, 'unauthorized_admin_access', {
        ip_address: req.ip || 'unknown',
        endpoint: req.path,
        method: req.method
      });

      return res.status(403).json({
        status: 'error',
        message: 'Admin access required'
      });
    }

    // Validate session token if provided
    const providedToken = req.headers['x-session-token'];
    if (providedToken && req.user.session_token !== providedToken) {
      await logAdminAction(req.user.id, 'invalid_admin_session_token', {
        ip_address: req.ip || 'unknown',
        endpoint: req.path
      });

      return res.status(401).json({
        status: 'error',
        message: 'Invalid session token'
      });
    }

    // Log successful admin access
    await logAdminAction(req.user.id, 'admin_access_granted', {
      ip_address: req.ip || 'unknown',
      endpoint: req.path,
      method: req.method,
      session_token_used: !!providedToken
    });

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    
    // If it's a user authentication error, let it bubble up with proper status
    if (error.status) {
      return res.status(error.status).json({
        status: 'error',
        message: error.message
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Admin authentication failed'
    });
  }
};

module.exports = {
  requireAdmin,
  authenticateAdmin,
  validateSessionToken,
  requireAdminOrOwner,
  checkAdminPermission,
  enhanceAdminContext,
  logAdminAction,
  isAdmin
};