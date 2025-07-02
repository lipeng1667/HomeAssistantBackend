#!/usr/bin/env node

/**
 * @file dashboard.mjs
 * @description Real-time monitoring dashboard for Home Assistant Backend
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-07-02
 * 
 * Simplified dashboard that runs real-time monitoring directly when executed.
 * Displays Redis-based distributed metrics with automatic 2-second refresh.
 * 
 * Modification Log:
 * - 2025-06-17: Initial CLI dashboard implementation
 * - 2025-06-27: Updated to display Redis-based cluster metrics
 * - 2025-06-27: Added connection tracking and request speed monitoring
 * - 2025-07-02: Simplified to run realtimeMonitor directly, removed interactive menu
 * 
 * Functions:
 * - displayHeader(): Show dashboard title and branding
 * - displayStatus(status): Display overall application status with colored indicator
 * - displaySystemStatus(process, apiHealth, dbHealth, redisHealth): Show consolidated system status
 * - displayWebServiceTable(stats): Display Redis metrics in ASCII table format
 * - displayAPIStats(stats): Display endpoint and error statistics
 * - getPM2Status(): Retrieve PM2 process status for configured application
 * - getServerStats(): Fetch Redis-based server metrics from CLI stats endpoint
 * - checkAPIHealth(): Perform health check on main API endpoint
 * - checkDatabaseStatus(): Check database connectivity through health endpoint
 * - checkRedisStatus(): Verify Redis connectivity by checking metrics endpoint
 * - realtimeMonitor(): Start continuous real-time monitoring with 2-second refresh
 * 
 * Dependencies:
 * - chalk: For colored terminal output
 * - inquirer: For interactive prompts
 * - ora: For loading spinners
 * - boxen: For bordered boxes
 * - axios: For API requests to Redis-backed endpoints
 * - pm2: For process management
 */

import chalk from 'chalk';
import boxen from 'boxen';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  apiBaseUrl: process.env.API_BASE_URL || 'http://127.0.0.1:10000',
  appName: 'home-assistant-backend',
  logPath: './logs'
};

// Utility functions

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Retrieves PM2 process status for the configured application
 * @returns {Promise<Object|null>} PM2 process object with monitoring data, or null if not found/error
 * @sideEffects Executes 'pm2 jlist' command via child_process
 * @throws Does not throw - returns null on error
 * @example
 * const process = await getPM2Status()
 * if (process) console.log(`Memory: ${process.monit.memory}`)
 */
async function getPM2Status() {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const processes = JSON.parse(stdout);
    return processes.find(p => p.name === CONFIG.appName);
  } catch (error) {
    return null;
  }
}

/**
 * Fetches Redis-based server metrics from the CLI stats endpoint
 * @returns {Promise<Object>} Object with status ('online'|'offline') and data/error properties
 * @sideEffects Makes HTTP GET request to /api/cli-stats endpoint
 * @throws Does not throw - returns offline status with error message on failure
 * @example
 * const stats = await getServerStats()
 * if (stats.status === 'online') displayWebServiceTable(stats)
 */
async function getServerStats() {
  try {
    const response = await axios.get(`${CONFIG.apiBaseUrl}/api/cli-stats`, { timeout: 5000 });
    return { status: 'online', data: response.data };
  } catch (error) {
    return { status: 'offline', error: error.message };
  }
}

/**
 * Performs health check on the main API endpoint
 * @returns {Promise<Object>} Object with status ('healthy'|'unhealthy') and response/error data
 * @sideEffects Makes HTTP GET request to /health endpoint
 * @throws Does not throw - returns unhealthy status with error message on failure
 * @example
 * const health = await checkAPIHealth()
 * const apiIcon = health.status === 'healthy' ? '✓' : '✗'
 */
