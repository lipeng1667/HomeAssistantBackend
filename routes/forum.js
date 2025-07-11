/**
 * @file forum.js
 * @description Forum routes for managing topics, replies, and interactions
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-07-10
 * 
 * This file handles all forum-related routes including topic management,
 * reply handling, like/unlike functionality, search, categories, and drafts.
 * 
 * Modification Log:
 * - 2025-06-17: Initial implementation with question/reply system
 * - 2025-07-10: Complete rewrite to match API specification with topics/replies
 * 
 * Routes:
 * - GET /api/forum/topics: List all topics with pagination
 * - GET /api/forum/topics/:id: Get topic details with replies
 * - POST /api/forum/topics: Create a new topic
 * - PUT /api/forum/topics/:id: Update topic (author only)
 * - DELETE /api/forum/topics/:id: Delete topic (author only)
 * - GET /api/forum/topics/:id/replies: Get replies for a topic
 * - POST /api/forum/topics/:id/replies: Add reply to topic
 * - PUT /api/forum/replies/:id: Update reply (author only)
 * - DELETE /api/forum/replies/:id: Delete reply (author only)
 * - POST /api/forum/topics/:id/like: Like/unlike topic
 * - POST /api/forum/replies/:id/like: Like/unlike reply
 * - GET /api/forum/search: Search topics and replies
 * - GET /api/forum/categories: Get available categories
 * - GET /api/forum/drafts: Get user's saved drafts
 * - POST /api/forum/drafts: Save/update draft
 * - DELETE /api/forum/drafts/:id: Delete draft
 * 
 * Dependencies:
 * - express: Web framework
 * - forumService: Business logic layer
 * - appAuth: App-level authentication
 * - userAuth: User-level authentication
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const forumService = require('../services/forumService');
const uploadService = require('../services/uploadService');
const { validateAppAuth } = require('../middleware/appAuth');
const { authenticateUser } = require('../middleware/userAuth');
const { validate, schemas } = require('../middleware/validation');

/**
 * @description Get all forum topics with pagination and filtering
 * @async
 * @function getTopics
 * @route GET /api/forum/topics
 * 
 * @param {Object} req.query - Query parameters
 * @param {number} req.query.page - Page number (default: 1)
 * @param {number} req.query.limit - Items per page (default: 20)
 * @param {string} req.query.category - Filter by category
 * @param {string} req.query.sort - Sort order: newest, oldest, popular, trending
 * @param {string} req.query.search - Search term
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Topics with pagination info
 * 
 * @throws {401} If authentication fails
 * @throws {500} If server error occurs
 */
router.get('/topics', validateAppAuth, async (req, res) => {
  try {
    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 50),
      category: req.query.category,
      sort: req.query.sort || 'newest',
      search: req.query.search
    };

    const result = await forumService.getTopics(filters);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Create new forum topic
 * @async
 * @function createTopic
 * @route POST /api/forum/topics
 * 
 * @param {Object} req.body
 * @param {number} req.body.user_id - Author user ID
 * @param {string} req.body.title - Topic title
 * @param {string} req.body.content - Topic content
 * @param {string} req.body.category - Topic category
 * @param {Array} req.body.images - Array of image URLs
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Created topic data
 * 
 * @throws {400} If required fields are missing
 * @throws {500} If server error occurs
 */
router.post('/topics', validateAppAuth, async (req, res) => {
  try {
    const { user_id, title, content, category, images } = req.body;

    if (!user_id || !title || !content || !category) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'user_id, title, content, and category are required' 
      });
    }

    if (title.length < 3 || title.length > 100) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Title must be between 3 and 100 characters' 
      });
    }

    if (content.length < 10 || content.length > 2000) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Content must be between 10 and 2000 characters' 
      });
    }

    if (images && images.length > 3) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Maximum 3 images allowed' 
      });
    }

    const result = await forumService.createTopic({
      user_id,
      title,
      content,
      category,
      images: images || []
    });

    res.status(201).json({
      status: 'success',
      data: {
        topic: result
      }
    });
  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * @description Get topic details with replies
 * @async
 * @function getTopicDetails
 * @route GET /api/forum/topics/:id
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Topic ID
 * @param {Object} req.query
 * @param {number} req.query.reply_page - Reply page number
 * @param {number} req.query.reply_limit - Replies per page
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Topic details and replies
 * 
 * @throws {404} If topic not found
 * @throws {500} If server error occurs
 */
