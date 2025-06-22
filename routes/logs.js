/**
 * @file logs.js
 * @description User activity logging routes
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-06-17
 * 
 * This file handles user activity logging functionality, providing endpoints
 * for recording various user actions and their metadata.
 * 
 * Dependencies:
 * - express: Web framework
 * - mysql2: Database operations
 * 
 * Routes:
 * - POST /api/logs/activity: Log user activity
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/auth');

/**
 * @description Log user activity
 * @async
 * @function logActivity
 * @route POST /api/logs/activity
 * 
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * @param {Object} req.body
 * @param {number} req.body.action_type - Type of action (0=login, 1=view forum, 2=open chat, 3=logout)
 * @param {string} req.body.action - Action description
 * @param {Object} [req.body.metadata] - Optional metadata for the action
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Created log entry data
 * 
 * @throws {400} If action_type or action is missing
 * @throws {500} If server error occurs
 */
router.post('/activity', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { action_type, action, metadata } = req.body;

    if (!action_type || !action) {
      return res.status(400).json({
        status: 'error',
        message: 'Action type and action are required'
      });
    }

    const [result] = await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action, metadata) VALUES (?, ?, ?, ?)',
      [userId, action_type, action, metadata ? JSON.stringify(metadata) : null]
    );

    res.status(201).json({
      status: 'success',
      data: {
        id: result.insertId,
        user_id: userId,
        action_type,
        action,
        metadata,
        created_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router; 