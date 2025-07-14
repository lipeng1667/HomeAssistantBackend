/**
 * @file chat.js
 * @description Chat routes for real-time messaging functionality
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-06-17
 * 
 * This file handles all chat-related routes including message history
 * retrieval and message sending. It manages conversations between users
 * and admins.
 * 
 * Dependencies:
 * - express: Web framework
 * - mysql2: Database operations
 * 
 * Routes:
 * - GET /api/chat/messages - Get chat history
 * - POST /api/chat/messages - Send message
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/userAuth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

/**
 * @description Get chat history for the authenticated user
 * @async
 * @function getChatHistory
 * @route GET /api/chat/messages
 * 
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Chat history data
 * @returns {number} Response.data.conversation_id - Conversation ID
 * @returns {Array} Response.data.messages - List of messages
 * 
 * @throws {500} If server error occurs
 */
router.get('/messages', async (req, res) => {
  try {
    // Get user_id from query parameters for GET request
    const userId = parseInt(req.query.user_id);

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id query parameter is required'
      });
    }

    // Validate user exists and is active
    const [users] = await pool.execute(
      'SELECT id, device_id FROM users WHERE id = ? AND status = 0',
      [userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found or inactive'
      });
    }

    // Get or create conversation
    let [conversations] = await pool.execute(
      'SELECT * FROM conversations WHERE user_id = ?',
      [userId]
    );

    let conversationId;
    if (conversations.length === 0) {
      const [result] = await pool.execute(
        'INSERT INTO conversations (user_id) VALUES (?)',
        [userId]
      );
      conversationId = result.insertId;
    } else {
      conversationId = conversations[0].id;
    }

    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    // Get messages with pagination
    const [messages] = await pool.execute(`
            SELECT m.*, 
                   CASE 
                       WHEN m.sender_role = 'admin' THEN CONCAT('admin_', COALESCE(m.admin_id, 'system'))
                       ELSE CONCAT('user_', u.device_id)
                   END as sender_identifier
            FROM messages m
            LEFT JOIN users u ON m.sender_role = 'user' AND m.user_id = u.id
            WHERE m.conversation_id = ?
            ORDER BY m.timestamp 
            LIMIT ? OFFSET ?
        `, [conversationId, limit, offset]);

    // Get total count for pagination
    const [totalResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?',
      [conversationId]
    );
    const total = totalResult[0].total;

    // Log the activity
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 2, "view_chat")',
      [userId]
    );

    res.json({
      status: 'success',
      data: {
        conversation_id: conversationId,
        messages,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Send a message in the chat
 * @async
 * @function sendMessage
 * @route POST /api/chat/messages
 * 
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * @param {Object} req.body
 * @param {string} req.body.message - Message content
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Created message data
 * 
 * @throws {400} If message content is missing
 * @throws {500} If server error occurs
 */
router.post('/messages', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        status: 'error',
        message: 'Message content is required'
      });
    }

    // Get or create conversation
    let [conversations] = await pool.execute(
      'SELECT * FROM conversations WHERE user_id = ?',
      [userId]
    );

    let conversationId;
    if (conversations.length === 0) {
      const [result] = await pool.execute(
        'INSERT INTO conversations (user_id) VALUES (?)',
        [userId]
      );
      conversationId = result.insertId;
    } else {
      conversationId = conversations[0].id;
    }

    // Insert message
    const [result] = await pool.execute(
      'INSERT INTO messages (conversation_id, user_id, sender_role, content) VALUES (?, ?, "user", ?)',
      [conversationId, userId, message]
    );

    // Update conversation's last_message_at
    await pool.execute(
      'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?',
      [conversationId]
    );

    // Log the activity
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 2, "send_message")',
      [userId]
    );

    const messageData = {
      id: result.insertId,
      conversation_id: conversationId,
      message,
      sender_role: 'user',
      timestamp: new Date()
    };

    // Emit real-time message via WebSocket if available
    if (global.socketService) {
      global.socketService.emitToConversation(conversationId, 'new_message', {
        ...messageData,
        content: message,
        message_type: 'text',
        sender_identifier: req.user?.device_id ? `user_${req.user.device_id}` : 'user'
      });
    }

    res.status(201).json({
      status: 'success',
      data: messageData
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Get conversations for the authenticated user
 * @async
 * @function getConversations
 * @route GET /api/chat/conversations
 * 
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * @param {Object} req.query - Query parameters
 * @param {number} req.query.page - Page number (default: 1)
 * @param {number} req.query.limit - Items per page (default: 20, max: 50)
 * @param {string} req.query.status - Filter by status (active, closed, archived)
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Conversations with pagination
 * 
 * @throws {500} If server error occurs
 */
router.get('/conversations', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const status = req.query.status || 'active';
    const offset = (page - 1) * limit;

    // Get conversations with last message info
    const [conversations] = await pool.execute(`
      SELECT 
        c.*,
        m.content as last_message_content,
        m.sender_role as last_message_sender,
        m.timestamp as last_message_time,
        COALESCE(unread.unread_count, 0) as unread_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id AND m.timestamp = c.last_message_at
      LEFT JOIN (
        SELECT conversation_id, COUNT(*) as unread_count
        FROM messages 
        WHERE sender_role = 'admin' AND is_read = FALSE
        GROUP BY conversation_id
      ) unread ON c.id = unread.conversation_id
      WHERE c.user_id = ? AND c.status = ?
      ORDER BY c.last_message_at DESC, c.updated_at DESC
      LIMIT ? OFFSET ?
    `, [userId, status, limit, offset]);

    // Get total count for pagination
    const [totalResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM conversations WHERE user_id = ? AND status = ?',
      [userId, status]
    );
    const total = totalResult[0].total;

    // Format conversations
    const formattedConversations = conversations.map(conv => ({
      id: conv.id,
      user_id: conv.user_id,
      admin_id: conv.admin_id,
      status: conv.status,
      last_message_at: conv.last_message_at,
      unread_count: conv.unread_count,
      last_message: conv.last_message_content ? {
        content: conv.last_message_content,
        sender_role: conv.last_message_sender,
        timestamp: conv.last_message_time
      } : null
    }));

    // Log the activity
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 2, "view_conversations")',
      [userId]
    );

    res.json({
      status: 'success',
      data: {
        conversations: formattedConversations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Create a new conversation
 * @async
 * @function createConversation
 * @route POST /api/chat/conversations
 * 
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * @param {Object} req.body
 * @param {string} req.body.initial_message - Initial message content
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Created conversation and message
 * 
 * @throws {400} If initial_message is missing
 * @throws {500} If server error occurs
 */
router.post('/conversations', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { initial_message } = req.body;

    if (!initial_message) {
      return res.status(400).json({
        status: 'error',
        message: 'initial_message is required'
      });
    }

    // Check if user already has an active conversation
    const [existingConversations] = await pool.execute(
      'SELECT * FROM conversations WHERE user_id = ? AND status = "active"',
      [userId]
    );

    let conversationId;
    if (existingConversations.length > 0) {
      conversationId = existingConversations[0].id;
    } else {
      // Create new conversation
      const [result] = await pool.execute(
        'INSERT INTO conversations (user_id) VALUES (?)',
        [userId]
      );
      conversationId = result.insertId;
    }

    // Insert initial message
    const [messageResult] = await pool.execute(
      'INSERT INTO messages (conversation_id, user_id, sender_role, content) VALUES (?, ?, "user", ?)',
      [conversationId, userId, initial_message]
    );

    // Log the activity
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 2, "create_conversation")',
      [userId]
    );

    res.status(201).json({
      status: 'success',
      data: {
        conversation_id: conversationId,
        message: {
          id: messageResult.insertId,
          content: initial_message,
          timestamp: new Date()
        }
      }
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Mark messages as read
 * @async
 * @function markMessagesAsRead
 * @route PUT /api/chat/conversations/:id/read
 * 
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * @param {Object} req.params
 * @param {string} req.params.id - Conversation ID
 * @param {Object} req.body
 * @param {Array} req.body.message_ids - Array of message IDs to mark as read
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Count of marked messages
 * 
 * @throws {400} If message_ids is missing or empty
 * @throws {403} If user doesn't have access to conversation
 * @throws {500} If server error occurs
 */
router.put('/conversations/:id/read', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id);
    const { message_ids } = req.body;

    if (!message_ids || !Array.isArray(message_ids) || message_ids.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'message_ids array is required'
      });
    }

    // Verify user has access to this conversation
    const [conversations] = await pool.execute(
      'SELECT * FROM conversations WHERE id = ? AND user_id = ?',
      [conversationId, userId]
    );

    if (conversations.length === 0) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied to conversation'
      });
    }

    // Mark messages as read
    const placeholders = message_ids.map(() => '?').join(',');
    const [result] = await pool.execute(
      `UPDATE messages SET is_read = TRUE 
       WHERE conversation_id = ? AND id IN (${placeholders}) AND sender_role = 'admin'`,
      [conversationId, ...message_ids]
    );

    res.json({
      status: 'success',
      data: {
        marked_read: result.affectedRows
      }
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Send typing indicator
 * @async
 * @function sendTypingIndicator
 * @route POST /api/chat/conversations/:id/typing
 * 
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * @param {Object} req.params
 * @param {string} req.params.id - Conversation ID
 * @param {Object} req.body
 * @param {boolean} req.body.typing - Typing status
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {string} Response.message - Success message
 * 
 * @throws {400} If typing status is missing
 * @throws {403} If user doesn't have access to conversation
 * @throws {500} If server error occurs
 */
router.post('/conversations/:id/typing', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id);
    const { typing } = req.body;

    if (typeof typing !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'typing status (boolean) is required'
      });
    }

    // Verify user has access to this conversation
    const [conversations] = await pool.execute(
      'SELECT * FROM conversations WHERE id = ? AND user_id = ?',
      [conversationId, userId]
    );

    if (conversations.length === 0) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied to conversation'
      });
    }

    // Emit typing indicator via WebSocket if available
    if (global.socketService) {
      global.socketService.emitToConversation(conversationId, 'typing_indicator', {
        conversation_id: conversationId,
        sender_role: 'user',
        typing: typing,
        sender_identifier: `user_${req.user.device_id}`
      });
    }

    res.json({
      status: 'success',
      message: 'Typing indicator sent'
    });
  } catch (error) {
    console.error('Error sending typing indicator:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Search messages in conversations
 * @async
 * @function searchMessages
 * @route GET /api/chat/search
 * 
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * @param {Object} req.query
 * @param {string} req.query.q - Search query (required, min 2 characters)
 * @param {number} req.query.conversation_id - Limit search to specific conversation
 * @param {number} req.query.page - Page number (default: 1)
 * @param {number} req.query.limit - Items per page (default: 20, max: 50)
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Search results with pagination
 * 
 * @throws {400} If query is missing or too short
 * @throws {500} If server error occurs
 */
router.get('/search', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { q, conversation_id, page = 1, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query must be at least 2 characters'
      });
    }

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 50);
    const offset = (pageNum - 1) * limitNum;

    // Build search query
    let searchQuery = `
      SELECT 
        m.id as message_id,
        m.conversation_id,
        m.content,
        m.sender_role,
        m.timestamp,
        c.user_id
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ? AND MATCH(m.content) AGAINST(? IN BOOLEAN MODE)
    `;

    const queryParams = [userId, q];

    if (conversation_id) {
      searchQuery += ' AND m.conversation_id = ?';
      queryParams.push(parseInt(conversation_id));
    }

    searchQuery += ' ORDER BY m.timestamp DESC LIMIT ? OFFSET ?';
    queryParams.push(limitNum, offset);

    const [results] = await pool.execute(searchQuery, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ? AND MATCH(m.content) AGAINST(? IN BOOLEAN MODE)
    `;

    const countParams = [userId, q];

    if (conversation_id) {
      countQuery += ' AND m.conversation_id = ?';
      countParams.push(parseInt(conversation_id));
    }

    const [totalResult] = await pool.execute(countQuery, countParams);
    const total = totalResult[0].total;

    // Format results with context
    const formattedResults = results.map(result => ({
      message_id: result.message_id,
      conversation_id: result.conversation_id,
      content: result.content,
      sender_role: result.sender_role,
      timestamp: result.timestamp,
      context: result.content.substring(0, 100) + (result.content.length > 100 ? '...' : '')
    }));

    res.json({
      status: 'success',
      data: {
        results: formattedResults,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Configure multer for chat file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'chat');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4().substring(0, 8);
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}_${uniqueId}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Single file per request
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common document types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

/**
 * @description Upload file for chat messages
 * @async
 * @function uploadFile
 * @route POST /api/chat/upload
 * 
 * @param {Object} req.user - User object from auth middleware
 * @param {number} req.user.id - User ID
 * @param {Object} req.file - Uploaded file (from multer)
 * @param {Object} req.body
 * @param {number} req.body.conversation_id - Conversation ID
 * @param {string} req.body.message_type - Message type: image, file
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Upload result with file info
 * 
 * @throws {400} If validation fails or file invalid
 * @throws {403} If user doesn't have access to conversation
 * @throws {413} If file too large
 * @throws {415} If unsupported file type
 * @throws {500} If server error occurs
 */
router.post('/upload', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    const userId = req.user.id;
    const { conversation_id, message_type = 'file' } = req.body;

    if (!conversation_id) {
      return res.status(400).json({
        status: 'error',
        message: 'conversation_id is required'
      });
    }

    // Verify user has access to this conversation
    const [conversations] = await pool.execute(
      'SELECT * FROM conversations WHERE id = ? AND user_id = ?',
      [conversation_id, userId]
    );

    if (conversations.length === 0) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(403).json({
        status: 'error',
        message: 'Access denied to conversation'
      });
    }

    // Generate file URL
    const fileUrl = `/uploads/chat/${req.file.filename}`;
    const publicUrl = `http://47.94.108.189${fileUrl}`;

    // Insert message with file into database
    const [result] = await pool.execute(
      'INSERT INTO messages (conversation_id, user_id, sender_role, message_type, content, file_url, metadata) VALUES (?, ?, "user", ?, ?, ?, ?)',
      [
        conversation_id,
        userId,
        message_type,
        req.file.originalname, // Use original filename as content
        publicUrl,
        JSON.stringify({
          original_filename: req.file.originalname,
          file_size: req.file.size,
          mime_type: req.file.mimetype,
          file_path: req.file.path
        })
      ]
    );

    const messageData = {
      id: result.insertId,
      conversation_id: parseInt(conversation_id),
      sender_role: 'user',
      message_type,
      content: req.file.originalname,
      file_url: publicUrl,
      timestamp: new Date().toISOString(),
      file_info: {
        filename: req.file.originalname,
        size: req.file.size,
        mime_type: req.file.mimetype
      }
    };

    // Emit real-time message via WebSocket if available
    if (global.socketService) {
      global.socketService.emitToConversation(conversation_id, 'new_message', {
        ...messageData,
        sender_identifier: req.user?.device_id ? `user_${req.user.device_id}` : 'user'
      });
    }

    // Log the activity
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 2, "upload_chat_file")',
      [userId]
    );

    res.status(201).json({
      status: 'success',
      data: {
        message: messageData,
        file_id: result.insertId,
        file_url: publicUrl,
        filename: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Error uploading chat file:', error);

    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }

    // Handle specific error types
    if (error.message.includes('File size exceeds')) {
      res.status(413).json({
        status: 'error',
        message: 'File size exceeds 10MB limit',
        error_code: 'FILE_TOO_LARGE'
      });
    } else if (error.message.includes('Unsupported file type')) {
      res.status(415).json({
        status: 'error',
        message: 'Unsupported file type',
        error_code: 'UNSUPPORTED_FILE_TYPE'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
});

module.exports = router; 