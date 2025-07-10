/**
 * @file services/forumService.js
 * @description Forum service layer for topic, reply, and interaction management
 * @author Michael Lee
 * @created 2025-07-10
 * @modified 2025-07-10
 * 
 * This service provides forum business logic including topic management, reply handling,
 * like/unlike functionality, search capabilities, and draft management separated from HTTP concerns.
 * 
 * Modification Log:
 * - 2025-07-10: Initial implementation with complete forum functionality
 * 
 * Functions:
 * - getTopics(filters): Get paginated topics with filtering and sorting
 * - getTopicById(topicId, replyFilters): Get topic details with replies
 * - createTopic(topicData): Create new topic with admin review status
 * - updateTopic(topicId, userId, updates): Update topic (author only)
 * - deleteTopic(topicId, userId): Delete topic (author only) 
 * - getReplies(topicId, filters): Get paginated replies for topic
 * - createReply(replyData): Create new reply with admin review status
 * - updateReply(replyId, userId, updates): Update reply (author only)
 * - deleteReply(replyId, userId): Delete reply (author only)
 * - toggleTopicLike(topicId, userId): Toggle like status for topic
 * - toggleReplyLike(replyId, userId): Toggle like status for reply
 * - searchContent(query, filters): Search topics and replies
 * - getCategories(): Get all available categories
 * - getDrafts(userId, filters): Get user's saved drafts
 * - saveDraft(draftData): Save or update draft
 * - deleteDraft(draftId, userId): Delete draft (owner only)
 * - buildTopicQuery(filters): Build SQL query for topic filtering
 * - buildReplyQuery(filters): Build SQL query for reply filtering
 * - buildSearchQuery(query, filters): Build SQL query for search
 * - formatTopicResponse(topic): Format topic object for response
 * - formatReplyResponse(reply): Format reply object for response
 * - buildPagination(page, limit, totalItems): Build pagination metadata
 * 
 * Security Features:
 * - Author-only editing and deletion validation
 * - Admin review system for new content (status = -1)
 * - Parameterized queries to prevent SQL injection
 * - Input validation for all parameters
 * 
 * Dependencies:
 * - config/database.js: MySQL connection pool
 */

const pool = require('../config/database');

class ForumService {
  /**
   * Get paginated topics with filtering and sorting
   * @async
   * @function getTopics
   * @param {Object} filters - Filter parameters
   * @param {number} filters.page - Page number (default: 1)
   * @param {number} filters.limit - Items per page (default: 20)
   * @param {string} filters.category - Filter by category name
   * @param {string} filters.sort - Sort order: newest, oldest, popular, trending
   * @param {string} filters.search - Search term for title/content
   * @returns {Promise<Object>} Topics with pagination info
   * @throws {Error} Database query errors
   * @sideEffects None - read-only database operation
   */
  async getTopics(filters = {}) {
    const { page = 1, limit = 20, category, sort = 'newest', search } = filters;
    const offset = (page - 1) * limit;
    
    const { query, params } = this.buildTopicQuery({ category, sort, search, limit, offset });
    
    // Get total count for pagination
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY[\s\S]*?LIMIT[\s\S]*$/, '');
    const [countResult] = await pool.execute(countQuery, params.slice(0, -2)); // Remove limit and offset params
    const totalItems = countResult[0].total;
    
    // Get topics
    const [topics] = await pool.execute(query, params);
    
    // Format topics and build pagination
    const formattedTopics = topics.map(topic => this.formatTopicResponse(topic));
    const pagination = this.buildPagination(page, limit, totalItems);
    
