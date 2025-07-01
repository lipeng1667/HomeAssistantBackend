CREATE DATABASE IF NOT EXISTS HomeAssistant;

-- Enable strict SQL mode for extra safety
SET sql_mode = 'STRICT_ALL_TABLES';

-- SET FOREIGN_KEY_CHECKS = 0;

-- DROP TABLE IF EXISTS users;
-- DROP TABLE IF EXISTS forum_questions;
-- DROP TABLE IF EXISTS forum_replies;
-- DROP TABLE IF EXISTS conversations;
-- DROP TABLE IF EXISTS messages;
-- DROP TABLE IF EXISTS admins;
-- DROP TABLE IF EXISTS user_logs;

-- SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100),
    phone_number VARCHAR(20),
    status TINYINT UNSIGNED DEFAULT 0 COMMENT '0 = normal, 1 = deleted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    -- Performance indexes
    INDEX idx_device_status (device_id, status),
    INDEX idx_uuid_status (uuid, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS forum_questions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TINYINT UNSIGNED DEFAULT 0 COMMENT '0 = normal, 1 = deleted, 2 = closed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    -- Performance indexes
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_status_created (status, created_at),
    INDEX idx_user_status (user_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS forum_replies (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED DEFAULT NULL,
    admin_id INT UNSIGNED DEFAULT NULL,
    responder_role ENUM('user', 'admin') NOT NULL,
    content TEXT NOT NULL,
    status TINYINT UNSIGNED DEFAULT 0 COMMENT '0 = normal, 1 = deleted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (question_id) REFERENCES forum_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
    -- Performance indexes
    INDEX idx_question_id (question_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_question_status (question_id, status),
    INDEX idx_user_question (user_id, question_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT NULL,
    last_message_at TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY unique_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    -- Performance indexes
    INDEX idx_user_id (user_id),
    INDEX idx_last_message_at (last_message_at),
    INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED DEFAULT NULL,
    admin_id INT UNSIGNED DEFAULT NULL,
    sender_role ENUM('user', 'admin') NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    -- Performance indexes
    INDEX idx_conversation_id (conversation_id),
    INDEX idx_conversation_timestamp (conversation_id, timestamp),
    INDEX idx_conversation_role_timestamp (conversation_id, sender_role, timestamp)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admins (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    status TINYINT UNSIGNED DEFAULT 0 COMMENT '0 = active, 1 = disabled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    -- Performance indexes
    INDEX idx_username_status (username, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    action_type TINYINT UNSIGNED NOT NULL COMMENT '0 = login, 1 = view forum, 2 = open chat, 3 = logout',
    action VARCHAR(100) NOT NULL COMMENT 'e.g., login, view_forum, open_chat, logout',
    metadata TEXT COMMENT 'optional JSON data for context (e.g., device, tab name)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    -- Performance indexes
    INDEX idx_user_id (user_id),
    INDEX idx_action_type (action_type),
    INDEX idx_user_created_at (user_id, created_at),
    INDEX idx_user_action_created (user_id, action_type, created_at),
    INDEX idx_action_created (action_type, created_at)
) ENGINE=InnoDB;
