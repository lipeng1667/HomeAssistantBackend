/**
 * @file routes/admin/forum.js
 * @description Admin forum management routes for content moderation
 * @author Claude Code
 * @created 2025-07-29
 * 
 * This module provides admin endpoints for forum content moderation,
 * including review queue management, post approval/rejection,
 * bulk moderation actions, and forum analytics.
 * 
 * Routes:
 * - GET /admin/forum/review-queue - List posts awaiting review (status = -1)
 * - POST /admin/forum/moderate/:type/:id - Approve/reject individual posts
 * - POST /admin/forum/moderate/bulk - Bulk moderation actions
 * - GET /admin/forum/analytics - Forum statistics and analytics
 * - GET /admin/forum/users/:userId/posts - User's forum activity
 * 
 * Security:
 * - All routes protected by authenticateAdmin middleware
 * - Comprehensive audit logging for all moderation actions
 * - IP tracking and session validation
 * 
 * Dependencies:
 * - forumService: Forum business logic
 * - adminAuth: Admin authentication and authorization
 * - database: MySQL connection for direct queries
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateAdmin, logAdminAction } = require('../../middleware/adminAuth');
const forumService = require('../../services/forumService');

// Apply admin authentication to all forum admin routes
router.use(authenticateAdmin);

/**
 * @description Get forum review queue (posts with status = -1)
 * @route GET /admin/forum/review-queue
 * @param {Object} req.query
 * @param {string} req.query.type - Filter by type: topic, reply, all (default: all)
 * @param {number} req.query.page - Page number (default: 1)
 * @param {number} req.query.limit - Items per page (default: 20, max: 50)
 * @param {string} req.query.sort - Sort order: newest, oldest (default: newest)
 * @returns {Object} Posts awaiting review with pagination
 */
