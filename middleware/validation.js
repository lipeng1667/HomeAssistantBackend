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
 * - forumTopic: Title, content, category validation for forum topics
 * - forumTopicUpdate: Optional fields for topic updates
 * - forumReply: Content validation for forum replies
 * - forumReplyUpdate: Content validation for reply updates
 * - forumLike: User ID validation for like/unlike actions
 * - forumSearch: Search query validation
 * - forumDraft: Draft validation for topics and replies
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
const forumTopicSchema = z.object({
  user_id: z.number().int().positive('User ID must be a positive integer'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be less than 100 characters'),
  content: z.string().min(10, 'Content must be at least 10 characters').max(2000, 'Content must be less than 2000 characters'),
  category: z.string().min(1, 'Category is required').max(100, 'Category name too long'),
  images: z.array(z.string().url('Invalid image URL')).max(3, 'Maximum 3 images allowed').optional()
})

const forumTopicUpdateSchema = z.object({
  user_id: z.number().int().positive('User ID must be a positive integer'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be less than 100 characters').optional(),
  content: z.string().min(10, 'Content must be at least 10 characters').max(2000, 'Content must be less than 2000 characters').optional(),
  category: z.string().min(1, 'Category is required').max(100, 'Category name too long').optional(),
  images: z.array(z.string().url('Invalid image URL')).max(3, 'Maximum 3 images allowed').optional()
})

const forumReplySchema = z.object({
  user_id: z.number().int().positive('User ID must be a positive integer'),
  content: z.string().min(1, 'Content is required').max(1000, 'Content must be less than 1000 characters'),
  parent_reply_id: z.number().int().positive('Parent reply ID must be a positive integer').optional(),
  images: z.array(z.string().url('Invalid image URL')).max(2, 'Maximum 2 images allowed').optional()
})

const forumReplyUpdateSchema = z.object({
  user_id: z.number().int().positive('User ID must be a positive integer'),
  content: z.string().min(1, 'Content is required').max(1000, 'Content must be less than 1000 characters'),
  images: z.array(z.string().url('Invalid image URL')).max(2, 'Maximum 2 images allowed').optional()
})

const forumLikeSchema = z.object({
  user_id: z.number().int().positive('User ID must be a positive integer')
})

const forumSearchSchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters').max(100, 'Search query too long'),
  type: z.enum(['topics', 'replies', 'all']).optional(),
  category: z.string().max(100, 'Category name too long').optional(),
  page: z.number().int().min(1, 'Page must be at least 1').optional(),
  limit: z.number().int().min(1, 'Limit must be at least 1').max(50, 'Limit cannot exceed 50').optional()
})

const forumDraftSchema = z.object({
  user_id: z.number().int().positive('User ID must be a positive integer'),
  type: z.enum(['topic', 'reply'], { required_error: 'Type must be either topic or reply' }),
  title: z.string().min(1, 'Title is required').max(255, 'Title too long').optional(),
  content: z.string().min(1, 'Content is required').max(2000, 'Content too long').optional(),
  category: z.string().min(1, 'Category is required').max(100, 'Category name too long').optional(),
  topic_id: z.number().int().positive('Topic ID must be a positive integer').optional()
})

const forumTopicsQuerySchema = z.object({
  page: z.number().int().min(1, 'Page must be at least 1').optional(),
  limit: z.number().int().min(1, 'Limit must be at least 1').max(50, 'Limit cannot exceed 50').optional(),
  category: z.string().max(100, 'Category name too long').optional(),
  sort: z.enum(['newest', 'oldest', 'popular', 'trending']).optional(),
  search: z.string().min(1, 'Search term cannot be empty').max(100, 'Search term too long').optional()
})

const forumRepliesQuerySchema = z.object({
  page: z.number().int().min(1, 'Page must be at least 1').optional(),
  limit: z.number().int().min(1, 'Limit must be at least 1').max(50, 'Limit cannot exceed 50').optional(),
  sort: z.enum(['newest', 'oldest', 'popular']).optional()
})

const forumDraftsQuerySchema = z.object({
  user_id: z.number().int().positive('User ID must be a positive integer'),
  type: z.enum(['topic', 'reply']).optional(),
  page: z.number().int().min(1, 'Page must be at least 1').optional(),
  limit: z.number().int().min(1, 'Limit must be at least 1').max(50, 'Limit cannot exceed 50').optional()
})

const forumDeleteSchema = z.object({
  user_id: z.number().int().positive('User ID must be a positive integer')
})

// Upload validation schemas
const forumUploadSchema = z.object({
  user_id: z.number().int().positive('User ID must be a positive integer'),
  type: z.enum(['topic', 'reply'], { required_error: 'Type must be either topic or reply' }),
  post_id: z.number().int().positive('Post ID must be a positive integer').optional()
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
 * Transform query string parameters to appropriate types
 * @param {Object} query - Query parameters object
 * @returns {Object} Transformed query parameters
 */
const transformQuery = (query) => {
  const transformed = { ...query }
  
  // Convert numeric fields from strings
  const numericFields = ['page', 'limit', 'user_id', 'topic_id', 'reply_page', 'reply_limit', 'parent_reply_id']
  numericFields.forEach(field => {
    if (transformed[field] !== undefined) {
      const num = parseInt(transformed[field], 10)
      if (!isNaN(num)) {
        transformed[field] = num
      }
    }
  })
  
  return transformed
}

/**
 * Validation middleware factory
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {string} source - Source of data ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      let data = req[source]
      
      // Transform query parameters if needed
      if (source === 'query') {
        data = transformQuery(data)
      }
      
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
    forumTopic: forumTopicSchema,
    forumTopicUpdate: forumTopicUpdateSchema,
    forumReply: forumReplySchema,
    forumReplyUpdate: forumReplyUpdateSchema,
    forumLike: forumLikeSchema,
    forumSearch: forumSearchSchema,
    forumDraft: forumDraftSchema,
    forumTopicsQuery: forumTopicsQuerySchema,
    forumRepliesQuery: forumRepliesQuerySchema,
    forumDraftsQuery: forumDraftsQuerySchema,
    forumDelete: forumDeleteSchema,
    forumUpload: forumUploadSchema,
    chatMessage: chatMessageSchema,
    adminLogin: adminLoginSchema
  }
}