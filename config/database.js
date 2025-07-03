/**
 * @file database.js
 * @description Database configuration and connection management
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-06-17
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
 * - DB_PASSWORD: Database password (default: '')
 * - DB_NAME: Database name (default: home_assistant)
 */

const mysql = require('mysql2/promise')
const config = require('./index')

/**
 * @description Creates and configures the MySQL connection pool
 * @type {Pool}
 */
const pool = mysql.createPool({
  host: config.database.host,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  waitForConnections: true,
  connectionLimit: config.database.connectionLimit,
  queueLimit: config.database.queueLimit,
  idleTimeout: config.database.idleTimeout,
  typeCast: true
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