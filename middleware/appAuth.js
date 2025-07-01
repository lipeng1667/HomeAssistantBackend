/**
 * @file middleware/appAuth.js
 * @description App-level authentication middleware for iOS client validation
 * @author Michael Lee
 * @created 2025-06-30
 * @modified 2025-06-30
 * 
 * This middleware validates that requests come from the authorized iOS app using
 * timestamp-based signature validation with a shared secret key. It prevents
 * unauthorized access to authentication endpoints from unknown sources.
 * 
 * Modification Log:
 * - 2025-06-30: Initial implementation with timestamp + HMAC signature validation
 * 
 * Functions:
 * - validateAppAuth(req, res, next): Validates iOS app requests with signature
 * 
 * Dependencies:
 * - crypto: Built-in Node.js crypto module for HMAC validation
 * - config: Application configuration with iOS secret
 * 
 * Security Features:
 * - Timestamp validation (±5 minute window)
 * - HMAC-SHA256 signature verification
 * - Prevents replay attacks with time-based validation
 * - Blocks requests from unauthorized sources
 * 
 * Required Headers:
 * - X-Timestamp: Unix timestamp in milliseconds
 * - X-Signature: HMAC-SHA256(secret + timestamp)
 */

const crypto = require('crypto');
const config = require('../config');

/**
 * Validates that HTTP requests originate from the authorized iOS application
 * @param {Object} req - Express request object with app authentication headers
 * @param {Object} res - Express response object for error responses
 * @param {Function} next - Next middleware function in Express chain
 * @returns {void} Calls next() on success or sends 401/400 error response
 * @sideEffects Validates headers, checks timestamps, verifies HMAC signatures
 * @throws Does not throw - returns HTTP error responses for invalid requests
 * @example
 * // Apply to authentication endpoints
 * app.use('/api/auth/login', validateAppAuth, authRoutes)
 * 
 * // Client-side signature generation:
 * const timestamp = Date.now()
 * const payload = `${timestamp}`
 * const signature = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex')
 */
const validateAppAuth = (req, res, next) => {
  try {
    const timestamp = req.headers['x-timestamp'];
    const clientSignature = req.headers['x-signature'];

    // Validate required headers
    if (!timestamp || !clientSignature) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required headers'
      });
    }

    // Validate timestamp (±5 minutes)
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    const timeDiff = Math.abs(now - requestTime);
    const maxTimeDiff = config.app.timestampWindow;

    if (timeDiff > maxTimeDiff) {
      return res.status(401).json({
        status: 'error',
        message: 'Request timestamp too old or too far in future'
      });
    }

    // Generate expected signature: HMAC-SHA256(secret, timestamp)
    const appSecret = config.app.appSecret;
    if (!appSecret) {
      console.error('APP app secret not configured');
      return res.status(500).json({
        status: 'error',
        message: 'Server configuration error'
      });
    }

    const payload = `${timestamp}`;
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');

    // Compare signatures (constant-time comparison to prevent timing attacks)
    if (!crypto.timingSafeEqual(Buffer.from(clientSignature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid signature'
      });
    }

    // Add app info to request for logging
    req.appAuth = {
      timestamp: requestTime,
      verified: true
    };

    next();
  } catch (error) {
    console.error('App authentication error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Authentication validation failed'
    });
  }
};

module.exports = {
  validateAppAuth
};