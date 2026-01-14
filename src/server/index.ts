#!/usr/bin/env node
import cron from 'node-cron';
import path from 'path';
import { promises as fs } from 'fs';

import { DatabaseManager } from './database.js';
import { startServer } from './web-server.js';
import { runScan } from './scanner-service.js';
import logger from '../utils/logger.js';

const DATA_DIR = path.join(process.cwd(), 'output/data');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Scheduled tasks configuration
const SCHEDULES = {
  en_guazi: '0 */6 * * *', // Every 6 hours
  ar_guazi: '0 */6 * * *', // Every 6 hours
};

async function main() {
  logger.info('Starting Enspider Web Server...');

  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  // Initialize database
  const db = new DatabaseManager(DATA_DIR);
  logger.info('Database initialized');

  // Start web server
  startServer(db, PORT);
  logger.info(`Web server listening on port ${PORT}`);

  // Setup scheduled tasks
  setupScheduledTasks(db);

  logger.info('Enspider is ready!');
  logger.info(`Dashboard: http://localhost:${PORT}`);
}

function setupScheduledTasks(db: DatabaseManager): void {
  // Schedule en.guazi.com scans
  cron.schedule(SCHEDULES.en_guazi, async () => {
    logger.info('Starting scheduled scan for en.guazi.com');
    try {
      await runScan('en.guazi.com', db);
    } catch (error) {
      logger.error('Scheduled scan failed for en.guazi.com:', error);
    }
  });

  // Schedule ar.guazi.com scans
  cron.schedule(SCHEDULES.ar_guazi, async () => {
    logger.info('Starting scheduled scan for ar.guazi.com');
    try {
      await runScan('ar.guazi.com', db);
    } catch (error) {
      logger.error('Scheduled scan failed for ar.guazi.com:', error);
    }
  });

  logger.info('Scheduled tasks configured');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

// Start server
main().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
