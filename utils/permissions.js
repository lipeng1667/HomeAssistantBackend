/**
 * @file utils/permissions.js
 * @description Utility functions for permission and role checking
 * @author Claude Code
 * @created 2025-07-23
 * 
 * This utility module provides reusable functions for checking user permissions
 * and roles throughout the application. It centralizes permission logic and
 * makes it easy to extend with new roles and permissions.
 * 
 * User Status Values:
 * - -1: Deleted user (soft delete)
 * - 0: Normal user
 * - 87: Admin user
 * 
 * Functions:
 * - isAdmin: Check if user has admin status
 * - isNormalUser: Check if user has normal status
 * - isActiveUser: Check if user is active (not deleted)
 * - canManageUsers: Check if user can manage other users
 * - canModerateContent: Check if user can moderate content
 * - canAccessMetrics: Check if user can access system metrics
 * - canPerformSystemActions: Check if user can perform system operations
 * - getUserRoleName: Get human-readable role name
 * - hasPermission: Generic permission checker
 */

/**
 * Check if user has admin status (87)
 * @function isAdmin
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user is admin
 */
const isAdmin = (user) => {
  return user && user.status === 87;
};

/**
 * Check if user has normal user status (0)
 * @function isNormalUser
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user is normal user
 */
const isNormalUser = (user) => {
  return user && user.status === 0;
};

/**
 * Check if user is active (not deleted)
 * @function isActiveUser
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user is active (status >= 0)
 */
const isActiveUser = (user) => {
  return user && user.status >= 0;
};

/**
 * Check if user is deleted
 * @function isDeletedUser
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user is deleted (status = -1)
 */
const isDeletedUser = (user) => {
  return user && user.status === -1;
};

/**
 * Check if user can manage other users
 * @function canManageUsers
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user can manage users
 */
const canManageUsers = (user) => {
  return isAdmin(user);
};

/**
 * Check if user can moderate content (forums, posts, etc.)
 * @function canModerateContent
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user can moderate content
 */
const canModerateContent = (user) => {
  return isAdmin(user);
};

/**
 * Check if user can access system metrics and analytics
 * @function canAccessMetrics
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user can access metrics
 */
const canAccessMetrics = (user) => {
  return isAdmin(user);
};

/**
 * Check if user can perform system administration actions
 * @function canPerformSystemActions
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user can perform system actions
 */
const canPerformSystemActions = (user) => {
  return isAdmin(user);
};

/**
 * Check if user can delete other users
 * @function canDeleteUsers
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user can delete users
 */
const canDeleteUsers = (user) => {
  return isAdmin(user);
};

/**
 * Check if user can restore deleted users
 * @function canRestoreUsers
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user can restore users
 */
const canRestoreUsers = (user) => {
  return isAdmin(user);
};

/**
 * Check if user can change other users' status
 * @function canChangeUserStatus
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user can change user status
 */
const canChangeUserStatus = (user) => {
  return isAdmin(user);
};

/**
 * Check if user can view all users (including deleted)
 * @function canViewAllUsers
 * @param {Object} user - User object with status field
 * @returns {boolean} True if user can view all users
 */
const canViewAllUsers = (user) => {
  return isAdmin(user);
};

/**
 * Get human-readable role name for user
 * @function getUserRoleName
 * @param {Object} user - User object with status field
 * @returns {string} Role name
 */
const getUserRoleName = (user) => {
  if (!user) return 'unknown';
  
  switch (user.status) {
    case -1:
      return 'deleted';
    case 0:
      return 'user';
    case 87:
      return 'admin';
    default:
      return 'unknown';
  }
};

/**
 * Get user status description
 * @function getUserStatusDescription
 * @param {Object} user - User object with status field
 * @returns {string} Status description
 */
const getUserStatusDescription = (user) => {
  if (!user) return 'Unknown user';
  
  switch (user.status) {
    case -1:
      return 'Deleted user (soft delete)';
    case 0:
      return 'Normal user';
    case 87:
      return 'Administrator';
    default:
      return `Unknown status (${user.status})`;
  }
};

/**
 * Generic permission checker
 * @function hasPermission
 * @param {Object} user - User object with status field
 * @param {string} permission - Permission to check
 * @returns {boolean} True if user has permission
 */
const hasPermission = (user, permission) => {
  const permissions = {
    'user_management': canManageUsers,
    'content_moderation': canModerateContent,
    'metrics_access': canAccessMetrics,
    'system_administration': canPerformSystemActions,
    'delete_users': canDeleteUsers,
    'restore_users': canRestoreUsers,
    'change_user_status': canChangeUserStatus,
    'view_all_users': canViewAllUsers
  };

  const permissionChecker = permissions[permission];
  return permissionChecker ? permissionChecker(user) : false;
};

/**
 * Get all permissions for a user
 * @function getUserPermissions
 * @param {Object} user - User object with status field
 * @returns {Array<string>} Array of permission names
 */
const getUserPermissions = (user) => {
  const allPermissions = [
    'user_management',
    'content_moderation', 
    'metrics_access',
    'system_administration',
    'delete_users',
    'restore_users',
    'change_user_status',
    'view_all_users'
  ];

  return allPermissions.filter(permission => hasPermission(user, permission));
};

/**
 * Check if user can access resource owned by another user
 * @function canAccessUserResource
 * @param {Object} user - Current user
 * @param {number} resourceOwnerId - ID of resource owner
 * @returns {boolean} True if user can access the resource
 */
const canAccessUserResource = (user, resourceOwnerId) => {
  // Admins can access any resource
  if (isAdmin(user)) {
    return true;
  }
  
  // Users can access their own resources
  return user && user.id === resourceOwnerId;
};

module.exports = {
  isAdmin,
  isNormalUser,
  isActiveUser,
  isDeletedUser,
  canManageUsers,
  canModerateContent,
  canAccessMetrics,
  canPerformSystemActions,
  canDeleteUsers,
  canRestoreUsers,
  canChangeUserStatus,
  canViewAllUsers,
  getUserRoleName,
  getUserStatusDescription,
  hasPermission,
  getUserPermissions,
  canAccessUserResource
};