router.get('/review-queue', async (req, res) => {
  try {
    const { type = 'all', page = 1, limit = 20, sort = 'newest' } = req.query;
    const offset = (parseInt(page) - 1) * Math.min(parseInt(limit), 50);
    const actualLimit = Math.min(parseInt(limit), 50);

    let query = '';
    let countQuery = '';
    const params = [];
    const countParams = [];

    if (type === 'topic' || type === 'all') {
      query += `
        SELECT 
          t.id, 'topic' as type, t.title, t.content, t.user_id, t.created_at, t.updated_at,
          u.username as author_name, c.name as category,
          NULL as topic_id, NULL as parent_reply_id
        FROM forum_topics t
        JOIN users u ON t.user_id = u.id AND u.status >= 0
        JOIN forum_categories c ON t.category_id = c.id
        WHERE t.status = -1
      `;
      
      countQuery += `
        SELECT COUNT(*) as count FROM forum_topics t
        JOIN users u ON t.user_id = u.id AND u.status >= 0
        WHERE t.status = -1
      `;
    }

    if (type === 'reply' || type === 'all') {
      if (query) {
        query += ' UNION ALL ';
        countQuery += ' UNION ALL ';
      }
      
      query += `
        SELECT 
          r.id, 'reply' as type, NULL as title, r.content, r.user_id, r.created_at, r.updated_at,
          u.username as author_name, c.name as category,
          r.topic_id, r.parent_reply_id
        FROM forum_replies r
        JOIN users u ON r.user_id = u.id AND u.status >= 0
        JOIN forum_topics t ON r.topic_id = t.id
        JOIN forum_categories c ON t.category_id = c.id
        WHERE r.status = -1
      `;
      
      countQuery += `
        SELECT COUNT(*) as count FROM forum_replies r
        JOIN users u ON r.user_id = u.id AND u.status >= 0
        WHERE r.status = -1
      `;
    }

    // Add sorting
    const sortOrder = sort === 'oldest' ? 'ASC' : 'DESC';
    query += ` ORDER BY created_at ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(actualLimit, offset);

    // Execute queries
    const [posts] = await pool.execute(query, params);
    
    // Get total count
    let totalCount = 0;
    if (type === 'all') {
      const [topicCount] = await pool.execute(`
        SELECT COUNT(*) as count FROM forum_topics t
        JOIN users u ON t.user_id = u.id AND u.status >= 0
        WHERE t.status = -1
      `);
      const [replyCount] = await pool.execute(`
        SELECT COUNT(*) as count FROM forum_replies r
        JOIN users u ON r.user_id = u.id AND u.status >= 0
        WHERE r.status = -1
      `);
      totalCount = topicCount[0].count + replyCount[0].count;
    } else {
      const [countResult] = await pool.execute(countQuery, countParams);
      totalCount = countResult[0].count;
    }

    // Log admin action
    await logAdminAction(req.user.id, 'review_queue_access', {
      type,
      page: parseInt(page),
      total_pending: totalCount,
      ip_address: req.ip,
      endpoint: req.path
    });

    const totalPages = Math.ceil(totalCount / actualLimit);

    res.json({
      status: 'success',
      data: {
        posts,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: totalCount,
          has_next: parseInt(page) < totalPages,
          has_previous: parseInt(page) > 1
        },
        queue_stats: {
          total_pending: totalCount,
          type_filter: type
        }
      }
    });
  } catch (error) {
    console.error('Error fetching review queue:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Moderate individual post (approve/reject)
 * @route POST /admin/forum/moderate
 * @param {Object} req.body
 * @param {number} req.body.post_id - Content ID
 * @param {string} req.body.post_type - Content type: topic, reply
 * @param {string} req.body.action - Action: approve, reject
 * @param {string} req.body.reason - Reason for action (optional for approve, required for reject)
 * @returns {Object} Moderation result
 */
router.post('/moderate', async (req, res) => {
  try {
    const { post_id, post_type, action, reason } = req.body;

    // Validate parameters
    if (!post_id || !post_type) {
      return res.status(400).json({
        status: 'error',
        message: 'post_id and post_type are required'
      });
    }

    if (!['topic', 'reply'].includes(post_type)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid post_type. Must be "topic" or "reply"'
      });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid action. Must be "approve" or "reject"'
      });
    }

    if (action === 'reject' && !reason) {
      return res.status(400).json({
        status: 'error',
        message: 'Reason is required for rejection'
      });
    }

    const contentId = parseInt(post_id);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Verify content exists and is pending review
      const table = post_type === 'topic' ? 'forum_topics' : 'forum_replies';
      const [content] = await connection.execute(`
        SELECT id, user_id, ${post_type === 'topic' ? 'title' : 'content'} as content_text
        FROM ${table} 
        WHERE id = ? AND status = -1
      `, [contentId]);

      if (content.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          status: 'error',
          message: `${post_type.charAt(0).toUpperCase() + post_type.slice(1)} not found or not pending review`
        });
      }

      const targetContent = content[0];
      const newStatus = action === 'approve' ? 0 : 2; // 0 = approved, 2 = rejected

      // Update content status
      await connection.execute(`
        UPDATE ${table} 
        SET status = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [newStatus, contentId]);

      // Log moderation action in admin logs
      await logAdminAction(req.user.id, `moderate_${post_type}`, {
        action,
        target_type: post_type,
        target_id: contentId,
        target_user_id: targetContent.user_id,
        reason: reason || null,
        content_preview: targetContent.content_text ? 
          targetContent.content_text.substring(0, 100) + '...' : null,
        ip_address: req.ip,
        endpoint: req.path
      });

      // TODO: In a production system, you might want to:
      // 1. Send notification to content author
      // 2. Update user reputation based on approved/rejected content
      // 3. Trigger content recommendation updates

      await connection.commit();

      res.json({
        status: 'success',
        data: {
          post_id: contentId,
          new_status: newStatus,
          action_taken: action,
          moderated_by: {
            id: req.user.id,
            name: req.user.username,
            role: 'admin'
          },
          moderated_at: new Date().toISOString(),
          reason: reason || null
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error moderating content:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Bulk moderation actions
 * @route POST /admin/forum/moderate/bulk
 * @param {Object} req.body
 * @param {Array} req.body.items - Array of {type: 'topic'|'reply', id: number}
 * @param {string} req.body.action - Action: approve, reject
 * @param {string} req.body.reason - Reason for bulk action (required for reject)
 * @returns {Object} Bulk moderation results
 */
router.post('/moderate/bulk', async (req, res) => {
  try {
    const { items, action, reason } = req.body;

    // Validate input
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Items array is required and cannot be empty'
      });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid action. Must be "approve" or "reject"'
      });
    }

    if (action === 'reject' && !reason) {
      return res.status(400).json({
        status: 'error',
        message: 'Reason is required for bulk rejection'
      });
    }

    // Limit bulk operations to prevent abuse
    if (items.length > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'Maximum 100 items allowed per bulk operation'
      });
    }

    const connection = await pool.getConnection();
    const results = { success: [], failed: [] };
    const newStatus = action === 'approve' ? 0 : 2;

    try {
      await connection.beginTransaction();

      for (const item of items) {
        try {
          const { type, id } = item;
          
          if (!['topic', 'reply'].includes(type) || !id) {
            results.failed.push({ ...item, error: 'Invalid item format' });
            continue;
          }

          const table = type === 'topic' ? 'forum_topics' : 'forum_replies';
          const contentId = parseInt(id);

          // Verify content exists and is pending
          const [content] = await connection.execute(`
            SELECT id, user_id FROM ${table} WHERE id = ? AND status = -1
          `, [contentId]);

          if (content.length === 0) {
            results.failed.push({ ...item, error: 'Not found or not pending' });
            continue;
          }

          // Update status
          const [updateResult] = await connection.execute(`
            UPDATE ${table} 
            SET status = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `, [newStatus, contentId]);

          if (updateResult.affectedRows > 0) {
            results.success.push({ type, id: contentId, action });
          } else {
            results.failed.push({ ...item, error: 'Update failed' });
          }

        } catch (itemError) {
          console.error(`Error processing item ${item.type}:${item.id}:`, itemError);
          results.failed.push({ ...item, error: 'Processing error' });
        }
      }

      // Log bulk moderation action
      await logAdminAction(req.user.id, 'bulk_moderate', {
        action,
        total_items: items.length,
        successful: results.success.length,
        failed: results.failed.length,
        reason: reason || null,
        ip_address: req.ip,
        endpoint: req.path
      });

      await connection.commit();

      res.json({
        status: 'success',
        data: {
          message: `Bulk ${action} completed`,
          results: {
            total_processed: items.length,
            successful: results.success.length,
            failed: results.failed.length,
            success_items: results.success,
            failed_items: results.failed
          }
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error in bulk moderation:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Get forum analytics and statistics
 * @route GET /admin/forum/analytics
 * @param {Object} req.query
 * @param {string} req.query.period - Time period: today, week, month, all (default: week)
 * @returns {Object} Forum statistics and analytics data
 */
router.get('/analytics', async (req, res) => {
  try {
    const { period = 'week' } = req.query;
    
    // Determine date filter
    let dateFilter = '';
    switch (period) {
      case 'today':
        dateFilter = 'AND DATE(created_at) = CURDATE()';
        break;
      case 'week':
        dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        break;
      case 'month':
        dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        break;
      case 'all':
      default:
        dateFilter = '';
    }

    // Get comprehensive forum statistics
    const [topicStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_topics,
        SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as published_topics,
        SUM(CASE WHEN status = -1 THEN 1 ELSE 0 END) as pending_topics,
        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as rejected_topics,
        AVG(reply_count) as avg_replies_per_topic,
        AVG(like_count) as avg_likes_per_topic
      FROM forum_topics 
      WHERE status >= -1 ${dateFilter}
    `);

    const [replyStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_replies,
        SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as published_replies,
        SUM(CASE WHEN status = -1 THEN 1 ELSE 0 END) as pending_replies,
        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as rejected_replies,
        AVG(like_count) as avg_likes_per_reply
      FROM forum_replies 
      WHERE status >= -1 ${dateFilter}
    `);

    // Get top categories
    const [categoryStats] = await pool.execute(`
      SELECT 
        c.name as category_name,
        COUNT(t.id) as topic_count,
        SUM(t.reply_count) as total_replies,
        AVG(t.like_count) as avg_likes
      FROM forum_categories c
      LEFT JOIN forum_topics t ON c.id = t.category_id AND t.status = 0 ${dateFilter.replace('created_at', 't.created_at')}
      WHERE c.status = 0
      GROUP BY c.id, c.name
      ORDER BY topic_count DESC
      LIMIT 10
    `);

    // Get most active users
    const [activeUsers] = await pool.execute(`
      SELECT 
        u.id, u.username,
        topic_count,
        reply_count,
        (topic_count + reply_count) as total_posts
      FROM (
        SELECT 
          user_id,
          COUNT(*) as topic_count,
          0 as reply_count
        FROM forum_topics 
        WHERE status = 0 ${dateFilter}
        GROUP BY user_id
        
        UNION ALL
        
        SELECT 
          user_id,
          0 as topic_count,
          COUNT(*) as reply_count
        FROM forum_replies 
        WHERE status = 0 ${dateFilter}
        GROUP BY user_id
      ) combined
      JOIN users u ON combined.user_id = u.id AND u.status >= 0
      GROUP BY u.id, u.username
      HAVING total_posts > 0
      ORDER BY total_posts DESC
      LIMIT 10
    `);

    // Get moderation queue summary
    const [queueStats] = await pool.execute(`
      SELECT 
        'topic' as type, COUNT(*) as count
      FROM forum_topics 
      WHERE status = -1
      UNION ALL
      SELECT 
        'reply' as type, COUNT(*) as count
      FROM forum_replies 
      WHERE status = -1
    `);

    // Log analytics access
    await logAdminAction(req.user.id, 'forum_analytics_access', {
      period,
      ip_address: req.ip,
      endpoint: req.path
    });

    const queueSummary = queueStats.reduce((acc, stat) => {
      acc[stat.type] = stat.count;
      return acc;
    }, {});

    res.json({
      status: 'success',
      data: {
        period,
        topic_statistics: topicStats[0],
        reply_statistics: replyStats[0],
        top_categories: categoryStats,
        most_active_users: activeUsers,
        moderation_queue: {
          total_pending: (queueSummary.topic || 0) + (queueSummary.reply || 0),
          pending_topics: queueSummary.topic || 0,
          pending_replies: queueSummary.reply || 0
        },
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching forum analytics:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Get specific user's forum activity for admin review
 * @route GET /admin/forum/users/:userId/posts
 * @param {number} req.params.userId - User ID
 * @param {Object} req.query
 * @param {string} req.query.type - Filter by type: topic, reply, all (default: all)
 * @param {string} req.query.status - Filter by status: published, pending, rejected, all (default: all)
 * @param {number} req.query.page - Page number (default: 1)
 * @param {number} req.query.limit - Items per page (default: 20)
 * @returns {Object} User's forum posts with pagination
 */
router.get('/users/:userId/posts', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { type = 'all', status = 'all', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * Math.min(parseInt(limit), 50);
    const actualLimit = Math.min(parseInt(limit), 50);

    // Verify user exists
    const [users] = await pool.execute(`
      SELECT id, username, status FROM users WHERE id = ?
    `, [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const user = users[0];

    // Build status filter
    let statusFilter = '';
    switch (status) {
      case 'published':
        statusFilter = 'AND status = 0';
        break;
      case 'pending':
        statusFilter = 'AND status = -1';
        break;
      case 'rejected':
        statusFilter = 'AND status = 2';
        break;
      case 'all':
      default:
        statusFilter = 'AND status >= -1';
    }

    let query = '';
    let countQuery = '';

    if (type === 'topic' || type === 'all') {
      query += `
        SELECT 
          t.id, 'topic' as type, t.title, t.content, t.status, t.like_count, 
          t.reply_count, t.created_at, t.updated_at, c.name as category
        FROM forum_topics t
        JOIN forum_categories c ON t.category_id = c.id
        WHERE t.user_id = ? ${statusFilter}
      `;
      
      countQuery += `
        SELECT COUNT(*) as count FROM forum_topics t
        WHERE t.user_id = ? ${statusFilter}
      `;
    }

    if (type === 'reply' || type === 'all') {
      if (query) {
        query += ' UNION ALL ';
        countQuery += ' UNION ALL ';
      }
      
      query += `
        SELECT 
          r.id, 'reply' as type, NULL as title, r.content, r.status, r.like_count,
          NULL as reply_count, r.created_at, r.updated_at, c.name as category
        FROM forum_replies r
        JOIN forum_topics t ON r.topic_id = t.id
        JOIN forum_categories c ON t.category_id = c.id
        WHERE r.user_id = ? ${statusFilter}
      `;
      
      countQuery += `
        SELECT COUNT(*) as count FROM forum_replies r
        WHERE r.user_id = ? ${statusFilter}
      `;
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    const queryParams = type === 'all' ? [userId, userId, actualLimit, offset] : [userId, actualLimit, offset];
    const countParams = type === 'all' ? [userId, userId] : [userId];

    // Execute queries
    const [posts] = await pool.execute(query, queryParams);
    
    // Get total count
    let totalCount = 0;
    if (type === 'all') {
      const [topicCount] = await pool.execute(`
        SELECT COUNT(*) as count FROM forum_topics WHERE user_id = ? ${statusFilter}
      `, [userId]);
      const [replyCount] = await pool.execute(`
        SELECT COUNT(*) as count FROM forum_replies WHERE user_id = ? ${statusFilter}
      `, [userId]);
      totalCount = topicCount[0].count + replyCount[0].count;
    } else {
      const [countResult] = await pool.execute(countQuery, countParams);
      totalCount = countResult[0].count;
    }

    // Log admin action
    await logAdminAction(req.user.id, 'user_posts_review', {
      target_user_id: userId,
      target_username: user.username,
      type,
      status,
      total_posts: totalCount,
      ip_address: req.ip,
      endpoint: req.path
    });

    const totalPages = Math.ceil(totalCount / actualLimit);

    res.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          username: user.username,
          status: user.status
        },
        posts,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: totalCount,
          has_next: parseInt(page) < totalPages,
          has_previous: parseInt(page) > 1
        },
        filters: {
          type,
          status
        }
      }
    });

  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @description Get real-time forum statistics for admin dashboard
 * @route GET /admin/forum/stats
 * @returns {Object} Quick forum statistics and queue health
 */
router.get('/stats', async (req, res) => {
  try {
    // Get pending review counts
    const [pendingCounts] = await pool.execute(`
      SELECT 
        'topic' as type, COUNT(*) as count
      FROM forum_topics 
      WHERE status = -1
      UNION ALL
      SELECT 
        'reply' as type, COUNT(*) as count
      FROM forum_replies 
      WHERE status = -1
    `);

    const pendingStats = pendingCounts.reduce((acc, stat) => {
      acc[stat.type] = stat.count;
      return acc;
    }, {});

    const totalPending = (pendingStats.topic || 0) + (pendingStats.reply || 0);

    // Get recent activity (last 24 hours)
    const [activityStats] = await pool.execute(`
      SELECT 
        'topics' as type, COUNT(*) as count
      FROM forum_topics 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND status >= -1
      UNION ALL
      SELECT 
        'replies' as type, COUNT(*) as count
      FROM forum_replies 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND status >= -1
      UNION ALL
      SELECT 
        'moderated' as type, COUNT(*) as count
      FROM forum_topics 
      WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND status IN (0, 2)
      UNION ALL
      SELECT 
        'moderated_replies' as type, COUNT(*) as count
      FROM forum_replies 
      WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND status IN (0, 2)
    `);

    const activity = activityStats.reduce((acc, stat) => {
      acc[stat.type] = stat.count;
      return acc;
    }, {});

    // Calculate queue health metrics
    const [queueHealth] = await pool.execute(`
      SELECT 
        AVG(TIMESTAMPDIFF(HOUR, created_at, NOW())) as avg_wait_hours,
        MAX(TIMESTAMPDIFF(HOUR, created_at, NOW())) as max_wait_hours
      FROM (
        SELECT created_at FROM forum_topics WHERE status = -1
        UNION ALL
        SELECT created_at FROM forum_replies WHERE status = -1
      ) pending_items
    `);

    const avgWaitTime = queueHealth[0].avg_wait_hours || 0;
    const maxWaitTime = queueHealth[0].max_wait_hours || 0;

    // Determine queue health status
    let queueStatus = 'healthy';
    if (avgWaitTime > 24) queueStatus = 'critical';
    else if (avgWaitTime > 12) queueStatus = 'warning';
    else if (avgWaitTime > 6) queueStatus = 'attention';

    // Get recent user signups (from last 24h)
    const [userSignups] = await pool.execute(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND status >= 0
    `);

    // Log stats access
    await logAdminAction(req.user.id, 'forum_stats_access', {
      total_pending: totalPending,
      queue_status: queueStatus,
      ip_address: req.ip,
      endpoint: req.path
    });

    res.json({
      status: 'success',
      data: {
        pending_review: {
          total: totalPending,
          topics: pendingStats.topic || 0,
          replies: pendingStats.reply || 0,
          urgent: maxWaitTime > 24 ? Math.min(totalPending, 5) : 0
        },
        recent_activity: {
          last_24h: {
            new_posts: (activity.topics || 0) + (activity.replies || 0),
            moderated: (activity.moderated || 0) + (activity.moderated_replies || 0),
            user_signups: userSignups[0].count
          }
        },
        queue_health: {
          average_wait_time_hours: Math.round(avgWaitTime * 10) / 10,
          oldest_pending_hours: Math.round(maxWaitTime * 10) / 10,
          status: queueStatus
        },
        last_updated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching forum stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router;