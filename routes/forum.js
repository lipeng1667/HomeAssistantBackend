/**
 * @file forum.js
 * @description Forum routes for managing questions and replies
 * @author Michael Lee
 * @created 2024-03-19
 * @modified 2024-03-19
 * 
 * This file handles all forum-related routes including question listing,
 * creation, and reply management. It supports both user and admin interactions.
 * 
 * Dependencies:
 * - express: Web framework
 * - mysql2: Database operations
 * 
 * Routes:
 * - GET /api/forum/questions: List all questions
 * - POST /api/forum/questions: Create a new question
 * - GET /api/forum/questions/:id: Get question details
 * - POST /api/forum/questions/:id/reply: Post a reply
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/auth');

/**
 * @description Get all forum questions
 * @async
 * @function getQuestions
 * @route GET /api/forum/questions
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Array} Response.data - List of questions with reply counts
 * 
 * @throws {500} If server error occurs
 */
router.get('/questions', async (req, res) => {
  try {
    const [questions] = await pool.execute(`
            SELECT q.*, u.uuid as user_uuid, 
                   (SELECT COUNT(*) FROM forum_replies WHERE question_id = q.id AND status = 0) as reply_count
            FROM forum_questions q
            JOIN users u ON q.user_id = u.id
            WHERE q.status = 0
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
 * @description Create new forum question
 * @async
 * @function createQuestion
 * @route POST /api/forum/questions
 * 
 * @param {Object} req.body
 * @param {string} req.body.title - Question title
 * @param {string} req.body.content - Question content
 * @param {Object} req.user - User object from auth middleware
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Created question data
 * 
 * @throws {400} If title or content is missing
 * @throws {500} If server error occurs
 */
router.post('/questions', authenticateUser, async (req, res) => {
  let connection;
  try {
    const { title, content } = req.body;
    const userId = req.user.id;

    if (!title || !content) {
      return res.status(400).json({ status: 'error', message: 'Title and content are required' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.execute(
      'INSERT INTO forum_questions (user_id, title, content) VALUES (?, ?, ?)',
      [userId, title, content]
    );
    const questionId = result.insertId;

    // Log the activity
    await connection.execute(
      'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 1, "create_question")',
      [userId]
    );

    await connection.commit();

    res.status(201).json({
      status: 'success',
      data: {
        id: questionId,
        title,
        content,
        user_id: userId
      }
    });
  } catch (error) {
    console.error('Error creating question:', error);
    if (connection) await connection.rollback();
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * @description Get question details with replies
 * @async
 * @function getQuestionDetails
 * @route GET /api/forum/questions/:id
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Question ID
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Question details and replies
 * 
 * @throws {404} If question not found
 * @throws {500} If server error occurs
 */
router.get('/questions/:id', async (req, res) => {
  try {
    const questionId = req.params.id;

    const [questions] = await pool.execute(`
            SELECT q.*, u.uuid as user_uuid
            FROM forum_questions q
            JOIN users u ON q.user_id = u.id
            WHERE q.id = ? AND q.status = 0
        `, [questionId]);

    if (questions.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Question not found'
      });
    }

    const [replies] = await pool.execute(`
            SELECT r.*, 
                   CASE 
                       WHEN r.responder_role = 'admin' THEN a.username
                       ELSE u.uuid
                   END as responder_identifier
            FROM forum_replies r
            LEFT JOIN users u ON r.responder_role = 'user' AND r.user_id = u.id
            LEFT JOIN admins a ON r.responder_role = 'admin' AND r.admin_id = a.id
            WHERE r.question_id = ? AND r.status = 0
            ORDER BY r.created_at ASC
        `, [questionId]);

    res.json({
      status: 'success',
      data: {
        question: questions[0],
        replies
      }
    });
  } catch (error) {
    console.error('Error fetching question details:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Post a reply to a question
 * @async
 * @function postReply
 * @route POST /api/forum/questions/:id/reply
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Question ID
 * @param {Object} req.body
 * @param {string} req.body.content - Reply content
 * @param {Object} req.user - User object from auth middleware
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Created reply data
 * 
 * @throws {400} If content is missing
 * @throws {404} If question not found or closed
 * @throws {500} If server error occurs
 */
router.post('/questions/:id/reply', authenticateUser, async (req, res) => {
  try {
    const questionId = req.params.id;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content) {
      return res.status(400).json({
        status: 'error',
        message: 'Content is required'
      });
    }

    // Verify question exists and is not closed
    const [questions] = await pool.execute(
      'SELECT * FROM forum_questions WHERE id = ? AND status = 0',
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Question not found or closed'
      });
    }

    const [result] = await pool.execute(
      'INSERT INTO forum_replies (question_id, user_id, responder_role, content) VALUES (?, ?, "user", ?)',
      [questionId, userId, content]
    );

    // Log the activity
    await pool.execute(
      'INSERT INTO user_logs (user_id, action_type, action) VALUES (?, 1, "post_reply")',
      [userId]
    );

    res.status(201).json({
      status: 'success',
      data: {
        id: result.insertId,
        question_id: questionId,
        content,
        responder_role: 'user'
      }
    });
  } catch (error) {
    console.error('Error posting reply:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router; 