/**
 * @file chat.js
 * @description Chat routes for real-time messaging functionality
 * @author Michael Lee
 * @created 2024-03-19
 * @modified 2024-03-19
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
const { authenticateUser } = require('../middleware/auth');

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
router.get('/messages', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

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

    // Log the activity
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 2, "view_chat")',
      [userId]
    );

    res.json({
      status: 'success',
      data: {
        conversation_id: conversationId,
        messages
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
      'INSERT INTO messages (conversation_id, user_id, sender_role, message) VALUES (?, ?, "user", ?)',
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

    res.status(201).json({
      status: 'success',
      data: {
        id: result.insertId,
        conversation_id: conversationId,
        message,
        sender_role: 'user',
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router; 