router.get('/topics/:id', validateAppAuth, async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);
    const replyFilters = {
      reply_page: parseInt(req.query.reply_page) || 1,
      reply_limit: Math.min(parseInt(req.query.reply_limit) || 20, 50)
    };

    const result = await forumService.getTopicById(topicId, replyFilters);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error fetching topic details:', error);
    if (error.message === 'Topic not found') {
      res.status(404).json({
        status: 'error',
        message: 'Topic not found'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
});

/**
 * @description Update topic (author only)
 * @async
 * @function updateTopic
 * @route PUT /api/forum/topics/:id
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Topic ID
 * @param {Object} req.body
 * @param {number} req.body.user_id - Author user ID
 * @param {string} req.body.title - New title
 * @param {string} req.body.content - New content
 * @param {string} req.body.category - New category
 * @param {Array} req.body.images - New image URLs
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Updated topic data
 * 
 * @throws {400} If user_id is missing
 * @throws {403} If user is not the author
 * @throws {404} If topic not found
 * @throws {500} If server error occurs
 */
router.put('/topics/:id', validateAppAuth, async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);
    const { user_id, title, content, category, images } = req.body;

    if (!user_id) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id is required'
      });
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (category !== undefined) updates.category = category;
    if (images !== undefined) updates.images = images;

    const result = await forumService.updateTopic(topicId, user_id, updates);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error updating topic:', error);
    if (error.message.includes('Unauthorized')) {
      res.status(403).json({
        status: 'error',
        message: error.message
      });
    } else if (error.message === 'Topic not found') {
      res.status(404).json({
        status: 'error',
        message: 'Topic not found'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
});

/**
 * @description Delete topic (author only)
 * @async
 * @function deleteTopic
 * @route DELETE /api/forum/topics/:id
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Topic ID
 * @param {Object} req.body
 * @param {number} req.body.user_id - Author user ID
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {string} Response.message - Success message
 * 
 * @throws {400} If user_id is missing
 * @throws {403} If user is not the author
 * @throws {404} If topic not found
 * @throws {500} If server error occurs
 */
router.delete('/topics/:id', validateAppAuth, async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id is required'
      });
    }

    await forumService.deleteTopic(topicId, user_id);

    res.json({
      status: 'success',
      message: 'Topic deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    if (error.message.includes('Unauthorized')) {
      res.status(403).json({
        status: 'error',
        message: error.message
      });
    } else if (error.message === 'Topic not found') {
      res.status(404).json({
        status: 'error',
        message: 'Topic not found'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
});

/**
 * @description Get replies for a topic
 * @async
 * @function getReplies
 * @route GET /api/forum/topics/:id/replies
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Topic ID
 * @param {Object} req.query
 * @param {number} req.query.page - Page number
 * @param {number} req.query.limit - Items per page
 * @param {string} req.query.sort - Sort order
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Replies with pagination
 * 
 * @throws {500} If server error occurs
 */
router.get('/topics/:id/replies', validateAppAuth, async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);
    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 50),
      sort: req.query.sort || 'newest'
    };

    const result = await forumService.getReplies(topicId, filters);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error fetching replies:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Add reply to topic
 * @async
 * @function createReply
 * @route POST /api/forum/topics/:id/replies
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Topic ID
 * @param {Object} req.body
 * @param {number} req.body.user_id - Author user ID
 * @param {string} req.body.content - Reply content
 * @param {number} req.body.parent_reply_id - Parent reply ID for nested replies (optional)
 * @param {Array} req.body.images - Array of image URLs
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Created reply data
 * 
 * @throws {400} If required fields are missing
 * @throws {404} If topic not found
 * @throws {500} If server error occurs
 */
