/**
 * @file services/forumService.js
 * @description Forum service layer for topic, reply, and interaction management
 * @author Michael Lee
 * @created 2025-07-10
 * @modified 2025-07-11
 * 
 * This service provides forum business logic including topic management, reply handling,
 * like/unlike functionality, search capabilities, and draft management separated from HTTP concerns.
 * 
 * Modification Log:
 * - 2025-07-10: Initial implementation with complete forum functionality
 * - 2025-07-11: Added image retrieval integration with upload service
 * - 2025-07-11: Implemented hierarchical reply sorting and removed parent_reply field
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
 * - fetchImagesByEntity(entityType, entityIds): Batch fetch images for entities
 * - sortRepliesHierarchically(replies): Sort replies in hierarchical order
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
   * @description Batch fetch images for multiple entities
   * @async
   * @function fetchImagesByEntity
   * @param {string} entityType - Entity type ('topic' or 'reply')
   * @param {Array<number>} entityIds - Array of entity IDs
   * @returns {Promise<Object>} Object with entityId as key and images array as value
   * @throws {Error} If database query fails
   */
  async fetchImagesByEntity(entityType, entityIds) {
    if (!entityIds || entityIds.length === 0) {
      return {};
    }

    try {
      const placeholders = entityIds.map(() => '?').join(',');
      const query = `
        SELECT entity_id, file_url, original_filename, file_size, mime_type, created_at
        FROM forum_uploads 
        WHERE entity_type = ? AND entity_id IN (${placeholders}) AND status = 1
        ORDER BY created_at ASC
      `;
      
      const [rows] = await pool.execute(query, [entityType, ...entityIds]);
      
      // Group images by entity_id
      const imagesByEntity = {};
      for (const row of rows) {
        const entityId = row.entity_id;
        if (!imagesByEntity[entityId]) {
          imagesByEntity[entityId] = [];
        }
        imagesByEntity[entityId].push({
          url: row.file_url.replace('/uploads', 'http://47.94.108.189'),
          filename: row.original_filename,
          size: row.file_size,
          mime_type: row.mime_type,
          uploaded_at: row.created_at
        });
      }
      
      return imagesByEntity;
    } catch (error) {
      console.error('Error fetching images by entity:', error);
      throw error;
    }
  }

  /**
   * @description Sort replies in hierarchical order for threaded display
   * @function sortRepliesHierarchically
   * @param {Array} replies - Flat array of reply objects
   * @returns {Array} Hierarchically sorted array with parent -> children ordering
   * @sideEffects None - pure function
   */
  sortRepliesHierarchically(replies) {
    if (!replies || replies.length === 0) {
      return [];
    }

    // Create maps for efficient lookup
    const replyMap = new Map();
    const childrenMap = new Map();
    
    // Index all replies by ID and group children by parent_reply_id
    for (const reply of replies) {
      replyMap.set(reply.id, reply);
      
      const parentId = reply.parent_reply_id;
      if (parentId !== null && parentId !== undefined) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId).push(reply);
      }
    }
    
    // Sort children arrays by creation time for consistent ordering
    for (const children of childrenMap.values()) {
      children.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    
    const result = [];
    const visited = new Set();
    
    /**
     * Depth-first traversal to build hierarchical order
     * @param {Object} reply - Current reply to process
     */
    function addReplyWithChildren(reply) {
      if (visited.has(reply.id)) {
        return; // Prevent infinite loops in case of circular references
      }
      
      visited.add(reply.id);
      result.push(reply);
      
      // Add all children of this reply
      const children = childrenMap.get(reply.id) || [];
      for (const child of children) {
        addReplyWithChildren(child);
      }
    }
    
    // Find all top-level replies (parent_reply_id is null) and sort by creation time
    const topLevelReplies = replies
      .filter(reply => reply.parent_reply_id === null || reply.parent_reply_id === undefined)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    // Process each top-level reply and its descendants
    for (const topReply of topLevelReplies) {
      addReplyWithChildren(topReply);
    }
    
    return result;
  }

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
   * @param {number} filters.user_id - Include user's under-review content and prioritize at top
   * @returns {Promise<Object>} Topics with pagination info
   * @throws {Error} Database query errors
   * @sideEffects None - read-only database operation
   */
  async getTopics(filters = {}) {
    const { page = 1, limit = 20, category, sort = 'newest', search, user_id } = filters;
    const offset = (page - 1) * limit;
    
    const { query, params } = this.buildTopicQuery({ category, sort, search, user_id, limit, offset });
    
    // Get total count for pagination
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY[\s\S]*?LIMIT[\s\S]*$/, '');
    const countParams = params.slice(0, -2); // Remove limit and offset params
    const [countResult] = await pool.execute(countQuery, countParams);
    const totalItems = countResult[0].total;
    
    // Get topics
    const [topics] = await pool.execute(query, params);
    
    // Fetch images for all topics
    const topicIds = topics.map(topic => topic.id);
    const imagesByTopic = await this.fetchImagesByEntity('topic', topicIds);
    
    // Format topics and build pagination
    const formattedTopics = topics.map(topic => this.formatTopicResponse(topic, imagesByTopic[topic.id] || []));
    const pagination = this.buildPagination(page, limit, totalItems);
    
    return {
      topics: formattedTopics,
      pagination
    };
  }

  /**
   * Get topic details with hierarchically sorted replies
   * @async
   * @function getTopicById
   * @param {number} topicId - Topic ID
   * @param {Object} replyFilters - Reply filters (pagination removed for hierarchical sorting)
   * @param {number} replyFilters.user_id - Include user's under-review replies and prioritize at top
   * @returns {Promise<Object>} Topic with hierarchically sorted replies
   * @throws {Error} Database query errors or topic not found
   * @sideEffects None - read-only database operation
   */
  async getTopicById(topicId, replyFilters = {}) {
    const { user_id } = replyFilters;
    
    // Get topic details - include user's own under-review topics if user_id provided
    let topicQuery = `
      SELECT t.*, c.name as category, u.username as author_name, u.id as author_id, u.status as author_status
      FROM forum_topics t
      JOIN forum_categories c ON t.category_id = c.id
      JOIN users u ON t.user_id = u.id AND u.status >= 0
      WHERE t.id = ?
    `;
    let topicParams = [topicId];
    
    if (user_id) {
      // Include user's own under-review topics AND all published topics
      topicQuery += ' AND (t.status = 0 OR (t.status = -1 AND t.user_id = ?))';
      topicParams.push(user_id);
    } else {
      // Only published topics
      topicQuery += ' AND t.status = 0';
    }
    
    const [topics] = await pool.execute(topicQuery, topicParams);
    
    if (topics.length === 0) {
      throw new Error('Topic not found');
    }
    
    // Build WHERE clause for user-specific replies
    let whereClause = 'WHERE r.topic_id = ?';
    let queryParams = [topicId];
    
    if (user_id) {
      // Include user's own under-review replies AND all published replies
      whereClause += ' AND (r.status = 0 OR (r.status = -1 AND r.user_id = ?))';
      queryParams.push(user_id);
    } else {
      // Only published replies
      whereClause += ' AND r.status = 0';
    }
    
    // Get all replies for hierarchical sorting
    const [replies] = await pool.execute(`
      SELECT r.*, u.username as author_name, u.id as author_id, u.status as author_status
      FROM forum_replies r
      JOIN users u ON r.user_id = u.id AND u.status >= 0
      ${whereClause}
      ORDER BY r.created_at ASC
    `, queryParams);
    
    // Fetch images for topic and replies
    const topicImages = await this.fetchImagesByEntity('topic', [topicId]);
    const replyIds = replies.map(reply => reply.id);
    const imagesByReply = await this.fetchImagesByEntity('reply', replyIds);
    
    // Format and sort replies hierarchically
    const formattedReplies = replies.map(reply => this.formatReplyResponse(reply, imagesByReply[reply.id] || []));
    const hierarchicalReplies = this.sortRepliesHierarchically(formattedReplies);
    
    // Use hierarchical ordering (user prioritization would break parent-child relationships)
    const finalReplies = hierarchicalReplies;
    
    // Format topic response
    const topic = this.formatTopicResponse(topics[0], topicImages[topicId] || []);
    
    return {
      topic,
      replies: finalReplies,
      total_replies: replies.length
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
          // Convert full URL back to database format
          const dbImageUrl = imageUrl.replace('http://47.94.108.189', '/uploads');
          await connection.execute(`
            UPDATE forum_uploads 
            SET entity_type = 'topic', entity_id = ?, status = 1
            WHERE file_url = ? AND user_id = ?
          `, [topicId, dbImageUrl, user_id]);
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
    
    // Verify ownership - allow editing of user's own topics regardless of status
    const [topics] = await pool.execute(`
      SELECT user_id FROM forum_topics WHERE id = ? AND status IN (-1, 0)
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
        // Clear existing images by marking as deleted
        await connection.execute(`
          UPDATE forum_uploads 
          SET status = 3
          WHERE entity_type = 'topic' AND entity_id = ?
        `, [topicId]);
        
        // Add new images
        for (const imageUrl of images) {
          // Convert full URL back to database format
          const dbImageUrl = imageUrl.replace('http://47.94.108.189', '/uploads');
          await connection.execute(`
            UPDATE forum_uploads 
            SET entity_type = 'topic', entity_id = ?, status = 1
            WHERE file_url = ? AND user_id = ?
          `, [topicId, dbImageUrl, userId]);
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
    // Verify ownership - allow deletion of user's own topics regardless of status
    const [topics] = await pool.execute(`
      SELECT user_id FROM forum_topics WHERE id = ? AND status IN (-1, 0)
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
   * @param {number} filters.user_id - Include user's under-review replies and prioritize at top
   * @returns {Promise<Object>} Replies with pagination
   * @throws {Error} Database query errors
   * @sideEffects None - read-only database operation
   */
  async getReplies(topicId, filters = {}) {
    const { page = 1, limit = 20, sort = 'newest', user_id } = filters;
    const offset = (page - 1) * limit;
    
    // Build WHERE clause for user-specific content
    let whereClause = 'WHERE r.topic_id = ?';
    let queryParams = [topicId];
    
    if (user_id) {
      // Include user's own under-review replies AND all published replies
      whereClause += ' AND (r.status = 0 OR (r.status = -1 AND r.user_id = ?))';
      queryParams.push(user_id);
    } else {
      // Only published replies
      whereClause += ' AND r.status = 0';
    }
    
    // Build sort clause with user prioritization
    let sortClause;
    if (user_id) {
      // Prioritize user's content at top, then apply normal sorting
      if (sort === 'newest') {
        sortClause = 'ORDER BY (r.user_id = ?) DESC, r.created_at DESC';
      } else if (sort === 'oldest') {
        sortClause = 'ORDER BY (r.user_id = ?) DESC, r.created_at ASC';
      } else if (sort === 'popular') {
        sortClause = 'ORDER BY (r.user_id = ?) DESC, r.like_count DESC, r.created_at DESC';
      } else {
        sortClause = 'ORDER BY (r.user_id = ?) DESC, r.created_at ASC';
      }
      queryParams.push(user_id);
    } else {
      // Normal sorting without user prioritization
      if (sort === 'newest') sortClause = 'ORDER BY r.created_at DESC';
      else if (sort === 'oldest') sortClause = 'ORDER BY r.created_at ASC';
      else if (sort === 'popular') sortClause = 'ORDER BY r.like_count DESC, r.created_at DESC';
      else sortClause = 'ORDER BY r.created_at ASC';
    }
    
    // Get replies with simplified query
    const [replies] = await pool.execute(`
      SELECT r.*, u.username as author_name, u.id as author_id, u.status as author_status
      FROM forum_replies r
      JOIN users u ON r.user_id = u.id AND u.status >= 0
      ${whereClause}
      ${sortClause}
      LIMIT ? OFFSET ?
    `, [...queryParams, limit, offset]);
    
    // Get total count with same WHERE clause
    const countParams = user_id ? [topicId, user_id] : [topicId];
    const [countResult] = await pool.execute(`
      SELECT COUNT(*) as total FROM forum_replies r
      ${whereClause}
    `, countParams);
    
    const totalItems = countResult[0].total;
    
    // Fetch images for all replies
    const replyIds = replies.map(reply => reply.id);
    const imagesByReply = await this.fetchImagesByEntity('reply', replyIds);
    
    const formattedReplies = replies.map(reply => this.formatReplyResponse(reply, imagesByReply[reply.id] || []));
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
   * @param {number|null} replyData.parent_reply_id - Parent reply ID for nested replies
   * @param {Array} replyData.images - Array of image URLs
   * @returns {Promise<Object>} Created reply info
   * @throws {Error} Database transaction errors
   * @sideEffects Creates reply record with status -1 (awaiting review)
   */
  async createReply(replyData) {
    const { topic_id, user_id, content, parent_reply_id = null, images = [] } = replyData;
    
    // Verify topic exists and is not deleted
    const [topics] = await pool.execute(`
      SELECT id FROM forum_topics WHERE id = ? AND status = 0
    `, [topic_id]);
    
    if (topics.length === 0) {
      throw new Error('Topic not found or closed');
    }
    
    // If parent_reply_id is provided, verify parent reply exists and belongs to same topic
    if (parent_reply_id) {
      const [parentReplies] = await pool.execute(`
        SELECT id, topic_id FROM forum_replies 
        WHERE id = ? AND status = 0
      `, [parent_reply_id]);
      
      if (parentReplies.length === 0) {
        throw new Error('Parent reply not found or deleted');
      }
      
      if (parentReplies[0].topic_id !== topic_id) {
        throw new Error('Parent reply must belong to the same topic');
      }
    }
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Create reply with status -1 (awaiting review)
      const [result] = await connection.execute(`
        INSERT INTO forum_replies (topic_id, user_id, parent_reply_id, content, status)
        VALUES (?, ?, ?, ?, -1)
      `, [topic_id, user_id, parent_reply_id, content]);
      
      const replyId = result.insertId;
      
      // Handle image uploads if provided
      if (images.length > 0) {
        for (const imageUrl of images) {
          // Convert full URL back to database format
          const dbImageUrl = imageUrl.replace('http://47.94.108.189', '/uploads');
          await connection.execute(`
            UPDATE forum_uploads 
            SET entity_type = 'reply', entity_id = ?, status = 1
            WHERE file_url = ? AND user_id = ?
          `, [replyId, dbImageUrl, user_id]);
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
    
    // Verify ownership - allow editing of user's own replies regardless of status
    const [replies] = await pool.execute(`
      SELECT user_id FROM forum_replies WHERE id = ? AND status IN (-1, 0)
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
        // Clear existing images by marking as deleted
        await connection.execute(`
          UPDATE forum_uploads 
          SET status = 3
          WHERE entity_type = 'reply' AND entity_id = ?
        `, [replyId]);
        
        // Add new images
        for (const imageUrl of images) {
          // Convert full URL back to database format
          const dbImageUrl = imageUrl.replace('http://47.94.108.189', '/uploads');
          await connection.execute(`
            UPDATE forum_uploads 
            SET entity_type = 'reply', entity_id = ?, status = 1
            WHERE file_url = ? AND user_id = ?
          `, [replyId, dbImageUrl, userId]);
        }
      }
      
      await connection.commit();
      
      // Return updated reply
      const [updatedReply] = await connection.execute(`
        SELECT r.*, u.username as author_name, u.id as author_id, u.status as author_status
        FROM forum_replies r
        JOIN users u ON r.user_id = u.id AND u.status >= 0
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
    // Verify ownership - allow deletion of user's own replies regardless of status
    const [replies] = await pool.execute(`
      SELECT user_id FROM forum_replies WHERE id = ? AND status IN (-1, 0)
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
        JOIN users u ON t.user_id = u.id AND u.status >= 0
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
        JOIN users u ON r.user_id = u.id AND u.status >= 0
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
    const { category, sort, search, user_id, limit, offset } = filters;
    let query = `
      SELECT t.*, c.name as category, u.username as author_name, u.id as author_id, u.status as author_status
      FROM forum_topics t
      JOIN forum_categories c ON t.category_id = c.id
      JOIN users u ON t.user_id = u.id AND u.status >= 0
    `;
    
    const params = [];
    
    // Build WHERE clause for user-specific content
    if (user_id) {
      // Include user's own under-review topics AND all published topics
      query += ' WHERE (t.status = 0 OR (t.status = -1 AND t.user_id = ?))';
      params.push(user_id);
    } else {
      // Only published topics
      query += ' WHERE t.status = 0';
    }
    
    if (category) {
      query += ' AND c.name = ?';
      params.push(category);
    }
    
    if (search) {
      query += ' AND (t.title LIKE ? OR t.content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    // Add sorting with user prioritization
    if (user_id) {
      // Prioritize user's content at top, then apply normal sorting
      switch (sort) {
        case 'oldest':
          query += ' ORDER BY (t.user_id = ?) DESC, t.created_at ASC';
          break;
        case 'popular':
          query += ' ORDER BY (t.user_id = ?) DESC, t.like_count DESC, t.created_at DESC';
          break;
        case 'trending':
          query += ' ORDER BY (t.user_id = ?) DESC, t.view_count DESC, t.created_at DESC';
          break;
        default: // newest
          query += ' ORDER BY (t.user_id = ?) DESC, t.created_at DESC';
      }
      params.push(user_id);
    } else {
      // Normal sorting without user prioritization
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
    }
    
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return { query, params };
  }

  /**
   * Format topic object for API response
   * @function formatTopicResponse
   * @param {Object} topic - Raw topic data from database
   * @param {Array} images - Array of image objects for this topic
   * @returns {Object} Formatted topic object
   * @sideEffects None - pure function
   */
  formatTopicResponse(topic, images = []) {
    return {
      id: topic.id,
      title: topic.title,
      content: topic.content,
      category: topic.category,
      author: {
        id: topic.author_id,
        name: topic.author_name,
        is_admin: topic.author_status === 87
      },
      reply_count: topic.reply_count,
      like_count: topic.like_count,
      status: topic.status,
      images: images.map(img => img.url), // Return only URLs for compatibility
      created_at: topic.created_at,
      updated_at: topic.updated_at
    };
  }

  /**
   * Format reply object for API response with hierarchical support
   * @function formatReplyResponse
   * @param {Object} reply - Raw reply data from database
   * @param {Array} images - Array of image objects for this reply
   * @returns {Object} Formatted reply object
   * @sideEffects None - pure function
   */
  formatReplyResponse(reply, images = []) {
    return {
      id: reply.id,
      content: reply.content,
      author: {
        id: reply.author_id,
        name: reply.author_name,
        is_admin: reply.author_status === 87
      },
      parent_reply_id: reply.parent_reply_id,
      like_count: reply.like_count,
      is_liked: false, // TODO: Implement user-specific like status
      status: reply.status,
      images: images.map(img => img.url), // Return only URLs for compatibility
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