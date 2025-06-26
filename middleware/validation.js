/**
 * @file validation.js
 * @description Input validation middleware using Zod schemas
 * @author Michael Lee
 * @created 2025-06-26
 * @modified 2025-06-26
 * 
 * This file provides comprehensive input validation for all API endpoints
 * using Zod schema validation with detailed error reporting.
 * 
 * Dependencies:
 * - zod: Schema validation library
 * 
 * Schemas:
 * - userLogin: UUID and device_id validation for user authentication
 * - userLog: Action type and details validation for activity logging
 * - forumQuestion: Title and content validation for forum posts
 * - forumReply: Content validation for forum replies
 * - chatMessage: Message content validation for chat
 * - adminLogin: Username and password validation for admin auth
 */

const { z } = require('zod')

// User validation schemas
const userLoginSchema = z.object({
  uuid: z.string().uuid('Invalid UUID format'),
  device_id: z.string().min(1, 'Device ID is required').max(255, 'Device ID too long')
})

const userLogSchema = z.object({
  action_type: z.string().min(1, 'Action type is required').max(50, 'Action type too long'),
  details: z.string().optional()
})

// Forum validation schemas
const forumQuestionSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title too long'),
  content: z.string().min(1, 'Content is required').max(10000, 'Content too long')
})

const forumReplySchema = z.object({
  content: z.string().min(1, 'Content is required').max(10000, 'Content too long')
})

// Chat validation schemas
const chatMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(1000, 'Message too long')
})

// Admin validation schemas
const adminLoginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100, 'Username too long'),
  password: z.string().min(1, 'Password is required')
})

/**
 * Validation middleware factory
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {string} source - Source of data ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const data = req[source]
      const validatedData = schema.parse(data)
      req[source] = validatedData
      next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        })
      }
      next(error)
    }
  }
}

module.exports = {
  validate,
  schemas: {
    userLogin: userLoginSchema,
    userLog: userLogSchema,
    forumQuestion: forumQuestionSchema,
    forumReply: forumReplySchema,
    chatMessage: chatMessageSchema,
    adminLogin: adminLoginSchema
  }
}