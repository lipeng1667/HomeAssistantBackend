/**
 * @file admin.js
 * @description Admin routes for platform management
 * @author Michael Lee
 * @created 2024-03-19
 * @modified 2024-03-19
 * 
 * This file handles all admin-related routes including authentication,
 * forum management, and chat interactions with users.
 * 
 * Dependencies:
 * - express: Web framework
 * - bcrypt: Password hashing
 * - jsonwebtoken: JWT token handling
 * - mysql2: Database operations
 * 
 * Routes:
 * - POST /api/admin/login: Admin login
 * - GET /api/admin/forum/questions: View all questions
 * - POST /api/admin/forum/questions/:id/reply: Admin reply to question
 * - GET /api/admin/chat/:user_id/messages: View chat with user
 * - POST /api/admin/chat/:user_id/messages: Send message to user
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/**
 * @description Admin login endpoint
 * @async
 * @function adminLogin
 * @route POST /api/admin/login
 * 
 * @param {Object} req.body
 * @param {string} req.body.username - Admin username
 * @param {string} req.body.password - Admin password
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Admin data and token
 * 
 * @throws {400} If username or password is missing
 * @throws {401} If credentials are invalid
 * @throws {500} If server error occurs
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Username and password are required'
      });
    }

    const [admins] = await pool.execute(
      'SELECT * FROM admins WHERE username = ? AND status = 0',
      [username]
    );

    if (admins.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    const admin = admins[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);

    if (!validPassword) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      { adminId: admin.id, username: admin.username },
      process.env.JWT_ADMIN_SECRET || 'your-admin-secret-key',
      { expiresIn: '1d' }
    );

    res.json({
      status: 'success',
      data: {
        token,
        admin: {
          id: admin.id,
          username: admin.username
        }
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Get all forum questions (admin view)
 * @async
 * @function getAdminQuestions
 * @route GET /api/admin/forum/questions
 * 
 * @param {Object} req.admin - Admin object from auth middleware
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Array} Response.data - List of questions with reply counts
 * 
 * @throws {500} If server error occurs
 */
router.get('/forum/questions', authenticateAdmin, async (req, res) => {
  try {
    const [questions] = await pool.execute(`
            SELECT q.*, u.uuid as user_uuid,
                   (SELECT COUNT(*) FROM forum_replies WHERE question_id = q.id AND status = 0) as reply_count
            FROM forum_questions q
            JOIN users u ON q.user_id = u.id
            ORDER BY q.created_at DESC
        `);

    res.json({
      status: 'success',
      data: questions
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Admin reply to forum question
 * @async
 * @function adminReply
 * @route POST /api/admin/forum/questions/:id/reply
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Question ID
 * @param {Object} req.body
 * @param {string} req.body.content - Reply content
 * @param {Object} req.admin - Admin object from auth middleware
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Created reply data
 * 
 * @throws {400} If content is missing
 * @throws {404} If question not found
 * @throws {500} If server error occurs
 */
router.post('/forum/questions/:id/reply', authenticateAdmin, async (req, res) => {
  try {
    const questionId = req.params.id;
    const { content } = req.body;
    const adminId = req.admin.id;

    if (!content) {
      return res.status(400).json({
        status: 'error',
        message: 'Content is required'
      });
    }

    // Verify question exists
    const [questions] = await pool.execute(
      'SELECT * FROM forum_questions WHERE id = ?',
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Question not found'
      });
    }

    const [result] = await pool.execute(
      'INSERT INTO forum_replies (question_id, admin_id, responder_role, content) VALUES (?, ?, "admin", ?)',
      [questionId, adminId, content]
    );

    res.status(201).json({
      status: 'success',
      data: {
        id: result.insertId,
        question_id: questionId,
        content,
        responder_role: 'admin'
      }
    });
  } catch (error) {
    console.error('Error posting admin reply:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Finds an existing conversation or creates a new one.
 * @param {number} userId - The ID of the user.
 * @param {boolean} [createIfNotFound=false] - Whether to create a conversation if not found.
 * @returns {Promise<Object|null>} The conversation object or null.
 */
async function getOrCreateConversation(userId, createIfNotFound = false) {
  const [conversations] = await pool.execute(
    'SELECT * FROM conversations WHERE user_id = ?',
    [userId]
  );

  if (conversations.length > 0) {
    return conversations[0];
  }

  if (createIfNotFound) {
    const [result] = await pool.execute(
      'INSERT INTO conversations (user_id) VALUES (?)',
      [userId]
    );
    return { id: result.insertId, user_id: userId };
  }
  return null;
}

/**
 * @description Get chat history with specific user
 * @async
 * @function getAdminChat
 * @route GET /api/admin/chat/:user_id/messages
 * 
 * @param {Object} req.params
 * @param {string} req.params.user_id - User ID
 * @param {Object} req.admin - Admin object from auth middleware
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Chat history data
 * 
 * @throws {500} If server error occurs
 */
router.get('/chat/:user_id/messages', authenticateAdmin, async (req, res) => {
  try {
    const userId = req.params.user_id;

    const conversation = await getOrCreateConversation(userId);

    if (!conversation) {
      return res.json({
        status: 'success',
        data: {
          conversation_id: null,
          messages: []
        }
      });
    }

    const conversationId = conversation.id;

    // Get messages
    const [messages] = await pool.execute(`
            SELECT m.*, 
                   CASE 
                       WHEN m.sender_role = 'admin' THEN a.username
                       ELSE u.uuid
                   END as sender_identifier
            FROM messages m
            LEFT JOIN users u ON m.sender_role = 'user' AND m.user_id = u.id
            LEFT JOIN admins a ON m.sender_role = 'admin' AND m.admin_id = a.id
            WHERE m.conversation_id = ?
            ORDER BY m.timestamp ASC
        `, [conversationId]);

    res.json({
      status: 'success',
      data: {
        conversation_id: conversationId,
        messages
      }
    });
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Admin send message to user
 * @async
 * @function adminSendMessage
 * @route POST /api/admin/chat/:user_id/messages
 * 
 * @param {Object} req.params
 * @param {string} req.params.user_id - User ID
 * @param {Object} req.body
 * @param {string} req.body.message - Message content
 * @param {Object} req.admin - Admin object from auth middleware
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Created message data
 * 
 * @throws {400} If message content is missing
 * @throws {500} If server error occurs
 */
router.post('/chat/:user_id/messages', authenticateAdmin, async (req, res) => {
  try {
    const userId = req.params.user_id;
    const { message } = req.body;
    const adminId = req.admin.id;

    if (!message) {
      return res.status(400).json({
        status: 'error',
        message: 'Message content is required'
      });
    }

    const conversation = await getOrCreateConversation(userId, true);
    if (!conversation) {
      throw new Error('Failed to get or create a conversation.');
    }

    // Insert message
    const [result] = await pool.execute(
      'INSERT INTO messages (conversation_id, admin_id, sender_role, message) VALUES (?, ?, "admin", ?)',
      [conversation.id, adminId, message]
    );

    // Update conversation's last_message_at
    await pool.execute(
      'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?',
      [conversation.id]
    );

    res.status(201).json({
      status: 'success',
      data: {
        id: result.insertId,
        conversation_id: conversation.id,
        message,
        sender_role: 'admin',
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error sending admin message:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router; 