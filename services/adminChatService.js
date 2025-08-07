/**
 * @file services/adminChatService.js
 * @description Admin chat service layer for conversation management and messaging
 * @author Michael Lee
 * @created 2025-08-07
 * @modified 2025-08-07
 * 
 * This service provides business logic for admin chat management including conversation
 * assignment, status updates, priority management, messaging, and dashboard statistics
 * separated from HTTP concerns following the established service layer pattern.
 * 
 * Modification Log:
 * - 2025-08-07: Initial implementation with comprehensive admin IM functionality
 * 
 * Functions:
 * - getDashboardStats(adminId): Get dashboard statistics and overview
 * - getConversations(filters): Get paginated conversations with advanced filtering
 * - getConversationDetails(conversationId): Get detailed conversation information
 * - assignConversation(conversationId, adminId, assignedBy, notes): Assign conversation to admin
 * - updateConversationStatus(conversationId, adminId, updates): Update conversation status/priority/tags
 * - sendAdminMessage(messageData): Send message as admin to conversation
 * - getAdminActivity(adminId, filters): Get admin activity history
 * - logAdminActivity(activityData): Log admin actions for audit trail
 * - buildConversationQuery(filters): Build SQL query for conversation filtering
 * - buildDashboardMetrics(): Calculate real-time dashboard metrics
 * - formatConversationResponse(conversation): Format conversation object for response
 * - buildPagination(page, limit, totalItems): Build pagination metadata
 * 
 * Security Features:
 * - Admin role validation (status = 87)
 * - Comprehensive audit logging for all admin actions
 * - Parameterized queries to prevent SQL injection
 * - Input validation and sanitization
 * - Access control for conversation management
 * 
 * Dependencies:
 * - config/database.js: MySQL connection pool
 * - services/socketService.js: WebSocket events for real-time updates
 */

const pool = require('../config/database');

/**
 * Get dashboard statistics and overview for admin chat management
 * @param {number} adminId - Optional specific admin ID for personalized data
 * @returns {Object} Dashboard statistics including conversation counts, activity, and assignments
 */
async function getDashboardStats(adminId = null) {
  try {
    // Get conversation summary statistics
    const [conversationStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_conversations,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_conversations,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as unread_conversations,
        SUM(CASE WHEN admin_id IS NULL THEN 1 ELSE 0 END) as unassigned,
        SUM(CASE WHEN status = 'closed' AND DATE(closed_at) = CURDATE() THEN 1 ELSE 0 END) as closed_today
      FROM conversations
      WHERE status != 'archived'
    `);

    // Get admin-specific assignments if adminId provided
    let myAssignments = 0;
    if (adminId) {
      const [assignments] = await pool.execute(`
        SELECT COUNT(*) as count
        FROM conversations 
        WHERE admin_id = ? AND status IN ('active', 'pending')
      `, [adminId]);
      myAssignments = assignments[0].count;
    }

    // Calculate average response time (in minutes)
    const [responseTime] = await pool.execute(`
      SELECT 
        AVG(TIMESTAMPDIFF(MINUTE, c.created_at, first_admin_response.timestamp)) as avg_response_minutes
      FROM conversations c
      JOIN (
        SELECT 
          conversation_id,
          MIN(timestamp) as timestamp
        FROM messages 
        WHERE sender_role = 'admin' 
        GROUP BY conversation_id
      ) first_admin_response ON c.id = first_admin_response.conversation_id
      WHERE c.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);

    const avgResponseMinutes = responseTime[0].avg_response_minutes || 0;
    const avgResponseTime = avgResponseMinutes > 60 
      ? `${Math.round(avgResponseMinutes / 60 * 10) / 10} hours`
      : `${Math.round(avgResponseMinutes * 10) / 10} minutes`;

    // Get recent activity (last 10 conversations with activity)
    const [recentActivity] = await pool.execute(`
      SELECT 
        c.id as conversation_id,
        u.username as user_name,
        c.status,
        c.priority,
        c.last_message_at as timestamp,
        m.content as last_message,
        m.sender_role,
        COALESCE(a.username, 'Unassigned') as assigned_admin
      FROM conversations c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN users a ON c.admin_id = a.id
      LEFT JOIN messages m ON c.id = m.conversation_id AND m.timestamp = c.last_message_at
      WHERE c.status != 'archived' AND c.last_message_at IS NOT NULL
      ORDER BY c.last_message_at DESC
      LIMIT 10
    `);

    // Get my assignments details if adminId provided
    let myAssignmentDetails = [];
    if (adminId) {
      const [assignments] = await pool.execute(`
        SELECT 
          c.id as conversation_id,
          u.username as user_name,
          c.priority,
          c.status,
          c.last_message_at as last_activity,
          (
            SELECT COUNT(*) 
            FROM messages 
            WHERE conversation_id = c.id AND is_read = FALSE AND sender_role = 'user'
          ) as unread_count,
          c.tags
        FROM conversations c
        JOIN users u ON c.user_id = u.id
        WHERE c.admin_id = ? AND c.status IN ('active', 'pending')
        ORDER BY 
          CASE c.priority 
            WHEN 'urgent' THEN 1 
            WHEN 'high' THEN 2 
            WHEN 'normal' THEN 3 
            WHEN 'low' THEN 4 
          END,
          c.last_message_at DESC
        LIMIT 20
      `, [adminId]);
      
      myAssignmentDetails = assignments.map(assignment => ({
        ...assignment,
        tags: assignment.tags ? JSON.parse(assignment.tags) : []
      }));
    }

    return {
      summary: {
        total_conversations: conversationStats[0].total_conversations,
        active_conversations: conversationStats[0].active_conversations,
        unread_conversations: conversationStats[0].unread_conversations,
        assigned_to_me: myAssignments,
        unassigned: conversationStats[0].unassigned,
        closed_today: conversationStats[0].closed_today,
        avg_response_time: avgResponseTime
      },
      recent_activity: recentActivity.map(activity => ({
        ...activity,
        last_message: activity.last_message?.substring(0, 100) + (activity.last_message?.length > 100 ? '...' : '')
      })),
      my_assignments: myAssignmentDetails
    };

  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    throw new Error('Failed to retrieve dashboard statistics');
  }
}

