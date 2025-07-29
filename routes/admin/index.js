/**
 * @file routes/admin/index.js
 * @description Main admin routes router with role-based protection
 * @author Claude Code
 * @created 2025-07-23
 * 
 * This file serves as the main entry point for all admin routes,
 * providing centralized admin authentication and route organization.
 * 
 * Route Groups:
 * - /admin/users - User management routes
 * - /admin/content - Content moderation routes  
 * - /admin/metrics - Analytics and metrics routes
 * - /admin/system - System administration routes
 * 
 * Security:
 * - All routes protected by requireAdmin middleware
 * - Admin action logging enabled
 * - Individual route-level permissions available
 */

const express = require('express');
const router = express.Router();
const { requireAdmin, enhanceAdminContext } = require('../../middleware/adminAuth');
const { authenticateUser } = require('../../middleware/userAuth');

// Apply authentication and admin context enhancement to all admin routes
router.use(authenticateUser);
router.use(enhanceAdminContext);
router.use(requireAdmin);

// Admin route groups
router.use('/forum', require('./forum'));
// router.use('/users', require('./users'));
// router.use('/content', require('./content'));
// router.use('/metrics', require('./metrics'));
// router.use('/system', require('./system'));

/**
 * @description Admin dashboard endpoint
 * @route GET /admin/dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Log admin dashboard access
    await req.adminUtils.logAction('dashboard_access', 'system', null, {
      route: req.path
    });

    // TODO: Implement dashboard data aggregation
    res.json({
      status: 'success',
      data: {
        message: 'Admin dashboard - implementation pending',
        admin_user: {
          id: req.user.id,
          username: req.user.username,
          status: req.user.status
        },
        available_features: [
          'User Management',
          'Content Moderation', 
          'System Metrics',
          'Analytics & Reporting'
        ]
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Get admin user info
 * @route GET /admin/profile
 */
router.get('/profile', async (req, res) => {
  try {
    await req.adminUtils.logAction('profile_access', 'admin_user', req.user.id);

    res.json({
      status: 'success',
      data: {
        id: req.user.id,
        username: req.user.username,
        status: req.user.status,
        role: 'admin',
        permissions: [
          'user_management',
          'content_moderation',
          'system_administration',
          'analytics_access'
        ]
      }
    });
  } catch (error) {
    console.error('Admin profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router;