async function checkAPIHealth() {
  try {
    const response = await axios.get(`${CONFIG.apiBaseUrl}/health`, { timeout: 5000 });
    return { status: 'healthy', response: response.data };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

/**
 * Checks database connectivity through the health endpoint
 * @returns {Promise<Object>} Object with status ('connected'|'disconnected') and data/error properties
 * @sideEffects Makes HTTP GET request to /health/db endpoint
 * @throws Does not throw - returns disconnected status with error message on failure
 * @example
 * const dbHealth = await checkDatabaseStatus()
 * if (dbHealth.status === 'disconnected') console.error('DB offline')
 */
async function checkDatabaseStatus() {
  try {
    const response = await axios.get(`${CONFIG.apiBaseUrl}/health/db`, { timeout: 5000 });
    return { status: 'connected', data: response.data };
  } catch (error) {
    return { status: 'disconnected', error: error.message };
  }
}

/**
 * Verifies Redis connectivity by checking if metrics endpoint returns valid data
 * @returns {Promise<Object>} Object with status ('connected'|'disconnected') and data/error properties
 * @sideEffects Makes HTTP GET request to /api/cli-stats to verify Redis availability
 * @throws Does not throw - returns disconnected status with error message on failure
 * @example
 * const redis = await checkRedisStatus()
 * const redisIcon = redis.status === 'connected' ? '✓ Redis' : '✗ Redis'
 */
async function checkRedisStatus() {
  try {
    const response = await axios.get(`${CONFIG.apiBaseUrl}/api/cli-stats`, { timeout: 5000 });
    // Check if Redis metrics are available (no error in response)
    if (response.data && !response.data.error) {
      return { status: 'connected', data: { message: 'Redis metrics operational' } };
    } else {
      return { status: 'disconnected', error: response.data.error || 'Redis metrics not available' };
    }
  } catch (error) {
    return { status: 'disconnected', error: error.message };
  }
}

// Display Functions
function displayHeader() {
  const title = chalk.bold.blue('🏠 Home Assistant Backend Dashboard');
  const subtitle = chalk.gray('CLI Management Interface');
  const box = boxen(`${title}\n${subtitle}`, {
    padding: 1,
    borderStyle: 'round',
    borderColor: 'blue'
  });
  console.log(box);
}

function displaySystemStatus(process, apiHealth, dbHealth, redisHealth) {
  const statusLines = [];

  // Application Status
  const appStatus = process ? chalk.green('RUNNING') : chalk.red('STOPPED');
  statusLines.push(`🚀 Application: ${appStatus}`);

  // PM2 Process Info
  if (process) {
    statusLines.push(`💾 Memory: ${chalk.yellow(formatBytes(process.monit?.memory || 0))}`);
    statusLines.push(`🔄 Restarts: ${chalk.magenta(process.pm2_env?.restart_time || 0)}`);
    statusLines.push(`⏰ Started: ${chalk.cyan(new Date(process.pm2_env?.pm_uptime || Date.now())
      .toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' ', ' '))}`);
  }

  // Health Checks
  const apiStatus = apiHealth.status === 'healthy' ? chalk.green('✓ API') : chalk.red('✗ API');
  const dbStatus = dbHealth.status === 'connected' ? chalk.green('✓ Database') : chalk.red('✗ Database');
  const redisStatus = redisHealth.status === 'connected' ? chalk.green('✓ Redis') : chalk.red('✗ Redis');

  statusLines.push(`${apiStatus} | ${dbStatus} | ${redisStatus}`);

  console.log(boxen(
    statusLines.join('\n'),
    { padding: 1, borderColor: 'green', title: '🏠 System Status' }
  ));
}

function displayWebServiceTable(stats) {
  if (!stats || stats.status === 'offline') {
    console.log(chalk.red('❌ Web service stats unavailable'));
    return;
  }

  const data = stats.data;
  const connections = data.connections || {};
  const speed = data.speed || {};
  const total = data.total || {};

  // Format numbers for table display
  const connCurr = String(connections.current || 0).padStart(6);
  const connMax = String(connections.maxSinceStartup || 0).padStart(6);
  const speedCurr = String((speed.current || 0).toFixed(1)).padStart(6);
  const speedMax = String((speed.maxSinceStartup || 0).toFixed(1)).padStart(6);
  const requests = String(total.requests || 0).padStart(11);
  const accepted = String(total.accepted || 0).padStart(11);
  const errors = String(total.errors || 0).padStart(11);

  const table = [
    chalk.gray('+---------------------------------------------------------------+'),
    chalk.gray('|') + chalk.bold.cyan('                          webservice                           ') + chalk.gray('|'),
    chalk.gray('+---[ONLINE]--+---[SPEED]---+-----------+-----------+-----------+'),
    chalk.gray('|') + chalk.white('  curr|   max|  curr|   max|    request|   accepted|      error') + chalk.gray('|'),
    chalk.gray('+------+------+------+------+-----------+-----------+-----------+'),
    chalk.gray('|') + chalk.cyan(connCurr) + chalk.gray('|') + chalk.yellow(connMax) + chalk.gray('|') +
    chalk.cyan(speedCurr) + chalk.gray('|') + chalk.yellow(speedMax) + chalk.gray('|') +
    chalk.cyan(requests) + chalk.gray('|') + chalk.green(accepted) + chalk.gray('|') +
    chalk.red(errors) + chalk.gray('|'),
    chalk.gray('+------+------+------+------+-----------+-----------+-----------+')
  ];

  console.log('\n' + table.join('\n') + '\n');
}


function displayAPIStats(stats) {
  if (!stats || stats.status === 'offline') {
    return;
  }

  const data = stats.data;
  const endpoints = data.endpoints || {};
  const topEndpoints = Object.entries(endpoints)
    .sort(([, a], [, b]) => (b.requests || 0) - (a.requests || 0))
    .slice(0, 5);

  if (topEndpoints.length === 0) {
    return;
  }

  const endpointStats = topEndpoints.map(([path, stats]) =>
    `${chalk.gray(path)}: ${chalk.yellow(stats.requests || 0)} (${chalk.red(stats.errorRate || '0.00')}% errors)`
  ).join('\n');

  console.log(boxen(
    endpointStats,
    { padding: 1, borderColor: 'yellow', title: 'Top API Endpoints' }
  ));
}



/**
 * Starts continuous real-time monitoring with 2-second refresh intervals
 * @returns {Promise<void>} Never resolves - runs until SIGINT (Ctrl+C)
 * @sideEffects Sets up interval timer, installs SIGINT handler, clears console repeatedly
 * @throws Catches and logs monitor errors but continues running
 * @example
 * await realtimeMonitor() // Starts live dashboard updates
 */
async function realtimeMonitor() {
  console.log(chalk.yellow('Starting real-time monitor...'));
  console.log(chalk.gray('Press Ctrl+C to stop\n'));

  const monitor = setInterval(async () => {
    try {
      const [process, serverStats, apiHealth, dbHealth, redisHealth] = await Promise.all([
        getPM2Status(),
        getServerStats(),
        checkAPIHealth(),
        checkDatabaseStatus(),
        checkRedisStatus()
      ]);

      console.clear();
      displayHeader();

      displaySystemStatus(process, apiHealth, dbHealth, redisHealth);
      displayAPIStats(serverStats);
      displayWebServiceTable(serverStats);

      const timestamp = new Date().toLocaleTimeString();
      console.log(chalk.gray(`\nLast updated: ${timestamp}`));
      console.log(chalk.gray('Press Ctrl+C to stop monitoring'));

    } catch (error) {
      console.error(chalk.red('Monitor error:', error.message));
    }
  }, 2000);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(monitor);
    console.log(chalk.yellow('\nMonitor stopped'));
    process.exit(0);
  });
}




// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:', error.message));
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:', promise, 'reason:', reason));
  process.exit(1);
});

// Start real-time monitoring directly
if (import.meta.url === `file://${process.argv[1]}`) {
  realtimeMonitor().catch(console.error);
}