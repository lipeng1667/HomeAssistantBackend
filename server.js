/**
 * @file server.js
 * @description Main Express server with Redis-based distributed metrics and rate limiting
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-06-27
 * 
 * This file sets up the Express server with comprehensive middleware stack,
 * Redis-based distributed metrics collection, cluster-aware rate limiting,
 * and organizes all API routes for the Home Assistant Platform.
 * 
 * Modification Log:
 * - 2025-06-17: Initial Express server setup with basic middleware
 * - 2025-06-27: Added Redis-based metrics system for PM2 cluster coordination
 * - 2025-06-27: Implemented distributed rate limiting with Redis backend
 * - 2025-06-27: Enhanced /api/cli-stats endpoint with comprehensive metrics
 * - 2025-06-27: Added graceful fallbacks for Redis unavailability
 * 
 * Functions:
 * - Express app configuration with security middleware
 * - Redis metrics middleware integration
 * - Distributed rate limiting setup with fallbacks
 * - System endpoints for dashboard monitoring
 * - Connection tracking and logging
 * 
 * Dependencies:
 * - express: Web framework
 * - cors: Cross-origin resource sharing
 * - helmet: Security headers
 * - morgan: HTTP request logging with file output
 * - express-rate-limit: Fallback rate limiting
 * - config/redis.js: Redis client for distributed operations
 * - services/metrics.js: Redis-based metrics aggregation
 * - middleware/metrics.js: Automatic request metrics collection
 * - middleware/redisRateLimit.js: Distributed rate limiting
 * 
 * Routes:
 * Business Logic Routes:
 * - /api/auth: User authentication and authorization
 * - /api/forum: Forum questions and replies
 * - /api/chat: Real-time messaging between users
 * - /api/logs: User activity logging and audit trails
 * 
 * System Routes (localhost only):
 * - /health: Basic health check endpoint
 * - /health/db: Database connectivity check
 * - /health/detailed: Comprehensive system status
 * - /api/cli-stats: Dashboard metrics endpoint with Redis aggregation
 * 
 * Redis Integration:
 * - Distributed metrics across PM2 instances
 * - Cluster-aware rate limiting
 * - Time-series data for performance analytics
 * - Automatic fallback when Redis unavailable
 */

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const config = require('./config')
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler')
const { localhostOnly } = require('./middleware/userAuth')
const fs = require('fs')
const path = require('path')

// Import Redis client and metrics service (CommonJS)
const redisClient = require('./config/redis')
const metricsService = require('./services/metrics')
const metricsMiddleware = require('./middleware/metrics')
const { redisRateLimit, slidingWindowRateLimit } = require('./middleware/redisRateLimit')
const { validateAppAuth } = require('./middleware/appAuth')

// Initialize Redis connection
redisClient.connect().catch(console.error)

// Set global references for middleware access
global.metricsService = metricsService
global.metricsMiddleware = metricsMiddleware
global.redisRateLimit = redisRateLimit
global.slidingWindowRateLimit = slidingWindowRateLimit

// Import routes
const authRoutes = require('./routes/auth')
const forumRoutes = require('./routes/forum')
const chatRoutes = require('./routes/chat')
const logRoutes = require('./routes/logs')
const healthRoutes = require('./routes/health')
const adminRoutes = require('./routes/admin/index')

// Import Socket.io service
const socketService = require('./services/socketService')

const app = express();

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Ensure upload directories exist
const forumUploadDir = path.join(__dirname, 'uploads', 'forum');
const chatUploadDir = path.join(__dirname, 'uploads', 'chat');
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(forumUploadDir)) {
  fs.mkdirSync(forumUploadDir, { recursive: true });
}
if (!fs.existsSync(chatUploadDir)) {
  fs.mkdirSync(chatUploadDir, { recursive: true });
}
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Create access log stream
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'),
  { flags: 'a' } // Append mode
);

// Define internal/system endpoints that should be filtered out from logs
const internalEndpoints = [
  '/health/api',        // Main health endpoint
  '/health/db',         // Database health check
  '/health/detailed',   // Detailed health
  '/api/cli-stats',     // Dashboard stats
  '/favicon.ico'        // Browser icon requests
];

// Custom Morgan filter function to exclude internal endpoints
const isInternalRequest = (req) => {
  const url = req.originalUrl || req.url;
  return internalEndpoints.some(endpoint => url.startsWith(endpoint));
};

// Trust proxy headers for proper IP detection behind Nginx
app.set('trust proxy', true);

// === Redis-based Metrics System ===
const serverStartTime = Date.now();

// Use Redis metrics middleware when available
app.use((req, res, next) => {
  if (global.metricsMiddleware) {
    global.metricsMiddleware(req, res, next);
  } else {
    next();
  }
});

app.get('/api/cli-stats', localhostOnly, async (req, res) => {
  try {
    if (global.metricsService) {
      const metrics = await global.metricsService.getMetrics();
      res.json({
        ...metrics,
        uptime: Math.round((Date.now() - serverStartTime) / 1000),
        serverStartTime: new Date(serverStartTime).toISOString()
      });
    } else {
      // Fallback response when Redis is not available
      res.json({
        error: 'Metrics service not available',
        uptime: Math.round((Date.now() - serverStartTime) / 1000),
        activeConnections: 0,
        serverStartTime: new Date(serverStartTime).toISOString()
      });
    }
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      uptime: Math.round((Date.now() - serverStartTime) / 1000),
      activeConnections: 0
    });
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}))
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve uploaded files statically
app.use('/uploads/forum', express.static(path.join(__dirname, 'uploads', 'forum'), {
  maxAge: '1d', // Cache for 1 day
  etag: true,
  lastModified: true
}))