/**
 * Get paginated conversations with advanced filtering for admin management
 * @param {Object} filters - Filtering and pagination options
 * @returns {Object} Paginated conversations with summary statistics
 */
async function getConversations(filters = {}) {
  try {
    const {
      page = 1,
      limit = 20,
      status = 'all',
      assigned_admin = 'all',
      user_id = null,
      unread_only = false,
      sort = 'newest',
      priority = 'all'
    } = filters;

    const offset = (parseInt(page) - 1) * Math.min(parseInt(limit), 100);
    const actualLimit = Math.min(parseInt(limit), 100);

    // Build WHERE conditions
    const conditions = [];
    const params = [];

    // Status filter
    if (status !== 'all') {
      conditions.push('c.status = ?');
      params.push(status);
    }

    // Priority filter
    if (priority !== 'all') {
      conditions.push('c.priority = ?');
      params.push(priority);
    }

    // Assigned admin filter
    if (assigned_admin !== 'all') {
      if (assigned_admin === 'unassigned') {
        conditions.push('c.admin_id IS NULL');
      } else {
        conditions.push('c.admin_id = ?');
        params.push(parseInt(assigned_admin));
      }
    }

    // User ID filter
    if (user_id) {
      conditions.push('c.user_id = ?');
      params.push(parseInt(user_id));
    }

    // Unread messages filter
    if (unread_only === true || unread_only === 'true') {
      conditions.push(`EXISTS (
        SELECT 1 FROM messages m 
        WHERE m.conversation_id = c.id AND m.is_read = FALSE AND m.sender_role = 'user'
      )`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Build ORDER BY clause
    let orderBy = 'ORDER BY c.created_at DESC';
    switch (sort) {
      case 'oldest':
        orderBy = 'ORDER BY c.created_at ASC';
        break;
      case 'last_activity':
        orderBy = 'ORDER BY c.last_message_at DESC';
        break;
      case 'priority':
        orderBy = `ORDER BY 
          CASE c.priority 
            WHEN 'urgent' THEN 1 
            WHEN 'high' THEN 2 
            WHEN 'normal' THEN 3 
            WHEN 'low' THEN 4 
          END, c.last_message_at DESC`;
        break;
      default:
        orderBy = 'ORDER BY c.created_at DESC';
    }

    // Main query to get conversations
    const conversationQuery = `
      SELECT 
        c.id,
        c.user_id,
        c.admin_id,
        c.status,
        c.priority,
        c.created_at,
        c.last_message_at,
        c.assigned_at,
        c.closed_at,
        c.resolution_notes,
        c.internal_notes,
        c.tags,
        u.username as user_account_name,
        u.phone_number as user_phone_number,
        u.status as user_status,
        u.created_at as user_created_at,
        admin_u.username as admin_username,
        admin_u.phone_number as admin_account_name,
        (
          SELECT COUNT(*) 
          FROM messages 
          WHERE conversation_id = c.id AND sender_role = 'user' AND is_read = FALSE
        ) as unread_count,
        (
          SELECT COUNT(*) 
          FROM messages 
          WHERE conversation_id = c.id
        ) as total_messages,
        (
          SELECT JSON_OBJECT(
            'id', m.id,
            'content', m.content,
            'sender_role', m.sender_role,
            'timestamp', m.timestamp
          )
          FROM messages m 
          WHERE m.conversation_id = c.id 
          ORDER BY m.timestamp DESC 
          LIMIT 1
        ) as last_message
      FROM conversations c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN users admin_u ON c.admin_id = admin_u.id
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    params.push(actualLimit, offset);
    const [conversations] = await pool.execute(conversationQuery, params);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM conversations c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN users admin_u ON c.admin_id = admin_u.id
      ${whereClause}
    `;

    const countParams = params.slice(0, -2); // Remove limit and offset
    const [countResult] = await pool.execute(countQuery, countParams);
    const totalCount = countResult[0].total;

    // Format conversations
    const formattedConversations = conversations.map(conversation => ({
      ...conversation,
      user_info: {
        id: conversation.user_id,
        account_name: conversation.user_account_name,
        phone_number: conversation.user_phone_number,
        status: conversation.user_status,
        created_at: conversation.user_created_at
      },
      admin_info: conversation.admin_id ? {
        id: conversation.admin_id,
        username: conversation.admin_username,
        account_name: conversation.admin_account_name
      } : null,
      tags: conversation.tags ? JSON.parse(conversation.tags) : [],
      last_message: conversation.last_message ? JSON.parse(conversation.last_message) : null
    }));

    // Clean up the response by removing redundant fields
    const cleanedConversations = formattedConversations.map(({
      user_account_name, user_phone_number, user_status, user_created_at,
      admin_username, admin_account_name, ...rest
    }) => rest);

    // Get summary statistics
    const [summaryStats] = await pool.execute(`
      SELECT 
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as total_active,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM messages m 
          WHERE m.conversation_id = c.id AND m.is_read = FALSE AND m.sender_role = 'user'
        ) THEN 1 ELSE 0 END) as total_unread,
        SUM(CASE WHEN admin_id IS NOT NULL THEN 1 ELSE 0 END) as assigned_total,
        SUM(CASE WHEN admin_id IS NULL THEN 1 ELSE 0 END) as unassigned
      FROM conversations c
      WHERE status != 'archived'
    `);

    return {
      conversations: cleanedConversations,
      pagination: buildPagination(parseInt(page), actualLimit, totalCount),
      summary: summaryStats[0]
    };

  } catch (error) {
    console.error('Error getting conversations:', error);
    throw new Error('Failed to retrieve conversations');
  }
}

/**
 * Get detailed information about a specific conversation for admin review
 * @param {number} conversationId - Conversation ID
 * @returns {Object} Detailed conversation information with full message history
 */
async function getConversationDetails(conversationId) {
  try {
    // Get conversation details with user and admin info
    const [conversations] = await pool.execute(`
      SELECT 
        c.*,
        u.username as user_account_name,
        u.phone_number as user_phone_number,
        u.status as user_status,
        u.created_at as user_created_at,
        u.updated_at as user_last_login,
        admin_u.username as admin_username,
        admin_u.phone_number as admin_account_name
      FROM conversations c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN users admin_u ON c.admin_id = admin_u.id
      WHERE c.id = ?
    `, [conversationId]);

    if (conversations.length === 0) {
      throw new Error('Conversation not found');
    }

    const conversation = conversations[0];

    // Get complete message history
    const [messages] = await pool.execute(`
      SELECT 
        m.id,
        m.conversation_id,
        m.sender_role,
        m.content,
        m.message_type,
        m.file_id,
        m.file_url,
        m.is_read,
        m.is_internal,
        m.internal_note,
        m.edited_at,
        m.timestamp,
        CASE 
          WHEN m.sender_role = 'user' THEN u.username
          WHEN m.sender_role = 'admin' THEN admin_u.username
          ELSE 'System'
        END as sender_identifier
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN users admin_u ON m.admin_id = admin_u.id
      WHERE m.conversation_id = ?
      ORDER BY m.timestamp ASC
    `, [conversationId]);

    // Get admin activity log for this conversation
    const [activityLog] = await pool.execute(`
      SELECT 
        aal.*,
        u.username as admin_username
      FROM admin_activity_log aal
      JOIN users u ON aal.admin_id = u.id
      WHERE aal.conversation_id = ?
      ORDER BY aal.timestamp DESC
    `, [conversationId]);

    // Format response
    return {
      conversation: {
        id: conversation.id,
        user_id: conversation.user_id,
        user_info: {
          id: conversation.user_id,
          account_name: conversation.user_account_name,
          phone_number: conversation.user_phone_number,
          status: conversation.user_status,
          created_at: conversation.user_created_at,
          last_login: conversation.user_last_login
        },
        admin_id: conversation.admin_id,
        admin_info: conversation.admin_id ? {
          id: conversation.admin_id,
          username: conversation.admin_username,
          account_name: conversation.admin_account_name
        } : null,
        status: conversation.status,
        priority: conversation.priority,
        created_at: conversation.created_at,
        last_message_at: conversation.last_message_at,
        assigned_at: conversation.assigned_at,
        closed_at: conversation.closed_at,
        resolution_notes: conversation.resolution_notes,
        internal_notes: conversation.internal_notes,
        tags: conversation.tags ? JSON.parse(conversation.tags) : [],
        total_messages: messages.length
      },
      messages,
      activity_log: activityLog
    };

  } catch (error) {
    console.error('Error getting conversation details:', error);
    if (error.message === 'Conversation not found') {
      throw error;
    }
    throw new Error('Failed to retrieve conversation details');
  }
}

/**
 * Assign a conversation to a specific admin for handling
 * @param {number} conversationId - Conversation ID
 * @param {number} adminId - Admin ID to assign to
 * @param {number} assignedBy - Admin ID who is making the assignment
 * @param {string} notes - Optional assignment notes
 * @returns {Object} Assignment result with conversation and admin info
 */
async function assignConversation(conversationId, adminId, assignedBy, notes = null) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Verify conversation exists and get current status
    const [conversations] = await connection.execute(`
      SELECT id, admin_id, status FROM conversations WHERE id = ?
    `, [conversationId]);

    if (conversations.length === 0) {
      throw new Error('Conversation not found');
    }

    const currentConversation = conversations[0];

    // Verify admin exists and has admin status
    const [admins] = await connection.execute(`
      SELECT id, username, phone_number FROM users WHERE id = ? AND status = 87
    `, [adminId]);

    if (admins.length === 0) {
      throw new Error('Admin user not found or invalid');
    }

    const assignedAdmin = admins[0];

    // Update conversation assignment
    await connection.execute(`
      UPDATE conversations 
      SET 
        admin_id = ?, 
        assigned_at = CURRENT_TIMESTAMP,
        internal_notes = CONCAT(COALESCE(internal_notes, ''), 
          CASE WHEN internal_notes IS NOT NULL THEN '\n---\n' ELSE '' END,
          'Assigned by admin ', ?, ' at ', NOW(), 
          CASE WHEN ? IS NOT NULL THEN CONCAT(': ', ?) ELSE '' END),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [adminId, assignedBy, notes, notes, conversationId]);

    // Add participant record if not exists
    await connection.execute(`
      INSERT INTO conversation_participants (conversation_id, admin_id, role)
      VALUES (?, ?, 'assigned')
      ON DUPLICATE KEY UPDATE role = 'assigned', joined_at = CURRENT_TIMESTAMP
    `, [conversationId, adminId]);

    // Log admin activity
    await logAdminActivity({
      admin_id: assignedBy,
      conversation_id: conversationId,
      action: 'assign',
      old_value: currentConversation.admin_id,
      new_value: adminId,
      notes: notes
    }, connection);

    await connection.commit();

    return {
      conversation_id: conversationId,
      assigned_admin: {
        id: assignedAdmin.id,
        username: assignedAdmin.username,
        account_name: assignedAdmin.phone_number
      },
      notes: notes,
      assigned_by: assignedBy,
      assigned_at: new Date().toISOString()
    };

  } catch (error) {
    await connection.rollback();
    console.error('Error assigning conversation:', error);
    if (error.message.includes('not found') || error.message.includes('invalid')) {
      throw error;
    }
    throw new Error('Failed to assign conversation');
  } finally {
    connection.release();
  }
}

/**
 * Update conversation status, priority, and management tags
 * @param {number} conversationId - Conversation ID
 * @param {number} adminId - Admin making the changes
 * @param {Object} updates - Object containing status, priority, tags, resolution_notes
 * @returns {Object} Updated conversation details
 */
async function updateConversationStatus(conversationId, adminId, updates) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Get current conversation state for comparison
    const [conversations] = await connection.execute(`
      SELECT status, priority, tags, resolution_notes FROM conversations WHERE id = ?
    `, [conversationId]);

    if (conversations.length === 0) {
      throw new Error('Conversation not found');
    }

    const currentConversation = conversations[0];
    const updateFields = [];
    const updateParams = [];
    const activityLogs = [];

    // Build dynamic update query
    if (updates.status && updates.status !== currentConversation.status) {
      updateFields.push('status = ?');
      updateParams.push(updates.status);
      
      // Set closed_at if closing conversation
      if (updates.status === 'closed') {
        updateFields.push('closed_at = CURRENT_TIMESTAMP');
      }
      
      activityLogs.push({
        action: 'status_change',
        old_value: currentConversation.status,
        new_value: updates.status
      });
    }

    if (updates.priority && updates.priority !== currentConversation.priority) {
      updateFields.push('priority = ?');
      updateParams.push(updates.priority);
      
      activityLogs.push({
        action: 'priority_change',
        old_value: currentConversation.priority,
        new_value: updates.priority
      });
    }

    if (updates.tags !== undefined) {
      const newTags = JSON.stringify(updates.tags);
      if (newTags !== currentConversation.tags) {
        updateFields.push('tags = ?');
        updateParams.push(newTags);
        
        activityLogs.push({
          action: 'tags_update',
          old_value: currentConversation.tags,
          new_value: newTags
        });
      }
    }

    if (updates.resolution_notes && updates.resolution_notes !== currentConversation.resolution_notes) {
      updateFields.push('resolution_notes = ?');
      updateParams.push(updates.resolution_notes);
      
      activityLogs.push({
        action: 'resolution_notes',
        old_value: currentConversation.resolution_notes ? 'Previous notes exist' : null,
        new_value: 'Resolution notes updated'
      });
    }

    // Always update the updated_at timestamp
    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    if (updateFields.length > 0) {
      updateParams.push(conversationId);
      
      const updateQuery = `
        UPDATE conversations 
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;
      
      await connection.execute(updateQuery, updateParams);
    }

    // Log all admin activities
    for (const logData of activityLogs) {
      await logAdminActivity({
        admin_id: adminId,
        conversation_id: conversationId,
        ...logData,
        notes: updates.resolution_notes || null
      }, connection);
    }

    await connection.commit();

    // Get updated conversation details
    const [updatedConversation] = await connection.execute(`
      SELECT 
        c.id as conversation_id,
        c.status,
        c.priority,
        c.tags,
        c.resolution_notes,
        c.updated_at,
        u.username as updated_by
      FROM conversations c
      JOIN users u ON u.id = ?
      WHERE c.id = ?
    `, [adminId, conversationId]);

    const result = updatedConversation[0];
    
    return {
      conversation_id: result.conversation_id,
      status: result.status,
      priority: result.priority,
      tags: result.tags ? JSON.parse(result.tags) : [],
      resolution_notes: result.resolution_notes,
      updated_by: result.updated_by,
      updated_at: result.updated_at
    };

  } catch (error) {
    await connection.rollback();
    console.error('Error updating conversation status:', error);
    if (error.message === 'Conversation not found') {
      throw error;
    }
    throw new Error('Failed to update conversation status');
  } finally {
    connection.release();
  }
}

