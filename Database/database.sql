CREATE DATABASE IF NOT EXISTS HomeAssistant;

-- Enable strict SQL mode for extra safety
SET sql_mode = 'STRICT_ALL_TABLES';

-- SET FOREIGN_KEY_CHECKS = 0;

-- DROP TABLE IF EXISTS users;
-- DROP TABLE IF EXISTS user_logs;

-- SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100),
    phone_number VARCHAR(16),
    password VARCHAR(64) COMMENT 'SHA-256(orignial pass)',
    status TINYINT DEFAULT 0 COMMENT '-1 = deleted, 0 = normal, 87 = admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    -- Performance indexes
    INDEX idx_device (device_id)
) ENGINE=InnoDB;


CREATE TABLE IF NOT EXISTS user_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    action_type TINYINT UNSIGNED NOT NULL COMMENT '0 = login, 1 = view forum, 2 = open chat, 3 = logout',
    action VARCHAR(100) NOT NULL COMMENT 'e.g., login, view_forum, open_chat, logout',
    metadata TEXT COMMENT 'optional JSON data for context (e.g., device, tab name)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Performance indexes
    INDEX idx_user_id (user_id),
    -- Foreign keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===================================================================
-- FORUM SYSTEM TABLES
-- ===================================================================

-- Forum categories table
CREATE TABLE IF NOT EXISTS forum_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50),
    sort_order INT UNSIGNED DEFAULT 0,
    status TINYINT UNSIGNED DEFAULT 0 COMMENT '0 = active, 1 = inactive',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Performance indexes
    INDEX idx_status (status),
    INDEX idx_sort (sort_order)
) ENGINE=InnoDB;

-- Forum topics table
CREATE TABLE IF NOT EXISTS forum_topics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    reply_count INT UNSIGNED DEFAULT 0,
    like_count INT UNSIGNED DEFAULT 0,
    view_count INT UNSIGNED DEFAULT 0,
    status TINYINT NOT NULL DEFAULT -1 COMMENT '-1 = awaiting review, 0 = published, 1 = deleted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Performance indexes
    INDEX idx_user_id (user_id),
    INDEX idx_category_id (category_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at),
    -- Full-text search index
    FULLTEXT idx_search (title, content),
    -- Foreign keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Forum replies table