// Serve chat uploaded files statically
app.use('/uploads/chat', express.static(path.join(__dirname, 'uploads', 'chat'), {
  maxAge: '1d', // Cache for 1 day
  etag: true,
  lastModified: true
}))
// Custom Morgan format with local timezone and enhanced logging
morgan.token('localdate', () => {
  return new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Shanghai',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/,/g, '');
});

// Custom token to truncate response time to integer
morgan.token('response-time-int', function (req, res) {
  if (!req._startAt || !res._startAt) {
    return '-'
  }

  const ms = (res._startAt[0] - req._startAt[0]) * 1e3 +
    (res._startAt[1] - req._startAt[1]) * 1e-6

  return Math.floor(ms).toString()
})

// Enhanced Morgan format with response time, forwarded IPs, and API-specific data
const logFormat = ':remote-addr - :req[x-forwarded-for] [:localdate +0800] ":method :url HTTP/:http-version" :status :res[content-length] :response-time-int ms ":referrer" ":user-agent" ":req[content-type]"';

// Apply Morgan logging with filtering - skip internal endpoints  
app.use(morgan(logFormat, {
  stream: accessLogStream,
  skip: (req) => isInternalRequest(req)
}))
// app.use(morgan('dev', {
//   skip: (req) => isInternalRequest(req)
// }))

// Rate limiting - Redis-backed with fallback to express-rate-limit
const createApiLimiter = () => {
  if (global.redisRateLimit) {
    return global.redisRateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      message: {
        status: 'error',
        message: 'Too many requests, please try again later'
      }
    })
  }
  // Fallback to express-rate-limit
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      status: 'error',
      message: 'Too many requests, please try again later'
    }
  })
}

const createApiSlidingWindowLimiter = () => {
  if (global.slidingWindowRateLimit) {
    return global.slidingWindowRateLimit({
      windowMs: config.rateLimit.windowMs, // 15 minutes
      max: config.rateLimit.maxAuthAttempts,
      message: {
        status: 'error',
        message: 'Too many login attempts, please try again later'
      }
    })
  }
  // Fallback to express-rate-limit
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxAuthAttempts,
    message: {
      status: 'error',
      message: 'Too many login attempts, please try again later'
    }
  })
}

// Apply rate limiting with Redis-backed limiters
const apiLimiter = createApiLimiter()
// TODO: add sliding window limiter for further endpoints
const apiSlidingWindowLimiter = createApiSlidingWindowLimiter()

// Apply app authentication and rate limiting to every API endpoints
app.use('/api', validateAppAuth, apiLimiter)

// Routes
app.use('/health', localhostOnly, healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/forum', forumRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/logs', logRoutes)
app.use('/admin', adminRoutes)

// 404 handler
app.use(notFoundHandler)

// Global error handler
app.use(errorHandler)

const server = app.listen(config.server.port, config.server.host, () => {
  console.log(`🚀 Server running on ${config.server.host}:${config.server.port}`)
  console.log(`📊 Environment: ${config.server.env}`)
  console.log(`🔗 Health check: http://${config.server.host}:${config.server.port}/health`)
})

// Initialize Socket.io for real-time messaging (delay for Redis connection)
setTimeout(() => {
  socketService.initializeSocket(server)
  global.socketService = socketService
}, 2000) // Wait 2 seconds for Redis to connect

// Track active HTTP connections with Redis cluster-wide aggregation
server.on('connection', (socket) => {
  // Get the remote address of the connection
  const remoteAddress = socket.remoteAddress;

  // Skip counting localhost connections (dashboard connections)
  const isLocalhost = remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === 'localhost' ||
    remoteAddress === '::ffff:127.0.0.1'; // IPv4-mapped IPv6

  if (!isLocalhost) {
    // Update Redis cluster-wide connection count
    if (global.metricsService) {
      global.metricsService.incrementConnections().catch(console.error);
    }

    socket.on('close', () => {
      // Update Redis cluster-wide connection count
      if (global.metricsService) {
        global.metricsService.decrementConnections().catch(console.error);
      }
    });
  }
});

// Calculate and update request speed every 5 seconds
let lastRequestCount = 0;
let lastSpeedUpdate = Date.now();

setInterval(async () => {
  if (global.metricsService) {
    try {
      const metrics = await global.metricsService.getMetrics();
      const currentRequests = metrics.total?.requests || 0;
      const currentTime = Date.now();

      const timeDiff = (currentTime - lastSpeedUpdate) / 1000; // seconds
      const requestDiff = currentRequests - lastRequestCount;

      if (timeDiff > 0) {
        const currentSpeed = requestDiff / timeDiff;
        await global.metricsService.updateRequestSpeed(Math.round(currentSpeed * 100) / 100);
      }

      lastRequestCount = currentRequests;
      lastSpeedUpdate = currentTime;
    } catch (error) {
      console.error('Error calculating request speed:', error);
    }
  }
}, 5000); // Update every 5 seconds