    return {
      topics: formattedTopics,
      pagination
    };
  }

  /**
   * Get topic details with replies
   * @async
   * @function getTopicById
   * @param {number} topicId - Topic ID
   * @param {Object} replyFilters - Reply pagination filters
   * @param {number} replyFilters.reply_page - Reply page number
   * @param {number} replyFilters.reply_limit - Replies per page
   * @returns {Promise<Object>} Topic with replies and pagination
   * @throws {Error} Database query errors or topic not found
   * @sideEffects None - read-only database operation
   */
  async getTopicById(topicId, replyFilters = {}) {
    const { reply_page = 1, reply_limit = 20 } = replyFilters;
    
    // Get topic details
    const [topics] = await pool.execute(`
      SELECT t.*, c.name as category, u.username as author_name, u.id as author_id
      FROM forum_topics t
      JOIN forum_categories c ON t.category_id = c.id
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ? AND t.status = 0
    `, [topicId]);
    
    if (topics.length === 0) {
      throw new Error('Topic not found');
    }
    
    // Get replies with pagination
    const replyOffset = (reply_page - 1) * reply_limit;
    const [replies] = await pool.execute(`
      SELECT r.*, u.username as author_name, u.id as author_id
      FROM forum_replies r
      JOIN users u ON r.user_id = u.id
      WHERE r.topic_id = ? AND r.status = 0
      ORDER BY r.created_at ASC
      LIMIT ? OFFSET ?
    `, [topicId, reply_limit, replyOffset]);
    
    // Get total reply count
    const [replyCount] = await pool.execute(`
      SELECT COUNT(*) as total FROM forum_replies 
      WHERE topic_id = ? AND status = 0
    `, [topicId]);
    
    // Format responses
    const topic = this.formatTopicResponse(topics[0]);
    const formattedReplies = replies.map(reply => this.formatReplyResponse(reply));
    const replyPagination = this.buildPagination(reply_page, reply_limit, replyCount[0].total);
    
    return {
      topic,
      replies: formattedReplies,
      reply_pagination: replyPagination
    };
  }

  /**
   * Create new topic with admin review status
   * @async
   * @function createTopic
   * @param {Object} topicData - Topic creation data
   * @param {number} topicData.user_id - Author user ID
   * @param {string} topicData.title - Topic title
   * @param {string} topicData.content - Topic content
   * @param {string} topicData.category - Category name
   * @param {Array} topicData.images - Array of image URLs
   * @returns {Promise<Object>} Created topic info
   * @throws {Error} Database transaction errors
   * @sideEffects Creates topic record with status -1 (awaiting review)
   */
  async createTopic(topicData) {
    const { user_id, title, content, category, images = [] } = topicData;
    
    // Get category ID
    const [categories] = await pool.execute(`
      SELECT id FROM forum_categories WHERE name = ? AND status = 0
    `, [category]);
    
    if (categories.length === 0) {
      throw new Error('Invalid category');
    }
    
    const categoryId = categories[0].id;
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Create topic with status -1 (awaiting review)
      const [result] = await connection.execute(`
        INSERT INTO forum_topics (user_id, category_id, title, content, status)
        VALUES (?, ?, ?, ?, -1)
      `, [user_id, categoryId, title, content]);
      
      const topicId = result.insertId;
      
      // Handle image uploads if provided
      if (images.length > 0) {
        for (const imageUrl of images) {
          await connection.execute(`
            UPDATE forum_uploads 
            SET entity_type = 'topic', entity_id = ?, status = 1
            WHERE file_url = ? AND user_id = ?
          `, [topicId, imageUrl, user_id]);
        }
      }
      
      await connection.commit();
      
      return {
        id: topicId,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Update topic (author only)
   * @async
   * @function updateTopic
   * @param {number} topicId - Topic ID to update
   * @param {number} userId - User ID requesting update
   * @param {Object} updates - Fields to update
   * @param {string} updates.title - New title
   * @param {string} updates.content - New content
   * @param {string} updates.category - New category
   * @param {Array} updates.images - New image URLs
   * @returns {Promise<Object>} Updated topic data
   * @throws {Error} Authorization or database errors
   * @sideEffects Updates topic record and associated images
   */
  async updateTopic(topicId, userId, updates) {
    const { title, content, category, images } = updates;
    
    // Verify ownership
    const [topics] = await pool.execute(`
      SELECT user_id FROM forum_topics WHERE id = ? AND status = 0
    `, [topicId]);
    
    if (topics.length === 0) {
      throw new Error('Topic not found');
    }
    
    if (topics[0].user_id !== userId) {
      throw new Error('Unauthorized: You can only edit your own topics');
    }
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Build update query dynamically
      const updateFields = [];
      const updateParams = [];
      
      if (title !== undefined) {
        updateFields.push('title = ?');
        updateParams.push(title);
      }
      
      if (content !== undefined) {
        updateFields.push('content = ?');
        updateParams.push(content);
      }
      
      if (category !== undefined) {
        // Get category ID
        const [categories] = await connection.execute(`
          SELECT id FROM forum_categories WHERE name = ? AND status = 0
        `, [category]);
        
        if (categories.length === 0) {
          throw new Error('Invalid category');
        }
        
        updateFields.push('category_id = ?');
        updateParams.push(categories[0].id);
      }
      
      if (updateFields.length > 0) {
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        updateParams.push(topicId);
        
        await connection.execute(`
          UPDATE forum_topics SET ${updateFields.join(', ')} WHERE id = ?
        `, updateParams);
      }
      
      // Handle image updates if provided
      if (images !== undefined) {
        // Clear existing images
        await connection.execute(`
          UPDATE forum_uploads 
          SET entity_type = NULL, entity_id = NULL, status = 3
          WHERE entity_type = 'topic' AND entity_id = ?
        `, [topicId]);
        
        // Add new images
        for (const imageUrl of images) {
          await connection.execute(`
            UPDATE forum_uploads 
            SET entity_type = 'topic', entity_id = ?, status = 1
            WHERE file_url = ? AND user_id = ?
          `, [topicId, imageUrl, userId]);
        }
      }
      
      await connection.commit();
      
      // Return updated topic
      return await this.getTopicById(topicId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Delete topic (author only)
   * @async
   * @function deleteTopic
   * @param {number} topicId - Topic ID to delete
   * @param {number} userId - User ID requesting deletion
   * @returns {Promise<boolean>} True if deletion successful
   * @throws {Error} Authorization or database errors
   * @sideEffects Sets topic status to 1 (deleted)
   */
  async deleteTopic(topicId, userId) {
    // Verify ownership
    const [topics] = await pool.execute(`
      SELECT user_id FROM forum_topics WHERE id = ? AND status = 0
    `, [topicId]);
    
    if (topics.length === 0) {
      throw new Error('Topic not found');
    }
    
    if (topics[0].user_id !== userId) {
      throw new Error('Unauthorized: You can only delete your own topics');
    }
    
    // Soft delete by setting status to 1
    await pool.execute(`
      UPDATE forum_topics SET status = 1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [topicId]);
    
    return true;
  }

  /**
   * Get paginated replies for a topic
   * @async
   * @function getReplies
   * @param {number} topicId - Topic ID
   * @param {Object} filters - Reply filters
   * @param {number} filters.page - Page number
   * @param {number} filters.limit - Items per page
   * @param {string} filters.sort - Sort order: newest, oldest, popular
   * @returns {Promise<Object>} Replies with pagination
   * @throws {Error} Database query errors
   * @sideEffects None - read-only database operation
   */
  async getReplies(topicId, filters = {}) {
    const { page = 1, limit = 20, sort = 'newest' } = filters;
    const offset = (page - 1) * limit;
    
    // Build sort clause
    let sortClause = 'ORDER BY r.created_at ASC';
    if (sort === 'newest') sortClause = 'ORDER BY r.created_at DESC';
    if (sort === 'oldest') sortClause = 'ORDER BY r.created_at ASC';
    if (sort === 'popular') sortClause = 'ORDER BY r.like_count DESC, r.created_at DESC';
    
    // Get replies
    const [replies] = await pool.execute(`
      SELECT r.*, u.username as author_name, u.id as author_id
      FROM forum_replies r
      JOIN users u ON r.user_id = u.id
      WHERE r.topic_id = ? AND r.status = 0
      ${sortClause}
      LIMIT ? OFFSET ?
    `, [topicId, limit, offset]);
    
    // Get total count
    const [countResult] = await pool.execute(`
      SELECT COUNT(*) as total FROM forum_replies 
      WHERE topic_id = ? AND status = 0
    `, [topicId]);
    
    const totalItems = countResult[0].total;
    const formattedReplies = replies.map(reply => this.formatReplyResponse(reply));
    const pagination = this.buildPagination(page, limit, totalItems);
    
    return {
      replies: formattedReplies,
      pagination
    };
  }

  /**
   * Create new reply with admin review status
   * @async
   * @function createReply
   * @param {Object} replyData - Reply creation data
   * @param {number} replyData.topic_id - Parent topic ID
   * @param {number} replyData.user_id - Author user ID
   * @param {string} replyData.content - Reply content
   * @param {Array} replyData.images - Array of image URLs
   * @returns {Promise<Object>} Created reply info
   * @throws {Error} Database transaction errors
   * @sideEffects Creates reply record with status -1 (awaiting review)
   */
  async createReply(replyData) {
    const { topic_id, user_id, content, images = [] } = replyData;
    
    // Verify topic exists and is not deleted
    const [topics] = await pool.execute(`
      SELECT id FROM forum_topics WHERE id = ? AND status = 0
    `, [topic_id]);
    
    if (topics.length === 0) {
      throw new Error('Topic not found or closed');
    }
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Create reply with status -1 (awaiting review)
      const [result] = await connection.execute(`
        INSERT INTO forum_replies (topic_id, user_id, content, status)
        VALUES (?, ?, ?, -1)
      `, [topic_id, user_id, content]);
      
      const replyId = result.insertId;
      
      // Handle image uploads if provided
      if (images.length > 0) {
        for (const imageUrl of images) {
          await connection.execute(`
            UPDATE forum_uploads 
            SET entity_type = 'reply', entity_id = ?, status = 1
            WHERE file_url = ? AND user_id = ?
          `, [replyId, imageUrl, user_id]);
        }
      }
      
      await connection.commit();
      
      return {
        id: replyId,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Update reply (author only)
   * @async
   * @function updateReply
   * @param {number} replyId - Reply ID to update
   * @param {number} userId - User ID requesting update
   * @param {Object} updates - Fields to update
   * @param {string} updates.content - New content
   * @param {Array} updates.images - New image URLs
   * @returns {Promise<Object>} Updated reply data
   * @throws {Error} Authorization or database errors
   * @sideEffects Updates reply record and associated images
   */
  async updateReply(replyId, userId, updates) {
    const { content, images } = updates;
    
    // Verify ownership
    const [replies] = await pool.execute(`
      SELECT user_id FROM forum_replies WHERE id = ? AND status = 0
    `, [replyId]);
    
    if (replies.length === 0) {
      throw new Error('Reply not found');
    }
    
    if (replies[0].user_id !== userId) {
      throw new Error('Unauthorized: You can only edit your own replies');
    }
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Update content if provided
      if (content !== undefined) {
        await connection.execute(`
          UPDATE forum_replies SET content = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [content, replyId]);
      }
      
      // Handle image updates if provided
      if (images !== undefined) {
        // Clear existing images
        await connection.execute(`
          UPDATE forum_uploads 
          SET entity_type = NULL, entity_id = NULL, status = 3
          WHERE entity_type = 'reply' AND entity_id = ?
        `, [replyId]);
        
        // Add new images
        for (const imageUrl of images) {
          await connection.execute(`
            UPDATE forum_uploads 
            SET entity_type = 'reply', entity_id = ?, status = 1
            WHERE file_url = ? AND user_id = ?
          `, [replyId, imageUrl, userId]);
        }
      }
      
      await connection.commit();
      
      // Return updated reply
      const [updatedReply] = await connection.execute(`
        SELECT r.*, u.username as author_name, u.id as author_id
        FROM forum_replies r
        JOIN users u ON r.user_id = u.id
        WHERE r.id = ?
      `, [replyId]);
      
      return this.formatReplyResponse(updatedReply[0]);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Delete reply (author only)
   * @async
   * @function deleteReply
   * @param {number} replyId - Reply ID to delete
   * @param {number} userId - User ID requesting deletion
   * @returns {Promise<boolean>} True if deletion successful
   * @throws {Error} Authorization or database errors
   * @sideEffects Sets reply status to 1 (deleted)
   */
  async deleteReply(replyId, userId) {
    // Verify ownership
    const [replies] = await pool.execute(`
      SELECT user_id FROM forum_replies WHERE id = ? AND status = 0
    `, [replyId]);
    
    if (replies.length === 0) {
      throw new Error('Reply not found');
    }
    
    if (replies[0].user_id !== userId) {
      throw new Error('Unauthorized: You can only delete your own replies');
    }
    
    // Soft delete by setting status to 1
    await pool.execute(`
      UPDATE forum_replies SET status = 1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [replyId]);
    
    return true;
  }

  /**
   * Toggle like status for topic
   * @async
   * @function toggleTopicLike
   * @param {number} topicId - Topic ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} New like status and count
   * @throws {Error} Database transaction errors
   * @sideEffects Adds/removes like record, triggers update like_count
   */
  async toggleTopicLike(topicId, userId) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Check if already liked
      const [existingLike] = await connection.execute(`
        SELECT id FROM forum_topic_likes WHERE topic_id = ? AND user_id = ?
      `, [topicId, userId]);
      
      let isLiked;
      
      if (existingLike.length > 0) {
        // Remove like
        await connection.execute(`
          DELETE FROM forum_topic_likes WHERE topic_id = ? AND user_id = ?
        `, [topicId, userId]);
        isLiked = false;
      } else {
        // Add like
        await connection.execute(`
          INSERT INTO forum_topic_likes (topic_id, user_id) VALUES (?, ?)
        `, [topicId, userId]);
        isLiked = true;
      }
      
      // Get updated like count
      const [topicData] = await connection.execute(`
        SELECT like_count FROM forum_topics WHERE id = ?
      `, [topicId]);
      
      await connection.commit();
      
      return {
        is_liked: isLiked,
        like_count: topicData[0].like_count
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Toggle like status for reply
   * @async
   * @function toggleReplyLike
   * @param {number} replyId - Reply ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} New like status and count
   * @throws {Error} Database transaction errors
   * @sideEffects Adds/removes like record, triggers update like_count
   */
  async toggleReplyLike(replyId, userId) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Check if already liked
      const [existingLike] = await connection.execute(`
        SELECT id FROM forum_reply_likes WHERE reply_id = ? AND user_id = ?
      `, [replyId, userId]);
      
      let isLiked;
      
      if (existingLike.length > 0) {
        // Remove like
        await connection.execute(`
          DELETE FROM forum_reply_likes WHERE reply_id = ? AND user_id = ?
        `, [replyId, userId]);
        isLiked = false;
      } else {
        // Add like
        await connection.execute(`
          INSERT INTO forum_reply_likes (reply_id, user_id) VALUES (?, ?)
        `, [replyId, userId]);
        isLiked = true;
      }
      
      // Get updated like count
      const [replyData] = await connection.execute(`
        SELECT like_count FROM forum_replies WHERE id = ?
      `, [replyId]);
      
      await connection.commit();
      
      return {
        is_liked: isLiked,
        like_count: replyData[0].like_count
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Search topics and replies by keyword
   * @async
   * @function searchContent
   * @param {string} query - Search query
   * @param {Object} filters - Search filters
   * @param {string} filters.type - Search type: topics, replies, all
   * @param {string} filters.category - Filter by category
   * @param {number} filters.page - Page number
   * @param {number} filters.limit - Items per page
   * @returns {Promise<Object>} Search results with pagination
   * @throws {Error} Database query errors
   * @sideEffects None - read-only database operation
   */
  async searchContent(query, filters = {}) {
    const { type = 'all', category, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let searchQuery = '';
    const params = [];
    
    // Build search query based on type
    if (type === 'topics' || type === 'all') {
      searchQuery += `
        SELECT t.id, 'topic' as type, t.title, t.content, c.name as category,
               u.username as author_name, u.id as author_id, NULL as topic_id,
               t.like_count, t.reply_count, t.created_at, t.updated_at,
               1.0 as relevance_score
        FROM forum_topics t
        JOIN forum_categories c ON t.category_id = c.id
        JOIN users u ON t.user_id = u.id
        WHERE t.status = 0 AND (t.title LIKE ? OR t.content LIKE ?)
      `;
      
      if (category) {
        searchQuery += ' AND c.name = ?';
        params.push(`%${query}%`, `%${query}%`, category);
      } else {
        params.push(`%${query}%`, `%${query}%`);
      }
    }
    
    if (type === 'replies' || type === 'all') {
      if (searchQuery) searchQuery += ' UNION ALL ';
      
      searchQuery += `
        SELECT r.id, 'reply' as type, NULL as title, r.content, c.name as category,
               u.username as author_name, u.id as author_id, r.topic_id,
               r.like_count, NULL as reply_count, r.created_at, r.updated_at,
               1.0 as relevance_score
        FROM forum_replies r
        JOIN forum_topics t ON r.topic_id = t.id
        JOIN forum_categories c ON t.category_id = c.id
        JOIN users u ON r.user_id = u.id
        WHERE r.status = 0 AND r.content LIKE ?
      `;
      
      if (category) {
        searchQuery += ' AND c.name = ?';
        params.push(`%${query}%`, category);
      } else {
        params.push(`%${query}%`);
      }
    }
    
    // Add ordering and pagination
    searchQuery += ' ORDER BY relevance_score DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    // Execute search
    const [results] = await pool.execute(searchQuery, params);
    
    // Get total count (simplified for demo)
    const totalItems = results.length; // In production, run separate count query
    
    // Format results
    const formattedResults = results.map(result => ({
      id: result.id,
      type: result.type,
      title: result.title,
      content: result.content,
      category: result.category,
      author: {
        id: result.author_id,
        name: result.author_name
      },
      topic_id: result.topic_id,
      like_count: result.like_count,
      reply_count: result.reply_count,
      relevance_score: result.relevance_score,
      created_at: result.created_at,
      updated_at: result.updated_at
    }));
    
    const pagination = this.buildPagination(page, limit, totalItems);
    
    return {
      results: formattedResults,
      pagination,
      search_info: {
        query,
        total_results: totalItems,
        search_time: 0.1, // Placeholder
        filters_applied: { category, type }
      }
    };
  }

  /**
   * Get all available categories
   * @async
   * @function getCategories
   * @returns {Promise<Array>} List of categories
   * @throws {Error} Database query errors
   * @sideEffects None - read-only database operation
   */
  async getCategories() {
    const [categories] = await pool.execute(`
      SELECT c.id, c.name, c.description, c.icon,
             COUNT(t.id) as topic_count
      FROM forum_categories c
      LEFT JOIN forum_topics t ON c.id = t.category_id AND t.status = 0
      WHERE c.status = 0
      GROUP BY c.id, c.name, c.description, c.icon
      ORDER BY c.sort_order, c.name
    `);
    
    return categories;
  }

  /**
   * Get user's saved drafts
   * @async
   * @function getDrafts
   * @param {number} userId - User ID
   * @param {Object} filters - Draft filters
   * @param {string} filters.type - Filter by type: topic, reply
   * @param {number} filters.page - Page number
   * @param {number} filters.limit - Items per page
   * @returns {Promise<Object>} Drafts with pagination
   * @throws {Error} Database query errors
   * @sideEffects None - read-only database operation
   */
  async getDrafts(userId, filters = {}) {
    const { type } = filters;
    
    // Get topic draft (only one per user)
    let topicDraft = null;
    if (!type || type === 'topic') {
      const [topicDrafts] = await pool.execute(`
        SELECT d.*, c.name as category
        FROM forum_drafts d
        LEFT JOIN forum_categories c ON d.category_id = c.id
        WHERE d.user_id = ? AND d.type = 'topic'
      `, [userId]);
      
      topicDraft = topicDrafts.length > 0 ? topicDrafts[0] : null;
    }
    
    // Get reply drafts
    let replyDrafts = [];
    if (!type || type === 'reply') {
      const [drafts] = await pool.execute(`
        SELECT d.*, t.title as topic_title
        FROM forum_drafts d
        JOIN forum_topics t ON d.topic_id = t.id
        WHERE d.user_id = ? AND d.type = 'reply'
        ORDER BY d.updated_at DESC
      `, [userId]);
      
      replyDrafts = drafts;
    }
    
    return {
      topic_draft: topicDraft,
      reply_drafts: replyDrafts
    };
  }

  /**
   * Save or update draft
   * @async
   * @function saveDraft
   * @param {Object} draftData - Draft data
   * @param {number} draftData.user_id - User ID
   * @param {string} draftData.type - Draft type: topic, reply
   * @param {string} draftData.title - Draft title (for topics)
   * @param {string} draftData.content - Draft content
   * @param {string} draftData.category - Draft category (for topics)
   * @param {number} draftData.topic_id - Topic ID (for replies)
   * @returns {Promise<Object>} Saved draft info
   * @throws {Error} Database transaction errors
   * @sideEffects Creates or updates draft record
   */
  async saveDraft(draftData) {
    const { user_id, type, title, content, category, topic_id } = draftData;
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      let categoryId = null;
      if (type === 'topic' && category) {
        const [categories] = await connection.execute(`
          SELECT id FROM forum_categories WHERE name = ? AND status = 0
        `, [category]);
        
        if (categories.length > 0) {
          categoryId = categories[0].id;
        }
      }
      
      // Use INSERT ... ON DUPLICATE KEY UPDATE for upsert
      const [result] = await connection.execute(`
        INSERT INTO forum_drafts (user_id, type, topic_id, title, content, category_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        content = VALUES(content),
        category_id = VALUES(category_id),
        updated_at = CURRENT_TIMESTAMP
      `, [user_id, type, topic_id, title, content, categoryId]);
      
      await connection.commit();
      
      return {
        id: result.insertId || result.affectedRows,
        user_id,
        type,
        title,
        content,
        category,
        topic_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Delete draft (owner only)
   * @async
   * @function deleteDraft
   * @param {number} draftId - Draft ID
   * @param {number} userId - User ID requesting deletion
   * @returns {Promise<boolean>} True if deletion successful
   * @throws {Error} Authorization or database errors
   * @sideEffects Deletes draft record
   */
  async deleteDraft(draftId, userId) {
    const [result] = await pool.execute(`
      DELETE FROM forum_drafts WHERE id = ? AND user_id = ?
    `, [draftId, userId]);
    
    if (result.affectedRows === 0) {
      throw new Error('Draft not found or unauthorized');
    }
    
    return true;
  }

  /**
   * Build SQL query for topic filtering
   * @function buildTopicQuery
   * @param {Object} filters - Filter parameters
   * @returns {Object} Query string and parameters
   * @sideEffects None - pure function
   */
  buildTopicQuery(filters) {
    const { category, sort, search, limit, offset } = filters;
    let query = `
      SELECT t.*, c.name as category, u.username as author_name, u.id as author_id
      FROM forum_topics t
      JOIN forum_categories c ON t.category_id = c.id
      JOIN users u ON t.user_id = u.id
      WHERE t.status = 0
    `;
    
    const params = [];
    
    if (category) {
      query += ' AND c.name = ?';
      params.push(category);
    }
    
    if (search) {
      query += ' AND (t.title LIKE ? OR t.content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    // Add sorting
    switch (sort) {
      case 'oldest':
        query += ' ORDER BY t.created_at ASC';
        break;
      case 'popular':
        query += ' ORDER BY t.like_count DESC, t.created_at DESC';
        break;
      case 'trending':
        query += ' ORDER BY t.view_count DESC, t.created_at DESC';
        break;
      default: // newest
        query += ' ORDER BY t.created_at DESC';
    }
    
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return { query, params };
  }

  /**
   * Format topic object for API response
   * @function formatTopicResponse
   * @param {Object} topic - Raw topic data from database
   * @returns {Object} Formatted topic object
   * @sideEffects None - pure function
   */
  formatTopicResponse(topic) {
    return {
      id: topic.id,
      title: topic.title,
      content: topic.content,
      category: topic.category,
      author: {
        id: topic.author_id,
        name: topic.author_name
      },
      reply_count: topic.reply_count,
      like_count: topic.like_count,
      status: topic.status,
      images: [], // TODO: Implement image fetching
      created_at: topic.created_at,
      updated_at: topic.updated_at
    };
  }

  /**
   * Format reply object for API response
   * @function formatReplyResponse
   * @param {Object} reply - Raw reply data from database
   * @returns {Object} Formatted reply object
   * @sideEffects None - pure function
   */
  formatReplyResponse(reply) {
    return {
      id: reply.id,
      content: reply.content,
      author: {
        id: reply.author_id,
        name: reply.author_name
      },
      like_count: reply.like_count,
      is_liked: false, // TODO: Implement user-specific like status
      images: [], // TODO: Implement image fetching
      created_at: reply.created_at,
      updated_at: reply.updated_at
    };
  }

  /**
   * Build pagination metadata
   * @function buildPagination
   * @param {number} page - Current page
   * @param {number} limit - Items per page
   * @param {number} totalItems - Total item count
   * @returns {Object} Pagination metadata
   * @sideEffects None - pure function
   */
  buildPagination(page, limit, totalItems) {
    const totalPages = Math.ceil(totalItems / limit);
    
    return {
      current_page: page,
      total_pages: totalPages,
      total_items: totalItems,
      has_next: page < totalPages,
      has_previous: page > 1
    };
  }
}

module.exports = new ForumService();