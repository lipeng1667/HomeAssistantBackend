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

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./routes/auth');
const forumRoutes = require('./routes/forum');
const chatRoutes = require('./routes/chat');
const logRoutes = require('./routes/logs');
const adminRoutes = require('./routes/admin');

const app = express();

// Trust proxy headers for proper IP detection behind Nginx
app.set('trust proxy', true);

// === Simple Stats Middleware for CLI Dashboard ===
const stats = {
  total: 0,
  perPath: {},
  start: Date.now()
};

let activeConnections = 0;

app.use((req, res, next) => {
  // Get the real client IP (works with and without Nginx)
  const clientIP = req.ip;

  // Skip counting requests from localhost (dashboard requests)
  const isLocalhost = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === 'localhost';

  if (!isLocalhost) {
    stats.total++;
    stats.perPath[req.path] = (stats.perPath[req.path] || 0) + 1;
  }

  next();
});

app.get('/api/cli-stats', (req, res) => {
  res.json({
    totalRequests: stats.total,
    perPath: stats.perPath,
    uptime: Math.round((Date.now() - stats.start) / 1000), // seconds
    activeConnections
  });
});

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10) // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!'
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

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