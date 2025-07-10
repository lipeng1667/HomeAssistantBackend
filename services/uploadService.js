/**
 * @file services/uploadService.js
 * @description File upload service for forum attachments with local storage
 * @author Michael Lee
 * @created 2025-07-10
 * @modified 2025-07-10
 * 
 * This service handles instant file uploads for forum topics and replies,
 * storing files locally with date-based directory structure and encrypted filenames.
 * 
 * Modification Log:
 * - 2025-07-10: Initial implementation with local storage and security features
 * 
 * Functions:
 * - uploadFile(fileData, metadata): Process instant file upload
 * - validateFile(file): Validate file type, size, and security
 * - generateSecureFilename(originalName): Create encrypted filename
 * - createDatePath(): Generate date-based directory path
 * - ensureDirectoryExists(dirPath): Create directories if needed
 * - optimizeImage(filePath, mimeType): Optimize uploaded images
 * - getFileInfo(filePath): Extract file metadata
 * - deleteFile(fileId): Remove file from storage and database
 * - cleanupOrphanedFiles(): Remove unused uploaded files
 * - getFileUrl(fileRecord): Generate public URL for file
 * 
 * Security Features:
 * - File type validation against whitelist
 * - File size limits (10MB max)
 * - Secure filename generation with crypto
 * - MIME type verification
 * - Directory traversal protection
 * 
 * Dependencies:
 * - multer: File upload handling
 * - sharp: Image optimization
 * - file-type: MIME type detection
 * - crypto: Secure filename generation
 * - fs: File system operations
 * - path: Path manipulation
 * - config/database.js: Database operations
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { fileTypeFromFile } = require('file-type');
const pool = require('../config/database');

class UploadService {
  constructor() {
    // Configuration
    this.uploadBasePath = path.join(process.cwd(), 'uploads', 'forum');
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.allowedTypes = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/gif': ['gif'],
      'application/pdf': ['pdf'],
      'application/msword': ['doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
      'text/plain': ['txt']
    };
    this.imageTypes = ['image/jpeg', 'image/png', 'image/gif'];
    this.publicUrlBase = '/uploads/forum';
  }

  /**
   * Process instant file upload
   * @async
   * @function uploadFile
   * @param {Object} fileData - Multer file object
   * @param {Object} metadata - Upload metadata
   * @param {number} metadata.user_id - User ID
   * @param {string} metadata.type - Upload type: topic, reply
   * @param {number} metadata.post_id - Associated post ID (optional)
   * @returns {Promise<Object>} Upload result with file info
   * @throws {Error} Validation or storage errors
   * @sideEffects Creates file on disk and database record
   */
  async uploadFile(fileData, metadata) {
    const { user_id, type, post_id } = metadata;
    
    // Validate file
    await this.validateFile(fileData);
    
    // Generate secure filename and paths
    const secureFilename = this.generateSecureFilename(fileData.originalname);
    const datePath = this.createDatePath();
    const typePath = path.join(datePath, type + 's'); // topics or replies
    const fullDirPath = path.join(this.uploadBasePath, typePath);
    const filePath = path.join(fullDirPath, secureFilename);
    const publicUrl = `${this.publicUrlBase}/${typePath}/${secureFilename}`.replace(/\\/g, '/');
    
    // Ensure directory exists
    await this.ensureDirectoryExists(fullDirPath);
    
    // Move uploaded file to final location
    await fs.rename(fileData.path, filePath);
    
    try {
      // Optimize image if needed
      if (this.imageTypes.includes(fileData.mimetype)) {
        await this.optimizeImage(filePath, fileData.mimetype);
      }
      
      // Get final file info
      const fileInfo = await this.getFileInfo(filePath);
      
      // Generate upload session ID
      const uploadId = `upload_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
      
      // Save to database
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();
        
        const [result] = await connection.execute(`
          INSERT INTO forum_uploads (
            user_id, upload_id, filename, original_filename, file_size, 
            mime_type, file_path, file_url, entity_type, entity_id, status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `, [
          user_id,
          uploadId,
          secureFilename,
          fileData.originalname,
          fileInfo.size,
          fileData.mimetype,
          filePath,
          publicUrl,
          type,
          post_id || null,
          JSON.stringify({
            width: fileInfo.width,
            height: fileInfo.height,
            optimized: this.imageTypes.includes(fileData.mimetype)
          })
        ]);
        
        await connection.commit();
        
        return {
          upload_id: uploadId,
          chunk_index: 0,
          total_chunks: 1,
          uploaded_chunks: 1,
          progress_percentage: 100,
          file_url: publicUrl,
          file_id: result.insertId,
          complete: true,
          file_info: {
            filename: secureFilename,
            original_filename: fileData.originalname,
            size: fileInfo.size,
            mime_type: fileData.mimetype,
            width: fileInfo.width,
            height: fileInfo.height
          }
        };
      } catch (dbError) {
        await connection.rollback();
        // Clean up file if database insert fails
        await fs.unlink(filePath).catch(() => {});
        throw dbError;
      } finally {
        connection.release();
      }
    } catch (error) {
      // Clean up file if any processing fails
      await fs.unlink(filePath).catch(() => {});
      throw error;
    }
  }

  /**
   * Validate uploaded file
   * @async
   * @function validateFile
   * @param {Object} file - Multer file object
   * @returns {Promise<void>} Resolves if valid
   * @throws {Error} Validation errors
   * @sideEffects None - validation only
   */
  async validateFile(file) {
    // Check file size
    if (file.size > this.maxFileSize) {
      throw new Error(`File size exceeds maximum limit of ${this.maxFileSize / (1024 * 1024)}MB`);
    }
    
    // Check MIME type
    if (!this.allowedTypes[file.mimetype]) {
      throw new Error(`Unsupported file type. Allowed: ${Object.keys(this.allowedTypes).join(', ')}`);
    }
    
    // Verify actual file type matches MIME type
    try {
      const detectedType = await fileTypeFromFile(file.path);
      if (detectedType && detectedType.mime !== file.mimetype) {
        throw new Error('File type mismatch detected');
      }
    } catch (detectError) {
      // If detection fails, allow but log warning
      console.warn('File type detection failed:', detectError.message);
    }
    
    // Check filename for security
    if (file.originalname.includes('..') || /[<>:"|?*]/.test(file.originalname)) {
      throw new Error('Invalid filename characters detected');
    }
  }

  /**
   * Generate secure filename
   * @function generateSecureFilename
   * @param {string} originalName - Original filename
   * @returns {string} Secure filename
   * @sideEffects None - pure function
   */
  generateSecureFilename(originalName) {
    const ext = path.extname(originalName).toLowerCase();
    const hash = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `${hash}_${timestamp}${ext}`;
  }

  /**
   * Create date-based directory path
   * @function createDatePath
   * @returns {string} Date path (YYYY/MM/DD)
   * @sideEffects None - pure function
   */
  createDatePath() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return path.join(year.toString(), month, day);
  }

  /**
   * Ensure directory exists
   * @async
   * @function ensureDirectoryExists
   * @param {string} dirPath - Directory path to create
   * @returns {Promise<void>} Resolves when directory exists
   * @throws {Error} File system errors
   * @sideEffects Creates directories on filesystem
   */
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Optimize uploaded image
   * @async
   * @function optimizeImage
   * @param {string} filePath - Path to image file
   * @param {string} mimeType - Image MIME type
   * @returns {Promise<void>} Resolves when optimization complete
   * @throws {Error} Image processing errors
   * @sideEffects Modifies image file on disk
   */
  async optimizeImage(filePath, mimeType) {
    try {
      let sharpInstance = sharp(filePath);
      
      // Get image metadata
      const metadata = await sharpInstance.metadata();
      
      // Resize if too large (max 1920x1080)
      if (metadata.width > 1920 || metadata.height > 1080) {
        sharpInstance = sharpInstance.resize(1920, 1080, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      
      // Optimize based on format
      if (mimeType === 'image/jpeg') {
        sharpInstance = sharpInstance.jpeg({ quality: 85, progressive: true });
      } else if (mimeType === 'image/png') {
        sharpInstance = sharpInstance.png({ compressionLevel: 6 });
      }
      
      // Save optimized image
      await sharpInstance.toFile(filePath + '.tmp');
      await fs.rename(filePath + '.tmp', filePath);
    } catch (error) {
      // If optimization fails, keep original
      console.warn('Image optimization failed:', error.message);
      await fs.unlink(filePath + '.tmp').catch(() => {});
    }
  }

  /**
   * Get file information
   * @async
   * @function getFileInfo
   * @param {string} filePath - Path to file
   * @returns {Promise<Object>} File information
   * @throws {Error} File system errors
   * @sideEffects None - read-only operation
   */
  async getFileInfo(filePath) {
    const stats = await fs.stat(filePath);
    const info = {
      size: stats.size,
      width: null,
      height: null
    };
    
    // Get image dimensions if it's an image
    try {
      const metadata = await sharp(filePath).metadata();
      info.width = metadata.width;
      info.height = metadata.height;
    } catch (error) {
      // Not an image or can't read metadata
    }
    
    return info;
  }

  /**
   * Delete file from storage and database
   * @async
   * @function deleteFile
   * @param {number} fileId - File ID from database
   * @param {number} userId - User ID for authorization
   * @returns {Promise<boolean>} True if deleted successfully
   * @throws {Error} Database or authorization errors
   * @sideEffects Removes file from disk and database
   */
  async deleteFile(fileId, userId) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Get file info and verify ownership
      const [files] = await connection.execute(`
        SELECT file_path, user_id FROM forum_uploads WHERE id = ?
      `, [fileId]);
      
      if (files.length === 0) {
        throw new Error('File not found');
      }
      
      if (files[0].user_id !== userId) {
        throw new Error('Unauthorized: You can only delete your own files');
      }
      
      // Mark as deleted in database
      await connection.execute(`
        UPDATE forum_uploads SET status = 3, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [fileId]);
      
      await connection.commit();
      
      // Delete physical file
      try {
        await fs.unlink(files[0].file_path);
      } catch (fsError) {
        console.warn('Failed to delete physical file:', fsError.message);
      }
      
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Clean up orphaned files
   * @async
   * @function cleanupOrphanedFiles
   * @returns {Promise<number>} Number of files cleaned up
   * @throws {Error} Database errors
   * @sideEffects Removes unused files from disk and database
   */
  async cleanupOrphanedFiles() {
    const connection = await pool.getConnection();
    let cleanupCount = 0;
    
    try {
      // Find files older than 24 hours with no entity association
      const [orphanedFiles] = await connection.execute(`
        SELECT id, file_path FROM forum_uploads 
        WHERE entity_id IS NULL 
        AND status = 1 
        AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `);
      
      for (const file of orphanedFiles) {
        try {
          // Delete physical file
          await fs.unlink(file.file_path);
          
          // Mark as deleted in database
          await connection.execute(`
            UPDATE forum_uploads SET status = 3 WHERE id = ?
          `, [file.id]);
          
          cleanupCount++;
        } catch (error) {
          console.warn(`Failed to cleanup file ${file.id}:`, error.message);
        }
      }
      
      return cleanupCount;
    } finally {
      connection.release();
    }
  }

  /**
   * Generate public URL for file
   * @function getFileUrl
   * @param {Object} fileRecord - Database file record
   * @returns {string} Public URL for file
   * @sideEffects None - pure function
   */
  getFileUrl(fileRecord) {
    return fileRecord.file_url;
  }

  /**
   * Get file by ID with user authorization
   * @async
   * @function getFileById
   * @param {number} fileId - File ID
   * @param {number} userId - User ID for authorization
   * @returns {Promise<Object>} File information
   * @throws {Error} File not found or unauthorized
   * @sideEffects None - read-only operation
   */
  async getFileById(fileId, userId) {
    const [files] = await pool.execute(`
      SELECT * FROM forum_uploads 
      WHERE id = ? AND user_id = ? AND status = 1
    `, [fileId, userId]);
    
    if (files.length === 0) {
      throw new Error('File not found or unauthorized');
    }
    
    return files[0];
  }

  /**
   * Get files by entity (topic or reply)
   * @async
   * @function getFilesByEntity
   * @param {string} entityType - Entity type: topic, reply
   * @param {number} entityId - Entity ID
   * @returns {Promise<Array>} Array of file records
   * @throws {Error} Database errors
   * @sideEffects None - read-only operation
   */
  async getFilesByEntity(entityType, entityId) {
    const [files] = await pool.execute(`
      SELECT id, filename, original_filename, file_url, file_size, 
             mime_type, metadata, created_at
      FROM forum_uploads 
      WHERE entity_type = ? AND entity_id = ? AND status = 1
      ORDER BY created_at ASC
    `, [entityType, entityId]);
    
    return files.map(file => ({
      ...file,
      metadata: file.metadata ? JSON.parse(file.metadata) : {}
    }));
  }
}

module.exports = new UploadService();