router.post('/topics/:id/replies', validateAppAuth, async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);
    const { user_id, content, parent_reply_id, images } = req.body;

    if (!user_id || !content) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id and content are required'
      });
    }

    if (content.length < 1 || content.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'Content must be between 1 and 1000 characters'
      });
    }

    if (images && images.length > 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Maximum 2 images allowed'
      });
    }

    const result = await forumService.createReply({
      topic_id: topicId,
      user_id,
      content,
      parent_reply_id,
      images: images || []
    });

    res.status(201).json({
      status: 'success',
      data: {
        reply: result
      }
    });
  } catch (error) {
    console.error('Error creating reply:', error);
    if (error.message === 'Topic not found or closed') {
      res.status(404).json({
        status: 'error',
        message: 'Topic not found or closed'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
});

/**
 * @description Update reply (author only)
 * @async
 * @function updateReply
 * @route PUT /api/forum/replies/:id
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Reply ID
 * @param {Object} req.body
 * @param {number} req.body.user_id - Author user ID
 * @param {string} req.body.content - New content
 * @param {Array} req.body.images - New image URLs
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Updated reply data
 * 
 * @throws {400} If required fields are missing
 * @throws {403} If user is not the author
 * @throws {404} If reply not found
 * @throws {500} If server error occurs
 */
router.put('/replies/:id', validateAppAuth, async (req, res) => {
  try {
    const replyId = parseInt(req.params.id);
    const { user_id, content, images } = req.body;

    if (!user_id || !content) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id and content are required'
      });
    }

    if (content.length < 1 || content.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'Content must be between 1 and 1000 characters'
      });
    }

    if (images && images.length > 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Maximum 2 images allowed'
      });
    }

    const result = await forumService.updateReply(replyId, user_id, {
      content,
      images
    });

    res.json({
      status: 'success',
      data: {
        reply: result
      }
    });
  } catch (error) {
    console.error('Error updating reply:', error);
    if (error.message.includes('Unauthorized')) {
      res.status(403).json({
        status: 'error',
        message: error.message
      });
    } else if (error.message === 'Reply not found') {
      res.status(404).json({
        status: 'error',
        message: 'Reply not found'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
});

/**
 * @description Delete reply (author only)
 * @async
 * @function deleteReply
 * @route DELETE /api/forum/replies/:id
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Reply ID
 * @param {Object} req.body
 * @param {number} req.body.user_id - Author user ID
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {string} Response.message - Success message
 * 
 * @throws {400} If user_id is missing
 * @throws {403} If user is not the author
 * @throws {404} If reply not found
 * @throws {500} If server error occurs
 */
router.delete('/replies/:id', validateAppAuth, async (req, res) => {
  try {
    const replyId = parseInt(req.params.id);
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id is required'
      });
    }

    await forumService.deleteReply(replyId, user_id);

    res.json({
      status: 'success',
      message: 'Reply deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting reply:', error);
    if (error.message.includes('Unauthorized')) {
      res.status(403).json({
        status: 'error',
        message: error.message
      });
    } else if (error.message === 'Reply not found') {
      res.status(404).json({
        status: 'error',
        message: 'Reply not found'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
});

/**
 * @description Toggle like status for topic
 * @async
 * @function toggleTopicLike
 * @route POST /api/forum/topics/:id/like
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Topic ID
 * @param {Object} req.body
 * @param {number} req.body.user_id - User ID
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Like status and count
 * 
 * @throws {400} If user_id is missing
 * @throws {500} If server error occurs
 */
router.post('/topics/:id/like', validateAppAuth, async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id is required'
      });
    }

    const result = await forumService.toggleTopicLike(topicId, user_id);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error toggling topic like:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Toggle like status for reply
 * @async
 * @function toggleReplyLike
 * @route POST /api/forum/replies/:id/like
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Reply ID
 * @param {Object} req.body
 * @param {number} req.body.user_id - User ID
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Like status and count
 * 
 * @throws {400} If user_id is missing
 * @throws {500} If server error occurs
 */
router.post('/replies/:id/like', validateAppAuth, async (req, res) => {
  try {
    const replyId = parseInt(req.params.id);
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id is required'
      });
    }

    const result = await forumService.toggleReplyLike(replyId, user_id);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error toggling reply like:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Search topics and replies
 * @async
 * @function searchContent
 * @route GET /api/forum/search
 * 
 * @param {Object} req.query
 * @param {string} req.query.q - Search query
 * @param {string} req.query.type - Search type: topics, replies, all
 * @param {string} req.query.category - Filter by category
 * @param {number} req.query.page - Page number
 * @param {number} req.query.limit - Items per page
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Search results with pagination
 * 
 * @throws {400} If query is missing or too short
 * @throws {500} If server error occurs
 */
router.get('/search', validateAppAuth, async (req, res) => {
  try {
    const { q, type, category, page, limit } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query must be at least 2 characters'
      });
    }

    const filters = {
      type: type || 'all',
      category,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 20, 50)
    };

    const result = await forumService.searchContent(q, filters);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error searching content:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Get available categories
 * @async
 * @function getCategories
 * @route GET /api/forum/categories
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Categories list
 * 
 * @throws {500} If server error occurs
 */
router.get('/categories', validateAppAuth, async (req, res) => {
  try {
    const categories = await forumService.getCategories();

    res.json({
      status: 'success',
      data: {
        categories
      }
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Get user's saved drafts
 * @async
 * @function getDrafts
 * @route GET /api/forum/drafts
 * 
 * @param {Object} req.query
 * @param {number} req.query.user_id - User ID
 * @param {string} req.query.type - Filter by type: topic, reply
 * @param {number} req.query.page - Page number
 * @param {number} req.query.limit - Items per page
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Drafts with pagination
 * 
 * @throws {400} If user_id is missing
 * @throws {500} If server error occurs
 */
router.get('/drafts', validateAppAuth, async (req, res) => {
  try {
    const { user_id, type, page, limit } = req.query;

    if (!user_id) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id is required'
      });
    }

    const filters = {
      type,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 50)
    };

    const result = await forumService.getDrafts(parseInt(user_id), filters);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error fetching drafts:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Save or update draft
 * @async
 * @function saveDraft
 * @route POST /api/forum/drafts
 * 
 * @param {Object} req.body
 * @param {number} req.body.user_id - User ID
 * @param {string} req.body.type - Draft type: topic, reply
 * @param {string} req.body.title - Draft title (for topics)
 * @param {string} req.body.content - Draft content
 * @param {string} req.body.category - Draft category (for topics)
 * @param {number} req.body.topic_id - Topic ID (for replies)
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Saved draft data
 * 
 * @throws {400} If required fields are missing
 * @throws {500} If server error occurs
 */
router.post('/drafts', validateAppAuth, async (req, res) => {
  try {
    const { user_id, type, title, content, category, topic_id } = req.body;

    if (!user_id || !type) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id and type are required'
      });
    }

    const result = await forumService.saveDraft({
      user_id,
      type,
      title,
      content,
      category,
      topic_id
    });

    res.json({
      status: 'success',
      data: {
        draft: result
      }
    });
  } catch (error) {
    console.error('Error saving draft:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Delete draft
 * @async
 * @function deleteDraft
 * @route DELETE /api/forum/drafts/:id
 * 
 * @param {Object} req.params
 * @param {string} req.params.id - Draft ID
 * @param {Object} req.body
 * @param {number} req.body.user_id - User ID
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {string} Response.message - Success message
 * 
 * @throws {400} If user_id is missing
 * @throws {403} If user is not the owner
 * @throws {404} If draft not found
 * @throws {500} If server error occurs
 */
router.delete('/drafts/:id', validateAppAuth, async (req, res) => {
  try {
    const draftId = parseInt(req.params.id);
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id is required'
      });
    }

    await forumService.deleteDraft(draftId, user_id);

    res.json({
      status: 'success',
      message: 'Draft deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting draft:', error);
    if (error.message === 'Draft not found or unauthorized') {
      res.status(404).json({
        status: 'error',
        message: 'Draft not found'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
});

// Configure multer for file uploads
const upload = multer({
  dest: 'temp/', // Temporary directory for uploads
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Single file per request
  },
  fileFilter: (req, file, cb) => {
    // Basic MIME type check (detailed validation in service)
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 'application/msword',
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
 * @description Upload file for forum topics/replies (instant upload)
 * @async
 * @function uploadFile
 * @route POST /api/forum/uploads
 * 
 * @param {Object} req.file - Uploaded file (from multer)
 * @param {Object} req.body
 * @param {number} req.body.user_id - User ID
 * @param {string} req.body.type - Upload type: topic, reply
 * @param {number} req.body.post_id - Associated post ID (optional)
 * 
 * @returns {Object} Response object
 * @returns {string} Response.status - Success/error status
 * @returns {Object} Response.data - Upload result with file info
 * 
 * @throws {400} If validation fails or file invalid
 * @throws {413} If file too large
 * @throws {415} If unsupported file type
 * @throws {500} If server error occurs
 */
router.post('/uploads', 
  validateAppAuth,
  upload.single('file'),
  (req, res, next) => {
    // Transform string fields to numbers for validation
    if (req.body.user_id) req.body.user_id = parseInt(req.body.user_id);
    if (req.body.post_id) req.body.post_id = parseInt(req.body.post_id);
    next();
  },
  validate(schemas.forumUpload),
  async (req, res) => {
    try {
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'No file uploaded'
        });
      }

      const { user_id, type, post_id } = req.body;

      // Process upload
      const result = await uploadService.uploadFile(req.file, {
        user_id,
        type,
        post_id
      });

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      
      // Handle specific error types
      if (error.message.includes('File size exceeds')) {
        res.status(413).json({
          status: 'error',
          message: error.message,
          error_code: 'FILE_TOO_LARGE'
        });
      } else if (error.message.includes('Unsupported file type')) {
        res.status(415).json({
          status: 'error',
          message: error.message,
          error_code: 'UNSUPPORTED_FILE_TYPE'
        });
      } else if (error.message.includes('Invalid')) {
        res.status(400).json({
          status: 'error',
          message: error.message,
          error_code: 'INVALID_FILE'
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Internal server error'
        });
      }
    }
  }
);

module.exports = router; 