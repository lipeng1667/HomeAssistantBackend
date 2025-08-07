/**
 * @file routes/admin/chat.js
 * @description Admin chat management routes for conversation handling and messaging
 * @author Michael Lee
 * @created 2025-08-07
 * @modified 2025-08-07
 * 
 * This module provides admin endpoints for IM chat management including dashboard
 * statistics, conversation assignment, status management, admin messaging, and
 * real-time conversation monitoring following the established service layer pattern.
 * 
 * Modification Log:
 * - 2025-08-07: Initial implementation with comprehensive admin IM functionality
 * 
 * Routes:
 * - GET /admin/chat/dashboard - Admin chat dashboard with statistics
 * - GET /admin/chat/conversations - List all conversations for admin management
 * - GET /admin/chat/conversations/:id - Get conversation details for admin review
 * - PUT /admin/chat/conversations/:id/assign - Assign conversation to admin
 * - PUT /admin/chat/conversations/:id/status - Update conversation status/priority
 * - POST /admin/chat/conversations/:id/messages - Send message as admin
 * 
 * Security:
 * - All routes protected by authenticateAdmin middleware
 * - Comprehensive audit logging for all admin actions
 * - IP tracking and session validation
 * - Role-based access control for conversation management
 * 
 * Dependencies:
 * - services/adminChatService: Admin chat business logic
 * - middleware/adminAuth: Admin authentication and authorization
 * - services/socketService: WebSocket events for real-time updates
 */

const express = require('express');
const router = express.Router();
const adminChatService = require('../../services/adminChatService');
const { authenticateAdmin } = require('../../middleware/adminAuth');
const { validateAppAuth } = require('../../middleware/appAuth');

// Apply app-level authentication and admin authentication to all admin chat routes
router.use(validateAppAuth, authenticateAdmin);

/**
 * @description Get admin chat dashboard with statistics and overview
 * @route GET /admin/chat/dashboard
 * @param {Object} req.query
 * @param {number} req.query.admin_id - Specific admin ID for personalized data (optional)
 * @returns {Object} Dashboard statistics, recent activity, and admin assignments
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { admin_id } = req.query;
    const targetAdminId = admin_id ? parseInt(admin_id) : req.user.id;

    // Get dashboard statistics
    const dashboardData = await adminChatService.getDashboardStats(targetAdminId);

    // Log admin action
    await adminChatService.logAdminActivity({
      admin_id: req.user.id,
      action: 'dashboard_access',
      notes: `Accessed chat dashboard${admin_id ? ` for admin ${admin_id}` : ''}`
    });

    res.json({
      status: 'success',
      data: dashboardData
    });

  } catch (error) {
    console.error('Error getting admin chat dashboard:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description List all conversations across all users for admin management with advanced filtering
 * @route GET /admin/chat/conversations
 * @param {Object} req.query
 * @param {number} req.query.page - Page number (default: 1)
 * @param {number} req.query.limit - Items per page (default: 20, max: 100)
 * @param {string} req.query.status - Filter by status (default: 'all')
 * @param {string} req.query.assigned_admin - Filter by assigned admin ID or 'unassigned' (default: 'all')
 * @param {number} req.query.user_id - Filter by specific user ID (optional)
 * @param {boolean} req.query.unread_only - Show only conversations with unread messages (default: false)
 * @param {string} req.query.sort - Sort order: newest, oldest, last_activity, priority (default: 'newest')
 * @param {string} req.query.priority - Filter by priority level (default: 'all')
 * @returns {Object} Paginated conversations with detailed information and summary statistics
 */
