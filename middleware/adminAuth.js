/**
 * @file middleware/adminAuth.js
 * @description Admin authentication middleware for role-based access control
 * @author Claude Code
 * @created 2025-07-23
 * 
 * This middleware provides scalable admin authentication and authorization
 * for protecting admin-only routes and operations. It builds on the existing
 * userAuth middleware to add role-based permissions.
 * 
 * Functions:
 * - requireAdmin: Middleware to ensure user has admin status (87)
 * - requireAdminOrOwner: Middleware to allow admin or resource owner access
 * - logAdminAction: Utility to log admin actions for audit trail
 * - isAdmin: Helper function to check if user is admin
 * - checkAdminPermission: Flexible permission checker for specific operations
 * 
 * Security Features:
 * - Explicit admin status validation (status = 87)
 * - Audit logging for all admin actions
 * - Flexible permission system for different admin operations
 * - Integration with existing authentication system
 * 
 * Dependencies:
 * - config/database.js: MySQL connection pool for audit logging
 * - middleware/userAuth.js: Base user authentication
 */

const pool = require('../config/database');

/**
 * Check if user has admin status
 * @function isAdmin
 * @param {Object} user - User object from authentication
 * @returns {boolean} True if user has admin status (87)
 */
const isAdmin = (user) => {
  return user && user.status === 87;
};

/**
 * Log admin action for audit trail
 * @async
 * @function logAdminAction
 * @param {number} adminId - Admin user ID
 * @param {string} action - Action performed
 * @param {string} targetType - Type of target (user, topic, reply, system)
 * @param {number|null} targetId - ID of target resource
 * @param {Object} details - Additional action details
 * @returns {Promise<void>}
 */
const logAdminAction = async (adminId, action, targetType = null, targetId = null, details = {}) => {
  try {
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action, metadata) VALUES (?, 99, ?, ?)',
      [adminId, `admin_${action}`, JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        details: details,
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
    logAdminAction(req.user.id, 'unauthorized_access_attempt', 'admin_route', null, {
      route: req.path,
      method: req.method,
      ip: req.ip
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
        logAdminAction(userId, 'access_user_resource', 'user', ownerId, {
          route: req.path,
          method: req.method
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
    logAdminAction(req.user.id, operation, 'permission_check', null, {
      route: req.path,
      method: req.method,
      operation: operation
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
    logAction: (action, targetType, targetId, details) => 
      logAdminAction(req.user.id, action, targetType, targetId, details),
    requiresAdmin: () => !isAdmin(req.user)
  };

  next();
};

module.exports = {
  requireAdmin,
  requireAdminOrOwner,
  checkAdminPermission,
  enhanceAdminContext,
  logAdminAction,
  isAdmin
};