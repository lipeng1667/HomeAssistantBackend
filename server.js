/**
 * @file server.js
 * @description Main server file for the Home Assistant Platform Backend
 * @author Michael Lee
 * @created 2024-03-19
 * @modified 2024-03-19
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

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
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
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 