#!/usr/bin/env node

/**
 * @file dashboard.mjs
 * @description CLI Dashboard for Home Assistant Backend Management
 * @author Michael Lee
 * @created 2025-06-17
 * @modified 2025-06-17
 * 
 * This file provides a command-line interface for monitoring and managing
 * the Home Assistant backend application. It includes real-time monitoring,
 * log viewing, and basic management operations.
 * 
 * Dependencies:
 * - chalk: For colored terminal output
 * - inquirer: For interactive prompts
 * - ora: For loading spinners
 * - boxen: For bordered boxes
 * - axios: For API requests
 * - pm2: For process management
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  apiBaseUrl: process.env.API_BASE_URL || 'http://127.0.0.1:10000',
  appName: 'home-assistant-backend',
  logPath: './logs'
};

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

// PM2 Status Check
async function getPM2Status() {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const processes = JSON.parse(stdout);
    return processes.find(p => p.name === CONFIG.appName);
  } catch (error) {
    return null;
  }
}

// Server Stats Check (using existing /api/cli-stats endpoint)
async function getServerStats() {
  try {
    const response = await axios.get(`${CONFIG.apiBaseUrl}/api/cli-stats`, { timeout: 5000 });
    return { status: 'online', data: response.data };
  } catch (error) {
    return { status: 'offline', error: error.message };
  }
}

// API Health Check
async function checkAPIHealth() {
  try {
    const response = await axios.get(`${CONFIG.apiBaseUrl}/health`, { timeout: 5000 });
    return { status: 'healthy', response: response.data };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

// Database Status Check
async function checkDatabaseStatus() {
  try {
    const response = await axios.get(`${CONFIG.apiBaseUrl}/health/db`, { timeout: 5000 });
    return { status: 'connected', data: response.data };
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
    margin: 1,
    borderStyle: 'round',
    borderColor: 'blue'
  });
  console.log(box);
}

function displayStatus(status) {
  const statusColor = status === 'online' ? 'green' : 'red';
  const statusIcon = status === 'online' ? '🟢' : '🔴';

  console.log(boxen(
    `${statusIcon} Status: ${chalk[statusColor](status.toUpperCase())}`,
    { padding: 1, borderColor: statusColor }
  ));
}

function displayServerStats(stats) {
  if (!stats || stats.status === 'offline') {
    console.log(chalk.red('❌ Server stats unavailable'));
    return;
  }

  const data = stats.data;
  const info = [
    `📊 Total Requests: ${chalk.cyan(data.totalRequests)}`,
    `🔗 Active Connections: ${chalk.yellow(data.activeConnections)}`,
    `⏱️  Server Uptime: ${chalk.green(formatUptime(data.uptime))}`,
    `📈 Requests/sec: ${chalk.magenta((data.totalRequests / Math.max(data.uptime, 1)).toFixed(2))}`
  ];

  console.log(boxen(
    info.join('\n'),
    { padding: 1, borderColor: 'cyan', title: 'Server Statistics' }
  ));
}

function displayAPIStats(stats) {
  if (!stats || stats.status === 'offline') {
    return;
  }

  const data = stats.data;
  const topEndpoints = Object.entries(data.perPath)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  if (topEndpoints.length === 0) {
    return;
  }

  const endpointStats = topEndpoints.map(([path, count]) =>
    `${chalk.gray(path)}: ${chalk.yellow(count)}`
  ).join('\n');

  console.log(boxen(
    endpointStats,
    { padding: 1, borderColor: 'yellow', title: 'Top API Endpoints' }
  ));
}

function displayProcessInfo(process) {
  if (!process) {
    console.log(chalk.red('❌ Process not found'));
    return;
  }

  const info = [
    `📊 Memory: ${formatBytes(process.monit.memory)}`,
    `💻 CPU: ${process.monit.cpu}%`,
    `🔄 Restarts: ${process.pm2_env.restart_time}`,
    `📁 Path: ${process.pm2_env.pm_cwd}`
  ];

  console.log(boxen(
    info.join('\n'),
    { padding: 1, borderColor: 'magenta', title: 'PM2 Process Info' }
  ));
}

function displayHealthChecks(apiHealth, dbHealth) {
  const checks = [
    `🌐 API: ${apiHealth.status === 'healthy' ? chalk.green('✓') : chalk.red('✗')} ${apiHealth.status}`,
    `🗄️  Database: ${dbHealth.status === 'connected' ? chalk.green('✓') : chalk.red('✗')} ${dbHealth.status}`
  ];

  console.log(boxen(
    checks.join('\n'),
    { padding: 1, borderColor: 'yellow', title: 'Health Checks' }
  ));
}

// Menu Functions
async function showMainMenu() {
  const choices = [
    { name: '📊 View Status', value: 'status' },
    { name: '📈 Real-time Monitor', value: 'realtime' },
    { name: '📋 View Logs', value: 'logs' },
    { name: '🔄 Restart Application', value: 'restart' },
    { name: '⏹️  Stop Application', value: 'stop' },
    { name: '▶️  Start Application', value: 'start' },
    { name: '🗑️  Clear Logs', value: 'clear-logs' },
    { name: '🔧 Configuration', value: 'config' },
    { name: '❌ Exit', value: 'exit' }
  ];

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Select an action:',
      choices
    }
  ]);

  return action;
}

async function viewStatus() {
  const spinner = ora('Checking application status...').start();

  try {
    const [process, serverStats, apiHealth, dbHealth] = await Promise.all([
      getPM2Status(),
      getServerStats(),
      checkAPIHealth(),
      checkDatabaseStatus()
    ]);

    spinner.stop();
    console.clear();
    displayHeader();

    const status = serverStats.status;
    displayStatus(status);

    displayServerStats(serverStats);
    displayAPIStats(serverStats);

    if (process) {
      displayProcessInfo(process);
    }

    displayHealthChecks(apiHealth, dbHealth);

  } catch (error) {
    spinner.fail('Failed to check status');
    console.error(chalk.red(error.message));
  }
}

async function realtimeMonitor() {
  console.log(chalk.yellow('Starting real-time monitor...'));
  console.log(chalk.gray('Press Ctrl+C to stop\n'));

  const monitor = setInterval(async () => {
    try {
      const [process, serverStats, apiHealth, dbHealth] = await Promise.all([
        getPM2Status(),
        getServerStats(),
        checkAPIHealth(),
        checkDatabaseStatus()
      ]);

      console.clear();
      displayHeader();

      const status = serverStats.status;
      displayStatus(status);

      displayServerStats(serverStats);
      displayAPIStats(serverStats);

      if (process) {
        displayProcessInfo(process);
      }

      displayHealthChecks(apiHealth, dbHealth);

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

async function viewLogs() {
  const { logType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'logType',
      message: 'Select log type:',
      choices: [
        { name: '📄 Combined Logs', value: 'combined' },
        { name: '✅ Output Logs', value: 'out' },
        { name: '❌ Error Logs', value: 'error' },
        { name: '📊 PM2 Logs', value: 'pm2' }
      ]
    }
  ]);

  const spinner = ora('Loading logs...').start();

  try {
    let logContent = '';

    if (logType === 'pm2') {
      const { stdout } = await execAsync(`pm2 logs ${CONFIG.appName} --lines 50 --nostream`);
      logContent = stdout;
    } else {
      // Try to find PM2 numbered log files first
      let logFile = path.join(CONFIG.logPath, `${logType}.log`);
      
      try {
        // Check if the direct log file exists
        await fs.access(logFile);
        logContent = await fs.readFile(logFile, 'utf8');
      } catch {
        // If not found, try to find numbered log files (PM2 format)
        try {
          const logDir = await fs.readdir(CONFIG.logPath);
          const numberedLogs = logDir
            .filter(file => file.startsWith(`${logType}-`) && file.endsWith('.log'))
            .sort((a, b) => {
              const numA = parseInt(a.match(/\d+/)?.[0] || '0');
              const numB = parseInt(b.match(/\d+/)?.[0] || '0');
              return numB - numA; // Newest first
            });
          
          if (numberedLogs.length > 0) {
            // Read the most recent numbered log file
            const latestLog = path.join(CONFIG.logPath, numberedLogs[0]);
            logContent = await fs.readFile(latestLog, 'utf8');
          } else {
            throw new Error(`No ${logType} log files found`);
          }
        } catch {
          throw new Error(`No ${logType} log files found`);
        }
      }
      
      logContent = logContent.split('\n').slice(-50).join('\n'); // Last 50 lines
    }

    spinner.stop();
    console.clear();
    displayHeader();

    console.log(boxen(
      chalk.gray(logContent),
      { padding: 1, borderColor: 'green', title: `${logType.toUpperCase()} Logs` }
    ));

  } catch (error) {
    spinner.fail('Failed to load logs');
    console.error(chalk.red(error.message));
  }
}

async function restartApplication() {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to restart the application?',
      default: false
    }
  ]);

  if (!confirm) return;

  const spinner = ora('Restarting application...').start();

  try {
    await execAsync(`pm2 restart ${CONFIG.appName}`);
    spinner.succeed('Application restarted successfully');
  } catch (error) {
    spinner.fail('Failed to restart application');
    console.error(chalk.red(error.message));
  }
}

async function stopApplication() {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to stop the application?',
      default: false
    }
  ]);

  if (!confirm) return;

  const spinner = ora('Stopping application...').start();

  try {
    await execAsync(`pm2 stop ${CONFIG.appName}`);
    spinner.succeed('Application stopped successfully');
  } catch (error) {
    spinner.fail('Failed to stop application');
    console.error(chalk.red(error.message));
  }
}

async function startApplication() {
  const spinner = ora('Starting application...').start();

  try {
    await execAsync(`pm2 start ecosystem.config.js`);
    spinner.succeed('Application started successfully');
  } catch (error) {
    spinner.fail('Failed to start application');
    console.error(chalk.red(error.message));
  }
}

async function clearLogs() {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to clear all logs?',
      default: false
    }
  ]);

  if (!confirm) return;

  const spinner = ora('Clearing logs...').start();

  try {
    await execAsync(`pm2 flush ${CONFIG.appName}`);
    spinner.succeed('Logs cleared successfully');
  } catch (error) {
    spinner.fail('Failed to clear logs');
    console.error(chalk.red(error.message));
  }
}

async function showConfiguration() {
  const config = [
    `🌐 API Base URL: ${CONFIG.apiBaseUrl}`,
    `📱 App Name: ${CONFIG.appName}`,
    `📁 Log Path: ${CONFIG.logPath}`,
    `🔧 Environment: ${process.env.NODE_ENV || 'development'}`
  ];

  console.log(boxen(
    config.join('\n'),
    { padding: 1, borderColor: 'magenta', title: 'Configuration' }
  ));
}

// Main function
async function main() {
  console.clear();
  displayHeader();

  while (true) {
    try {
      const action = await showMainMenu();

      switch (action) {
        case 'status':
          await viewStatus();
          break;
        case 'realtime':
          await realtimeMonitor();
          break;
        case 'logs':
          await viewLogs();
          break;
        case 'restart':
          await restartApplication();
          break;
        case 'stop':
          await stopApplication();
          break;
        case 'start':
          await startApplication();
          break;
        case 'clear-logs':
          await clearLogs();
          break;
        case 'config':
          await showConfiguration();
          break;
        case 'exit':
          console.log(chalk.blue('👋 Goodbye!'));
          process.exit(0);
      }

      if (action !== 'realtime') {
        console.log(chalk.gray('\nPress Enter to continue...'));
        await new Promise(resolve => process.stdin.once('data', resolve));
        console.clear();
        displayHeader();
      }

    } catch (error) {
      console.error(chalk.red('An error occurred:', error.message));
      await sleep(2000);
    }
  }
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

// Start the dashboard
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}