/**
 * Send a message as an admin to a specific conversation
 * @param {Object} messageData - Message data including conversation_id, admin_id, message, etc.
 * @returns {Object} Created message details
 */
async function sendAdminMessage(messageData) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      conversation_id,
      admin_id,
      message,
      message_type = 'text',
      file_id = null,
      file_url = null,
      internal_note = null
    } = messageData;

    // Verify conversation exists
    const [conversations] = await connection.execute(`
      SELECT id FROM conversations WHERE id = ?
    `, [conversation_id]);

    if (conversations.length === 0) {
      throw new Error('Conversation not found');
    }

    // Verify admin exists and has admin status
    const [admins] = await connection.execute(`
      SELECT id, username FROM users WHERE id = ? AND status = 87
    `, [admin_id]);

    if (admins.length === 0) {
      throw new Error('Admin user not found or invalid');
    }

    const admin = admins[0];

    // Insert admin message
    const [messageResult] = await connection.execute(`
      INSERT INTO messages (
        conversation_id, admin_id, sender_role, message_type, 
        content, file_id, file_url, internal_note, is_read
      ) VALUES (?, ?, 'admin', ?, ?, ?, ?, ?, TRUE)
    `, [conversation_id, admin_id, message_type, message, file_id, file_url, internal_note]);

    const messageId = messageResult.insertId;

    // Update conversation last_message_at
    await connection.execute(`
      UPDATE conversations 
      SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [conversation_id]);

    // Log admin activity if not an internal note
    if (message_type !== 'internal_note') {
      await logAdminActivity({
        admin_id,
        conversation_id,
        action: 'send_message',
        new_value: message_type,
        notes: `Sent ${message_type} message` + (internal_note ? ' with internal note' : '')
      }, connection);
    }

    await connection.commit();

    return {
      id: messageId,
      conversation_id,
      message,
      sender_role: 'admin',
      sender_identifier: admin.username,
      message_type,
      file_id,
      file_url,
      timestamp: new Date().toISOString(),
      internal_note
    };

  } catch (error) {
    await connection.rollback();
    console.error('Error sending admin message:', error);
    if (error.message.includes('not found') || error.message.includes('invalid')) {
      throw error;
    }
    throw new Error('Failed to send admin message');
  } finally {
    connection.release();
  }
}

/**
 * Log admin actions for audit trail
 * @param {Object} activityData - Activity data to log
 * @param {Object} connection - Optional database connection for transaction
 */
async function logAdminActivity(activityData, connection = null) {
  try {
    const {
      admin_id,
      conversation_id = null,
      action,
      old_value = null,
      new_value = null,
      notes = null
    } = activityData;

    const query = `
      INSERT INTO admin_activity_log (
        admin_id, conversation_id, action, old_value, new_value, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [admin_id, conversation_id, action, old_value, new_value, notes];

    if (connection) {
      await connection.execute(query, params);
    } else {
      await pool.execute(query, params);
    }

  } catch (error) {
    console.error('Error logging admin activity:', error);
    // Don't throw error as this shouldn't break the main operation
  }
}

/**
 * Build pagination metadata
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} totalItems - Total number of items
 * @returns {Object} Pagination metadata
 */
function buildPagination(page, limit, totalItems) {
  const totalPages = Math.ceil(totalItems / limit);
  
  return {
    page: page,
    limit: limit,
    total: totalItems,
    pages: totalPages,
    has_next: page < totalPages,
    has_previous: page > 1
  };
}

module.exports = {
  getDashboardStats,
  getConversations,
  getConversationDetails,
  assignConversation,
  updateConversationStatus,
  sendAdminMessage,
  logAdminActivity,
  buildPagination
};