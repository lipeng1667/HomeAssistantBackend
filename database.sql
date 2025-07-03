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
    INDEX idx_device (device_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS forum_questions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TINYINT UNSIGNED DEFAULT 0 COMMENT '0 = normal, 1 = deleted, 2 = closed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL
    -- Performance indexes
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS forum_replies (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED DEFAULT NULL,
    content TEXT NOT NULL,
    image TEXT DEFAULT NULL,
    status TINYINT UNSIGNED DEFAULT 0 COMMENT '0 = normal, 1 = deleted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    -- Performance indexes
    INDEX idx_question_id (question_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    action_type TINYINT UNSIGNED NOT NULL COMMENT '0 = login, 1 = view forum, 2 = open chat, 3 = logout',
    action VARCHAR(100) NOT NULL COMMENT 'e.g., login, view_forum, open_chat, logout',
    metadata TEXT COMMENT 'optional JSON data for context (e.g., device, tab name)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    -- Performance indexes
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB;