router.get('/conversations', async (req, res) => {
  try {
    const filters = {
      page: req.query.page || 1,
      limit: req.query.limit || 20,
      status: req.query.status || 'all',
      assigned_admin: req.query.assigned_admin || 'all',
      user_id: req.query.user_id || null,
      unread_only: req.query.unread_only === 'true',
      sort: req.query.sort || 'newest',
      priority: req.query.priority || 'all'
    };

    // Get conversations with filtering
    const conversationsData = await adminChatService.getConversations(filters);

    // Log admin action
    await adminChatService.logAdminActivity({
      admin_id: req.user.id,
      action: 'conversations_list_access',
      notes: `Accessed conversations list with filters: ${JSON.stringify(filters)}`
    });

    res.json({
      status: 'success',
      data: conversationsData
    });

  } catch (error) {
    console.error('Error getting admin conversations:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Get detailed information about a specific conversation for admin review
 * @route GET /admin/chat/conversations/:id
 * @param {number} req.params.id - Conversation ID
 * @returns {Object} Detailed conversation information with message history and activity log
 */
router.get('/conversations/:id', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);

    if (isNaN(conversationId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid conversation ID'
      });
    }

    // Get conversation details
    const conversationData = await adminChatService.getConversationDetails(conversationId);

    // Log admin action
    await adminChatService.logAdminActivity({
      admin_id: req.user.id,
      conversation_id: conversationId,
      action: 'conversation_view',
      notes: 'Viewed conversation details'
    });

    res.json({
      status: 'success',
      data: conversationData
    });

  } catch (error) {
    console.error('Error getting conversation details:', error);
    
    if (error.message === 'Conversation not found') {
      return res.status(404).json({
        status: 'error',
        message: 'Conversation not found'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Assign a conversation to a specific admin for handling
 * @route PUT /admin/chat/conversations/:id/assign
 * @param {number} req.params.id - Conversation ID
 * @param {Object} req.body
 * @param {number} req.body.admin_id - Admin ID to assign conversation to
 * @param {string} req.body.notes - Assignment notes (optional)
 * @returns {Object} Assignment result with conversation and admin information
 */
router.put('/conversations/:id/assign', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const { admin_id, notes } = req.body;

    // Validate input
    if (isNaN(conversationId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid conversation ID'
      });
    }

    if (!admin_id || isNaN(parseInt(admin_id))) {
      return res.status(400).json({
        status: 'error',
        message: 'admin_id is required and must be a valid number'
      });
    }

    // Assign conversation
    const assignmentResult = await adminChatService.assignConversation(
      conversationId,
      parseInt(admin_id),
      req.user.id,
      notes
    );

    // TODO: Get socketService instance and emit WebSocket event
    // const socketService = require('../../services/socketService');
    // socketService.emitToAdmin(admin_id, 'admin_conversation_assigned', assignmentResult);

    res.json({
      status: 'success',
      data: assignmentResult
    });

  } catch (error) {
    console.error('Error assigning conversation:', error);
    
    if (error.message.includes('not found') || error.message.includes('invalid')) {
      return res.status(400).json({
        status: 'error',
        message: error.message
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Update conversation status, priority, and management tags
 * @route PUT /admin/chat/conversations/:id/status
 * @param {number} req.params.id - Conversation ID
 * @param {Object} req.body
 * @param {string} req.body.status - New status: active, closed, archived, pending (optional)
 * @param {string} req.body.priority - Priority level: low, normal, high, urgent (optional)
 * @param {Array} req.body.tags - Array of tag strings (optional)
 * @param {string} req.body.resolution_notes - Notes when closing conversation (optional)
 * @returns {Object} Updated conversation details
 */
router.put('/conversations/:id/status', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const { status, priority, tags, resolution_notes } = req.body;

    // Validate input
    if (isNaN(conversationId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid conversation ID'
      });
    }

    // Validate status if provided
    if (status && !['active', 'closed', 'archived', 'pending'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid status. Must be one of: active, closed, archived, pending'
      });
    }

    // Validate priority if provided
    if (priority && !['low', 'normal', 'high', 'urgent'].includes(priority)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid priority. Must be one of: low, normal, high, urgent'
      });
    }

    // Validate tags if provided
    if (tags && !Array.isArray(tags)) {
      return res.status(400).json({
        status: 'error',
        message: 'Tags must be an array'
      });
    }

    // Build updates object with only provided fields
    const updates = {};
    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (tags !== undefined) updates.tags = tags;
    if (resolution_notes) updates.resolution_notes = resolution_notes;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'At least one field to update must be provided'
      });
    }

    // Update conversation status
    const updateResult = await adminChatService.updateConversationStatus(
      conversationId,
      req.user.id,
      updates
    );

    // TODO: Get socketService instance and emit WebSocket event
    // const socketService = require('../../services/socketService');
    // socketService.emitToConversation(conversationId, 'conversation_status_updated', updateResult);

    res.json({
      status: 'success',
      data: updateResult
    });

  } catch (error) {
    console.error('Error updating conversation status:', error);
    
    if (error.message === 'Conversation not found') {
      return res.status(404).json({
        status: 'error',
        message: 'Conversation not found'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Send a message as an admin to a specific conversation
 * @route POST /admin/chat/conversations/:id/messages
 * @param {number} req.params.id - Conversation ID
 * @param {Object} req.body
 * @param {string} req.body.message - Message content
 * @param {string} req.body.message_type - Type of message: text, image, file (default: 'text')
 * @param {string} req.body.file_id - File ID for file/image messages (optional)
 * @param {string} req.body.file_url - File URL for file/image messages (optional)
 * @param {string} req.body.internal_note - Private admin note (not visible to user)
 * @returns {Object} Created message details
 */
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const { message, message_type = 'text', file_id, file_url, internal_note } = req.body;

    // Validate input
    if (isNaN(conversationId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid conversation ID'
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Message content is required and cannot be empty'
      });
    }

    // Validate message_type
    if (!['text', 'image', 'file', 'internal_note'].includes(message_type)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid message_type. Must be one of: text, image, file, internal_note'
      });
    }

    // Validate file requirements for file/image types
    if ((message_type === 'file' || message_type === 'image') && (!file_id && !file_url)) {
      return res.status(400).json({
        status: 'error',
        message: 'file_id or file_url is required for file and image message types'
      });
    }

    // Build message data
    const messageData = {
      conversation_id: conversationId,
      admin_id: req.user.id,
      message: message.trim(),
      message_type,
      file_id: file_id || null,
      file_url: file_url || null,
      internal_note: internal_note || null
    };

    // Send admin message
    const messageResult = await adminChatService.sendAdminMessage(messageData);

    // TODO: Get socketService instance and emit WebSocket events
    // const socketService = require('../../services/socketService');
    // if (message_type !== 'internal_note') {
    //   socketService.emitToConversation(conversationId, 'new_message', messageResult);
    // }
    // socketService.emitToAdmins('admin_message_sent', messageResult);

    res.json({
      status: 'success',
      data: messageResult
    });

  } catch (error) {
    console.error('Error sending admin message:', error);
    
    if (error.message.includes('not found') || error.message.includes('invalid')) {
      return res.status(400).json({
        status: 'error',
        message: error.message
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router;