/**
 * @file database.js
 * @description Database configuration and connection management
 * @author [Your Name]
 * @created 2024-03-19
 * @modified 2024-03-19
 * 
 * This file handles MySQL database connection configuration and pool management.
 * It provides a connection pool for efficient database operations and includes
 * connection testing functionality.
 * 
 * Dependencies:
 * - mysql2: MySQL client for Node.js
 * 
 * Environment Variables:
 * - DB_HOST: Database host (default: localhost)
 * - DB_USER: Database user (default: root)
 * - DB_PASSWORD: Database password
 * - DB_NAME: Database name (default: home_assistant)
 */

const mysql = require('mysql2/promise');

/**
 * @description Creates and configures the MySQL connection pool
 * @type {Pool}
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'home_assistant',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * @description Tests the database connection
 * @async
 * @function testConnection
 */
pool.getConnection()
  .then(connection => {
    console.log('Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('Error connecting to the database:', err);
  });

module.exports = pool; 