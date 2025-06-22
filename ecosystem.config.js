/**
 * @file ecosystem.config.js
 * @description PM2 ecosystem configuration for Home Assistant Backend
 * @author Michael Lee
 * @created 2024-03-19
 * @modified 2024-03-19
 * 
 * This file configures PM2 process manager for the Home Assistant backend application.
 * It includes settings for development and production environments with proper
 * monitoring, logging, and restart policies.
 */

module.exports = {
  apps: [
    {
      name: 'home-assistant-backend',
      script: 'server.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      // Logging configuration
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Restart policy
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,

      // Monitoring
      watch: false, // Disable file watching in production
      ignore_watch: [
        'node_modules',
        'logs',
        '.git',
        '*.log'
      ],

      // Environment variables
      env_file: '.env',

      // Process management
      kill_timeout: 5000,
      listen_timeout: 3000,

      // Health check
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true,

      // Additional settings
      source_map_support: true,
      node_args: '--max-old-space-size=1024'
    }
  ]
};