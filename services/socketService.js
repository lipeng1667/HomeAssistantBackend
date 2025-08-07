/**
 * @file services/socketService.js
 * @description Socket.io service for real-time messaging functionality
 * @author Michael Lee
 * @created 2025-07-14
 * @modified 2025-07-14
 * 
 * This service handles WebSocket connections for real-time messaging between
 * users and admins. It provides room-based messaging, typing indicators,
 * and connection management.
 * 
 * Functions:
 * - initializeSocket(server): Initialize Socket.io with HTTP server
 * - authenticateSocket(socket, next): Authenticate WebSocket connections
 * - handleConnection(socket): Handle new WebSocket connections
 * - handleJoinConversation(socket, data): Join conversation room
 * - handleSendMessage(socket, data): Send real-time message
 * - handleTypingIndicator(socket, data): Handle typing indicators
 * - handleDisconnect(socket): Handle client disconnection
 * - emitToConversation(conversationId, event, data): Emit to conversation room
 * - emitToUser(userId, event, data): Emit to specific user
 * 
 * Dependencies:
 * - socket.io: WebSocket library
 * - config/database.js: Database connection
 * - middleware/userAuth.js: Authentication utilities
 */

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const pool = require('../config/database');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socket.id
    this.socketUsers = new Map(); // socket.id -> userId
  }

  /**
   * Initialize Socket.io server
   * @param {Object} server - HTTP server instance
   */
  initializeSocket(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Configure Redis adapter for PM2 clustering
    const redisClient = require('../config/redis');
    try {
      if (redisClient.isReady()) {
        const pubClient = redisClient.getClient();
        const subClient = pubClient.duplicate();

        this.io.adapter(createAdapter(pubClient, subClient));
        console.log('✅ Socket.io Redis adapter configured for PM2 clustering');
      } else {
        console.warn('⚠️ Redis not ready, Socket.io clustering disabled');
        console.warn('⚠️ This may cause "Session ID unknown" errors with PM2 clustering');
      }
    } catch (error) {
      console.error('❌ Failed to configure Redis adapter:', error);
      console.warn('⚠️ Running Socket.io without clustering - may cause connection issues');
    }

    // Authentication middleware
    this.io.use(this.authenticateSocket.bind(this));

    // Handle connections
    this.io.on('connection', this.handleConnection.bind(this));

    // Handle connection errors
    this.io.on('connect_error', (error) => {
      console.error('❌ Socket.io connection error:', error);
    });

    // Log raw connection attempts (reduced logging for clustering)
    this.io.engine.on('connection', (rawSocket) => {
      console.log('🔍 Raw WebSocket connection attempt from:', rawSocket.remoteAddress);
    });

    this.io.engine.on('connection_error', (error) => {
      console.error('❌ Raw WebSocket connection error:', error);
    });

    console.log('✅ Socket.io server initialized');
    return this.io;
  }

  /**
   * Authenticate WebSocket connections
   * @param {Object} socket - Socket.io socket object
   * @param {Function} next - Next middleware function
   */
  async authenticateSocket(socket, next) {
    try {
      console.log('🔍 WebSocket authentication attempt from:', socket.handshake.address);
      console.log('🔍 Auth data:', socket.handshake.auth);
      console.log('🔍 Query params:', socket.handshake.query);

      // Try auth first, then query params as fallback
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        console.log('❌ Authentication failed: No token provided in auth or query params');
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token (assuming you have JWT auth)
      // For now, we'll use a simple user_id from token
      const userId = parseInt(token);

      if (!userId || isNaN(userId)) {
        console.log('❌ Authentication failed: Invalid token format:', token);
        return next(new Error('Invalid authentication token'));
      }

      console.log('🔍 Checking user ID:', userId);

      // Verify user exists in database
      const [users] = await pool.execute(
        'SELECT id, username, device_id FROM users WHERE id = ? AND status >= 0',
        [userId]
      );

      if (users.length === 0) {
        console.log('❌ Authentication failed: User not found or inactive for ID:', userId);
        return next(new Error('User not found or inactive'));
      }

      console.log('✅ Authentication successful for user:', users[0].username);

      // Attach user info to socket
      socket.userId = userId;
      socket.userInfo = users[0];
      next();
    } catch (error) {
      console.error('❌ Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  }

  /**
   * Handle new WebSocket connection
   * @param {Object} socket - Socket.io socket object
   */
  handleConnection(socket) {
    const userId = socket.userId;
    const userInfo = socket.userInfo;
    const isAdmin = userInfo.status === 87;

    console.log(`🔗 User ${userId} (${userInfo.username}) connected via WebSocket${isAdmin ? ' [ADMIN]' : ''}`);

    // Track connected user
    this.connectedUsers.set(userId, socket.id);
    this.socketUsers.set(socket.id, { userId, isAdmin });

    // Update WebSocket metrics
    if (global.metricsService) {
      console.log('📊 Incrementing WebSocket connection metrics...');
      global.metricsService.incrementWebSocketConnections().catch(console.error);
    } else {
      console.warn('⚠️ global.metricsService not available for WebSocket metrics');
    }

    // Join user's conversations or admin rooms
    if (isAdmin) {
      this.joinAdminRooms(socket, userId);
    } else {
      this.joinUserConversations(socket, userId);
    }

    // Handle events
    socket.on('join_conversation', (data) => this.handleJoinConversation(socket, data));
    socket.on('send_message', (data) => this.handleSendMessage(socket, data));
    socket.on('typing_start', (data) => this.handleTypingIndicator(socket, data, true));
    socket.on('typing_stop', (data) => this.handleTypingIndicator(socket, data, false));
    
    // Admin-specific events
    if (isAdmin) {
      socket.on('join_admin_rooms', (data) => this.handleJoinAdminRooms(socket, data));
      socket.on('admin_assign_conversation', (data) => this.handleAdminAssignConversation(socket, data));
    }
    
    socket.on('disconnect', () => this.handleDisconnect(socket));

    // Send connection success
    socket.emit('connected', {
      message: 'Successfully connected to chat server',
      user_id: userId,
      is_admin: isAdmin,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Join user's existing conversations
   * @param {Object} socket - Socket.io socket object
   * @param {number} userId - User ID
   */
  async joinUserConversations(socket, userId) {
    try {
      const [conversations] = await pool.execute(
        'SELECT id FROM conversations WHERE user_id = ? AND status = "active"',
        [userId]
      );

      conversations.forEach(conv => {
        const roomName = `conversation_${conv.id}`;
        socket.join(roomName);
        console.log(`📍 User ${userId} joined conversation room ${roomName}`);
      });
    } catch (error) {
      console.error('Error joining user conversations:', error);
    }
  }

  /**
   * Handle joining a conversation room
   * @param {Object} socket - Socket.io socket object
   * @param {Object} data - Event data
   */
  async handleJoinConversation(socket, data) {
    try {
      const { conversation_id } = data;
      const userId = socket.userId;

      if (!conversation_id) {
        socket.emit('error', { message: 'conversation_id is required' });
        return;
      }

      // Verify user has access to this conversation
      const [conversations] = await pool.execute(
        'SELECT * FROM conversations WHERE id = ? AND user_id = ?',
        [conversation_id, userId]
      );

      if (conversations.length === 0) {
        socket.emit('error', { message: 'Access denied to conversation' });
        return;
      }

      const roomName = `conversation_${conversation_id}`;
      socket.join(roomName);

      socket.emit('joined_conversation', {
        conversation_id,
        message: 'Successfully joined conversation'
      });

      console.log(`📍 User ${userId} joined conversation ${conversation_id}`);
    } catch (error) {
      console.error('Error joining conversation:', error);
      socket.emit('error', { message: 'Failed to join conversation' });
    }
  }

  /**
   * Handle sending a real-time message
   * @param {Object} socket - Socket.io socket object
   * @param {Object} data - Message data
   */
  async handleSendMessage(socket, data) {
    try {
      const { conversation_id, message_type = 'text', content, file_id = null } = data;
      const userId = socket.userId;
      const userInfo = socket.userInfo;

      if (!conversation_id || !content) {
        socket.emit('error', { message: 'conversation_id and content are required' });
        return;
      }

      // Verify user has access to this conversation
      const [conversations] = await pool.execute(
        'SELECT * FROM conversations WHERE id = ? AND user_id = ?',
        [conversation_id, userId]
      );

      if (conversations.length === 0) {
        socket.emit('error', { message: 'Access denied to conversation' });
        return;
      }

      // Insert message into database
      const [result] = await pool.execute(
        'INSERT INTO messages (conversation_id, user_id, sender_role, message_type, content, file_id) VALUES (?, ?, "user", ?, ?, ?)',
        [conversation_id, userId, message_type, content, file_id]
      );

      // Construct message object
      const messageData = {
        id: result.insertId,
        conversation_id,
        sender_role: 'user',
        message_type,
        content,
        file_id,
        timestamp: new Date().toISOString(),
        sender_identifier: `user_${userInfo.device_id}`
      };

      // Emit to conversation room
      this.emitToConversation(conversation_id, 'new_message', messageData);

      // Update WebSocket message metrics
      if (global.metricsService) {
        global.metricsService.incrementWebSocketMessages('user_message').catch(console.error);
      }

      console.log(`💬 Message sent by user ${userId} in conversation ${conversation_id}`);
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  /**
   * Handle typing indicator
   * @param {Object} socket - Socket.io socket object
   * @param {Object} data - Typing data
   * @param {boolean} typing - Typing status
   */
  async handleTypingIndicator(socket, data, typing) {
    try {
      const { conversation_id } = data;
      const userId = socket.userId;
      const userInfo = socket.userInfo;

      if (!conversation_id) {
        socket.emit('error', { message: 'conversation_id is required' });
        return;
      }

      // Verify user has access to this conversation
      const [conversations] = await pool.execute(
        'SELECT * FROM conversations WHERE id = ? AND user_id = ?',
        [conversation_id, userId]
      );

      if (conversations.length === 0) {
        socket.emit('error', { message: 'Access denied to conversation' });
        return;
      }

      // Emit typing indicator to conversation room (exclude sender)
      socket.to(`conversation_${conversation_id}`).emit('typing_indicator', {
        conversation_id,
        sender_role: 'user',
        typing,
        sender_identifier: `user_${userInfo.device_id}`
      });

      console.log(`⌨️  User ${userId} ${typing ? 'started' : 'stopped'} typing in conversation ${conversation_id}`);
    } catch (error) {
      console.error('Error handling typing indicator:', error);
      socket.emit('error', { message: 'Failed to send typing indicator' });
    }
  }

  /**
   * Handle client disconnection
   * @param {Object} socket - Socket.io socket object
   */
  handleDisconnect(socket) {
    const userId = this.socketUsers.get(socket.id);

    if (userId) {
      this.connectedUsers.delete(userId);
      this.socketUsers.delete(socket.id);
      console.log(`🔌 User ${userId} disconnected from WebSocket`);

      // Update WebSocket metrics
      if (global.metricsService) {
        console.log('📊 Decrementing WebSocket connection metrics...');
        global.metricsService.decrementWebSocketConnections().catch(console.error);
      } else {
        console.warn('⚠️ global.metricsService not available for WebSocket metrics');
      }
    }
  }

  /**
   * Emit event to all users in a conversation
   * @param {number} conversationId - Conversation ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToConversation(conversationId, event, data) {
    if (this.io) {
      this.io.to(`conversation_${conversationId}`).emit(event, data);
    }
  }

  /**
   * Emit event to a specific user
   * @param {number} userId - User ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToUser(userId, event, data) {
    if (this.io) {
      const socketId = this.connectedUsers.get(userId);
      if (socketId) {
        this.io.to(socketId).emit(event, data);
      }
    }
  }

  /**
   * Join admin rooms for dashboard and notifications
   * @param {Object} socket - Socket.io socket object
   * @param {number} adminId - Admin user ID
   */
  async joinAdminRooms(socket, adminId) {
    try {
      // Join general admin rooms
      socket.join('admin_dashboard');
      socket.join('admin_notifications');
      socket.join(`admin_${adminId}`);
      
      console.log(`🔑 Admin ${adminId} joined admin rooms`);

      // Get admin's assigned conversations
      const [conversations] = await pool.execute(
        'SELECT id FROM conversations WHERE admin_id = ? AND status IN ("active", "pending")',
        [adminId]
      );

      // Join assigned conversation rooms
      for (const conversation of conversations) {
        socket.join(`conversation_${conversation.id}`);
      }

      console.log(`📋 Admin ${adminId} joined ${conversations.length} assigned conversation rooms`);
    } catch (error) {
      console.error('Error joining admin rooms:', error);
    }
  }

  /**
   * Handle admin joining specific rooms
   * @param {Object} socket - Socket.io socket object
   * @param {Object} data - Room data
   */
  handleJoinAdminRooms(socket, data) {
    if (data.rooms && Array.isArray(data.rooms)) {
      data.rooms.forEach(room => {
        socket.join(room);
        console.log(`🔑 Admin ${socket.userId} joined room: ${room}`);
      });
    }
  }

  /**
   * Handle admin conversation assignment
   * @param {Object} socket - Socket.io socket object
   * @param {Object} data - Assignment data
   */
  async handleAdminAssignConversation(socket, data) {
    try {
      const { conversation_id, admin_id } = data;
      
      // Join the conversation room
      socket.join(`conversation_${conversation_id}`);
      
      // Notify other admins about the assignment
      this.emitToAdmins('admin_conversation_assigned', {
        conversation_id,
        admin_id,
        assigned_by: socket.userId,
        timestamp: new Date().toISOString()
      });

      console.log(`🎯 Admin ${socket.userId} assigned conversation ${conversation_id} to admin ${admin_id}`);
    } catch (error) {
      console.error('Error handling admin conversation assignment:', error);
    }
  }

  /**
   * Emit event to all connected admins
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToAdmins(event, data) {
    if (this.io) {
      this.io.to('admin_dashboard').emit(event, data);
    }
  }

  /**
   * Emit event to a specific admin
   * @param {number} adminId - Admin ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToAdmin(adminId, event, data) {
    if (this.io) {
      this.io.to(`admin_${adminId}`).emit(event, data);
    }
  }

  /**
   * Send admin message to conversation
   * @param {number} conversationId - Conversation ID
   * @param {number} adminId - Admin ID
   * @param {string} content - Message content
   * @param {string} messageType - Message type
   */
  async sendAdminMessage(conversationId, adminId, content, messageType = 'text') {
    try {
      // Insert message into database
      const [result] = await pool.execute(
        'INSERT INTO messages (conversation_id, admin_id, sender_role, message_type, content) VALUES (?, ?, "admin", ?, ?)',
        [conversationId, adminId, messageType, content]
      );

      // Construct message object
      const messageData = {
        id: result.insertId,
        conversation_id: conversationId,
        sender_role: 'admin',
        message_type: messageType,
        content,
        timestamp: new Date().toISOString(),
        sender_identifier: "admin"
      };

      // Emit to conversation room
      this.emitToConversation(conversationId, 'new_message', messageData);

      console.log(`💬 Admin message sent by admin in conversation ${conversationId}`);
      return messageData;
    } catch (error) {
      console.error('Error sending admin message:', error);
      throw error;
    }
  }

  /**
   * Get online users count
   * @returns {number} Number of connected users
   */
  getOnlineUsersCount() {
    return this.connectedUsers.size;
  }

  /**
   * Check if user is online
   * @param {number} userId - User ID
   * @returns {boolean} True if user is online
   */
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }
}

// Export singleton instance
module.exports = new SocketService();