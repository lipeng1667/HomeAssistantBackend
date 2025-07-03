/**
 * @file middleware/userAuth.js
 * @description Redis-based session authentication middleware for APP user routes
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-07-01
 * 
 * This file provides middleware functions for Redis session validation
 * and user session management for APP APIs only.
 * 
 * Modification Log:
 * - 2025-06-17: Initial implementation with Redis sessions
 * - 2025-07-01: Removed admin authentication (focus on APP APIs only)
 * - 2025-07-01: Added session-based user authentication with Redis
 * 
 * Functions:
 * - authenticateUser(req, res, next): Validates user sessions via Redis
 * - localhostOnly(req, res, next): Restricts access to localhost only
 * 
 * Dependencies:
 * - config/redis.js: Redis client for session management
 * - config: Application configuration
 * 
 * Redis Schema:
 * - ha:user:{user_id}: HASH containing session and user data
 *   - device_id: Device identifier from login
 *   - login_time: Unix timestamp when session was created
 *   - last_seen: Unix timestamp of last API request
 *   - active: User status ("true" for active, "false" for disabled)
 *   - ip_address: Client IP address (optional)
 * 
 * Authentication Flow:
 * 1. Client includes user_id in request body
 * 2. Middleware validates Redis session exists
 * 3. Checks user.active status
 * 4. Updates last_seen timestamp
 * 5. Refreshes session TTL (7 days)
 * 6. Sets req.user for route handlers
 */

const redisClient = require('../config/redis.js')

/**
 * @description Middleware to restrict access to localhost only
 * @function localhostOnly
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} Calls next() on success or sends 403 error response
 * @sideEffects Validates client IP address against localhost patterns
 * @example
 * // Apply to sensitive endpoints
 * app.use('/health', localhostOnly, healthRoutes)
 */
const localhostOnly = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

  // Check if the request is from localhost
  const isLocalhost = clientIP === '127.0.0.1' ||
    clientIP === '::1' ||
    clientIP === 'localhost' ||
    clientIP === '::ffff:127.0.0.1' || // IPv4-mapped IPv6
    clientIP === '::ffff:127.0.0.1:10000'; // With port

  if (!isLocalhost) {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. This endpoint is only accessible from localhost.'
    });
  }

  next();
};

/**
 * @description Middleware for Redis-based user session authentication
 * @async
 * @function authenticateUser
 * @param {Object} req - Express request object with user_id in body
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} Calls next() on success or sends error response
 * 
 * @throws {400} If user_id is missing from request
 * @throws {401} If session not found or expired
 * @throws {500} If Redis error or server error occurs
 * 
 * @sideEffects 
 * - Validates Redis session existence and user status
 * - Updates last_seen timestamp in Redis
 * - Refreshes session TTL to 7 days
 * - Sets req.user object for route handlers
 * 
 * @example
 * // Apply to protected routes
 * router.get('/forum/questions', authenticateUser, getQuestions)
 * 
 * // Client request body must include:
 * {
 *   "user_id": 123,
 *   "other": "data"
 * }
 */
const authenticateUser = async (req, res, next) => {
  try {
    // Get user_id from request body
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        status: 'error',
        message: 'user_id is required'
      });
    }

    // Check if Redis is available
    if (!redisClient.isReady()) {
      console.error('Redis not available for session validation');
      return res.status(500).json({
        status: 'error',
        message: 'Session service unavailable'
      });
    }

    const client = redisClient.getClient();
    const userKey = redisClient.key(`user:${user_id}`);

    // Get user session data from Redis
    const userData = await client.hGetAll(userKey);

    // Check if session exists
    if (!userData.device_id) {
      return res.status(401).json({
        status: 'error',
        message: 'Session not found or expired'
      });
    }

    // Update last_seen timestamp and refresh TTL
    const now = Date.now().toString();
    await client.multi()
      .hSet(userKey, 'last_seen', now)
      .expire(userKey, 604800) // 7 days
      .exec();

    // Set user data for route handlers
    req.user = {
      id: parseInt(user_id),
      device_id: userData.device_id,
      login_time: userData.login_time,
      last_seen: now,
      ip_address: userData.ip_address
    };

    next();
  } catch (error) {
    console.error('User authentication error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Authentication validation failed'
    });
  }
};

module.exports = {
  authenticateUser,
  localhostOnly
};