CREATE TABLE IF NOT EXISTS forum_replies (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    topic_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    parent_reply_id INT UNSIGNED NULL COMMENT 'NULL for direct topic replies, foreign key for reply-to-reply',
    content TEXT NOT NULL,
    like_count INT UNSIGNED DEFAULT 0,
    status TINYINT NOT NULL DEFAULT -1 COMMENT '-1 = awaiting review, 0 = published, 1 = deleted, 2 = rejected',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Performance indexes
    INDEX idx_topic_id (topic_id),
    INDEX idx_user_id (user_id),
    INDEX idx_parent_reply_id (parent_reply_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    -- Full-text search index
    FULLTEXT idx_search (content),
    -- Foreign keys
    FOREIGN KEY (topic_id) REFERENCES forum_topics(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_reply_id) REFERENCES forum_replies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Forum drafts table (simplified design)
CREATE TABLE IF NOT EXISTS forum_drafts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('topic', 'reply') NOT NULL,
    topic_id INT UNSIGNED NULL COMMENT 'NULL for topic drafts, foreign key for reply drafts',
    title VARCHAR(255) NULL COMMENT 'Only for topic drafts',
    content TEXT NOT NULL,
    category_id INT UNSIGNED NULL COMMENT 'Only for topic drafts',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Performance indexes
    INDEX idx_user_id (user_id),
    INDEX idx_type (type),
    INDEX idx_topic_id (topic_id),
    -- Unique constraints to enforce draft rules
    UNIQUE KEY unique_topic_draft (user_id, type, topic_id),
    -- Foreign keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES forum_topics(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ===================================================================
-- FORUM INTERACTION TABLES
-- ===================================================================

-- Forum topic likes table
CREATE TABLE IF NOT EXISTS forum_topic_likes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    topic_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Performance indexes
    INDEX idx_topic_id (topic_id),
    INDEX idx_user_id (user_id),
    -- Unique constraint to prevent duplicate likes
    UNIQUE KEY unique_topic_like (topic_id, user_id),
    -- Foreign keys
    FOREIGN KEY (topic_id) REFERENCES forum_topics(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Forum reply likes table
CREATE TABLE IF NOT EXISTS forum_reply_likes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reply_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Performance indexes
    INDEX idx_reply_id (reply_id),
    INDEX idx_user_id (user_id),
    -- Unique constraint to prevent duplicate likes
    UNIQUE KEY unique_reply_like (reply_id, user_id),
    -- Foreign keys
    FOREIGN KEY (reply_id) REFERENCES forum_replies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===================================================================
-- FORUM FILE UPLOAD TABLES
-- ===================================================================

-- Forum uploads table
CREATE TABLE IF NOT EXISTS forum_uploads (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    upload_id VARCHAR(255) NOT NULL UNIQUE COMMENT 'External upload session ID',
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size INT UNSIGNED NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    entity_type ENUM('topic', 'reply') NOT NULL,
    entity_id INT UNSIGNED NULL COMMENT 'Topic or reply ID when associated',
    status TINYINT UNSIGNED DEFAULT 0 COMMENT '0 = uploading, 1 = completed, 2 = failed, 3 = deleted',
    metadata JSON COMMENT 'File metadata (dimensions, virus scan, etc.)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Performance indexes
    INDEX idx_user_id (user_id),
    INDEX idx_upload_id (upload_id),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_status (status),
    -- Foreign keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Forum upload chunks table (for chunked uploads)
CREATE TABLE IF NOT EXISTS forum_upload_chunks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    upload_id VARCHAR(255) NOT NULL,
    chunk_index INT UNSIGNED NOT NULL,
    chunk_size INT UNSIGNED NOT NULL,
    chunk_hash VARCHAR(64) COMMENT 'SHA-256 hash for integrity check',
    status TINYINT UNSIGNED DEFAULT 0 COMMENT '0 = pending, 1 = uploaded, 2 = failed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Performance indexes
    INDEX idx_upload_id (upload_id),
    INDEX idx_chunk_index (chunk_index),
    INDEX idx_status (status),
    -- Unique constraint to prevent duplicate chunks
    UNIQUE KEY unique_upload_chunk (upload_id, chunk_index),
    -- Foreign keys
    FOREIGN KEY (upload_id) REFERENCES forum_uploads(upload_id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- ===================================================================
-- FORUM DATABASE TRIGGERS
-- ===================================================================

-- Trigger to update reply_count when reply is inserted
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS forum_reply_count_increment
AFTER INSERT ON forum_replies
FOR EACH ROW
BEGIN
    UPDATE forum_topics 
    SET reply_count = reply_count + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.topic_id;
END$$
DELIMITER ;

-- Trigger to update reply_count when reply is deleted
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS forum_reply_count_decrement
AFTER DELETE ON forum_replies
FOR EACH ROW
BEGIN
    UPDATE forum_topics 
    SET reply_count = reply_count - 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.topic_id;
END$$
DELIMITER ;

-- Trigger to update topic like_count when topic like is inserted
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS forum_topic_like_count_increment
AFTER INSERT ON forum_topic_likes
FOR EACH ROW
BEGIN
    UPDATE forum_topics 
    SET like_count = like_count + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.topic_id;
END$$
DELIMITER ;

-- Trigger to update topic like_count when topic like is deleted
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS forum_topic_like_count_decrement
AFTER DELETE ON forum_topic_likes
FOR EACH ROW
BEGIN
    UPDATE forum_topics 
    SET like_count = like_count - 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.topic_id;
END$$
DELIMITER ;

-- Trigger to update reply like_count when reply like is inserted
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS forum_reply_like_count_increment
AFTER INSERT ON forum_reply_likes
FOR EACH ROW
BEGIN
    UPDATE forum_replies 
    SET like_count = like_count + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.reply_id;
END$$
DELIMITER ;

-- Trigger to update reply like_count when reply like is deleted
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS forum_reply_like_count_decrement
AFTER DELETE ON forum_reply_likes
FOR EACH ROW
BEGIN
    UPDATE forum_replies 
    SET like_count = like_count - 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.reply_id;
END$$
DELIMITER ;

-- ===================================================================
-- IM (INSTANT MESSAGING) TABLES
-- ===================================================================

-- Conversations table for user-admin messaging (Enhanced for Admin Features)
CREATE TABLE IF NOT EXISTS conversations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    admin_id INT UNSIGNED NULL COMMENT 'Assigned admin for this conversation',
    status ENUM('active', 'closed', 'archived', 'pending') DEFAULT 'active',
    priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
    last_message_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    assigned_at TIMESTAMP NULL COMMENT 'When conversation was assigned to admin',
    closed_at TIMESTAMP NULL COMMENT 'When conversation was closed',
    resolution_notes TEXT NULL COMMENT 'Admin notes when closing conversation',
    internal_notes TEXT NULL COMMENT 'Private admin notes',
    tags JSON NULL COMMENT 'Array of tag strings for categorization',
    -- Performance indexes
    INDEX idx_user_id (user_id),
    INDEX idx_admin_id (admin_id),
    INDEX idx_status (status),
    INDEX idx_priority (priority),
    INDEX idx_last_message (last_message_at),
    INDEX idx_created_at (created_at),
    INDEX idx_assigned_at (assigned_at),
    INDEX idx_status_priority (status, priority),
    -- Foreign keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Messages table for storing chat messages (Enhanced for Admin Features)
CREATE TABLE IF NOT EXISTS messages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NULL COMMENT 'User ID if sent by user',
    admin_id INT UNSIGNED NULL COMMENT 'Admin ID if sent by admin',
    sender_role ENUM('user', 'admin', 'system') NOT NULL,
    message_type ENUM('text', 'image', 'file', 'system', 'internal_note') DEFAULT 'text',
    content TEXT NOT NULL,
    file_id VARCHAR(255) NULL COMMENT 'Reference to uploaded file',
    file_url VARCHAR(500) NULL COMMENT 'Direct URL to file',
    metadata JSON NULL COMMENT 'Additional message metadata',
    is_read BOOLEAN DEFAULT FALSE,
    is_internal BOOLEAN DEFAULT FALSE COMMENT 'True for admin-only internal notes',
    internal_note TEXT NULL COMMENT 'Admin-only internal note for this message',
    edited_at TIMESTAMP NULL COMMENT 'When message was last edited',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Performance indexes
    INDEX idx_conversation (conversation_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_sender_user (sender_role, user_id),
    INDEX idx_sender_admin (sender_role, admin_id),
    INDEX idx_read (is_read),
    INDEX idx_internal (is_internal),
    INDEX idx_message_type (message_type),
    -- Full-text search index
    FULLTEXT idx_content (content),
    -- Foreign keys
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Conversation participants table for multi-admin support
CREATE TABLE IF NOT EXISTS conversation_participants (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT UNSIGNED NOT NULL,
    admin_id INT UNSIGNED NOT NULL,
    role ENUM('assigned', 'observer', 'supervisor') DEFAULT 'assigned',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id INT UNSIGNED NULL COMMENT 'Last message read by this admin',
    -- Performance indexes
    INDEX idx_conversation (conversation_id),
    INDEX idx_admin (admin_id),
    INDEX idx_role (role),
    -- Unique constraint to prevent duplicate admin assignments
    UNIQUE KEY unique_conversation_admin (conversation_id, admin_id),
    -- Foreign keys
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (last_read_message_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Admin activity log table for audit trail
CREATE TABLE IF NOT EXISTS admin_activity_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admin_id INT UNSIGNED NOT NULL,
    conversation_id INT UNSIGNED NULL COMMENT 'Related conversation if applicable',
    action ENUM('assign', 'close', 'reopen', 'priority_change', 'status_change', 'add_tag', 'remove_tag', 'add_note') NOT NULL,
    old_value VARCHAR(255) NULL COMMENT 'Previous value before change',
    new_value VARCHAR(255) NULL COMMENT 'New value after change',
    notes TEXT NULL COMMENT 'Additional context for the action',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Performance indexes
    INDEX idx_admin (admin_id),
    INDEX idx_conversation (conversation_id),
    INDEX idx_action (action),
    INDEX idx_timestamp (timestamp),
    INDEX idx_admin_timestamp (admin_id, timestamp),
    -- Foreign keys
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===================================================================
-- IM DATABASE TRIGGERS
-- ===================================================================

-- Trigger to update last_message_at when new message is inserted
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS conversation_update_last_message
AFTER INSERT ON messages
FOR EACH ROW
BEGIN
    UPDATE conversations 
    SET last_message_at = NEW.timestamp,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.conversation_id;
END$$
DELIMITER ;
