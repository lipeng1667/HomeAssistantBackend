/**
 * @file server.js
 * @description Main server file for the Home Assistant Platform Backend
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-06-17
 * 
 * This file sets up the Express server, configures middleware,
 * and organizes all API routes for the Home Assistant Platform.
 * 
 * Dependencies:
 * - express: Web framework
 * - cors: Cross-origin resource sharing
 * - helmet: Security headers
 * - morgan: HTTP request logging
 * - express-rate-limit: Rate limiting
 * 
 * Routes:
 * - /api/auth: Authentication routes
 * - /api/forum: Forum routes
 * - /api/chat: Chat routes
 * - /api/logs: Activity logging routes
 * - /api/admin: Admin routes
 */

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const config = require('./config')
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler')
const { localhostOnly } = require('./middleware/auth')
const fs = require('fs')
const path = require('path')

// Import Redis client and metrics service (ES modules)
import('./config/redis.js').then(module => {
  const redisClient = module.default
  redisClient.connect().catch(console.error)
})
import('./services/metrics.js').then(module => {
  global.metricsService = module.default
})
import('./middleware/metrics.js').then(module => {
  global.metricsMiddleware = module.default
})
import('./middleware/redisRateLimit.js').then(module => {
  global.redisRateLimit = module.default
  global.slidingWindowRateLimit = module.slidingWindowRateLimit
})

// Import routes
const authRoutes = require('./routes/auth')
const forumRoutes = require('./routes/forum')
const chatRoutes = require('./routes/chat')
const logRoutes = require('./routes/logs')
const adminRoutes = require('./routes/admin')
const healthRoutes = require('./routes/health')

const app = express();

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create access log stream
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'),
  { flags: 'a' } // Append mode
);

// Define internal/system endpoints that should be filtered out from logs
const internalEndpoints = [
  '/health',
  '/health/db',
  '/health/detailed',
  '/api/cli-stats',
  '/favicon.ico'
];

// Custom Morgan filter function to exclude internal endpoints
const shouldLogRequest = (req) => {
  const url = req.url.split('?')[0]; // Remove query parameters for matching
  return !internalEndpoints.some(endpoint => url.startsWith(endpoint));
};

// Trust proxy headers for proper IP detection behind Nginx
app.set('trust proxy', true);

// === Redis-based Metrics System ===
const serverStartTime = Date.now();
let activeConnections = 0;

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
        activeConnections,
        serverStartTime: new Date(serverStartTime).toISOString()
      });
    } else {
      // Fallback response when Redis is not available
      res.json({
        error: 'Metrics service not available',
        uptime: Math.round((Date.now() - serverStartTime) / 1000),
        activeConnections,
        serverStartTime: new Date(serverStartTime).toISOString()
      });
    }
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      uptime: Math.round((Date.now() - serverStartTime) / 1000),
      activeConnections
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
// Apply Morgan logging with filtering
app.use(morgan('combined', {
  stream: accessLogStream,
  skip: (req) => !shouldLogRequest(req)
}))
// app.use(morgan('dev', {
//   skip: (req) => !shouldLogRequest(req)
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

const createAuthLimiter = () => {
  if (global.slidingWindowRateLimit) {
    return global.slidingWindowRateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: config.rateLimit.maxAuthAttempts,
      message: {
        status: 'error',
        message: 'Too many login attempts, please try again later'
      }
    })
  }
  // Fallback to express-rate-limit
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.rateLimit.maxAuthAttempts,
    message: {
      status: 'error',
      message: 'Too many login attempts, please try again later'
    }
  })
}

// Apply rate limiting with Redis-backed limiters when available
setTimeout(() => {
  const apiLimiter = createApiLimiter()
  const authLimiter = createAuthLimiter()
  
  app.use('/api/auth/login', authLimiter)
  app.use('/api/admin/login', authLimiter)
  app.use('/api', apiLimiter)
}, 1000) // Small delay to ensure Redis modules are loaded

// Routes
app.use('/health', localhostOnly, healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/forum', forumRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/logs', logRoutes)
app.use('/api/admin', adminRoutes)

// 404 handler
app.use(notFoundHandler)

// Global error handler
app.use(errorHandler)

const server = app.listen(config.server.port, config.server.host, () => {
  console.log(`🚀 Server running on ${config.server.host}:${config.server.port}`)
  console.log(`📊 Environment: ${config.server.env}`)
  console.log(`🔗 Health check: http://${config.server.host}:${config.server.port}/health`)
})

// Track active HTTP connections
server.on('connection', (socket) => {
  // Get the remote address of the connection
  const remoteAddress = socket.remoteAddress;

  // Skip counting localhost connections (dashboard connections)
  const isLocalhost = remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === 'localhost' ||
    remoteAddress === '::ffff:127.0.0.1'; // IPv4-mapped IPv6

  if (!isLocalhost) {
    activeConnections++;
    socket.on('close', () => {
      activeConnections--;
    });
  }
});