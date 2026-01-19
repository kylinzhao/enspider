import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseManager } from './database.js';
import { runScan } from './scanner-service.js';
import { progressManager } from './progress-manager.js';
import { createScheduler } from './scheduler-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createWebServer(db: DatabaseManager, port: number = 3000): express.Application {
  const app = express();

  // Initialize scheduler
  const scheduler = createScheduler(db);
  scheduler.initialize();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request logging middleware
  app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
  });

  // Test route
  app.get('/api/test', (req, res) => {
    console.log('[API] GET /api/test called');
    res.json({ message: 'Test route works!' });
  });

  app.use('/output', express.static(path.join(process.cwd(), 'output')));

  // API Routes

  /**
   * GET /api/tests - Get all tests
   */
  app.get('/api/tests', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const tests = db.getLatestTests(limit);
      res.json(tests);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tests' });
    }
  });

  /**
   * GET /api/tests/:id - Get test by ID
   */
  app.get('/api/tests/:id', (req, res) => {
    try {
      const testId = parseInt(req.params.id);
      const test = db.getTest(testId);

      if (!test) {
        res.status(404).json({ error: 'Test not found' });
        return;
      }

      res.json(test);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch test' });
    }
  });

  /**
   * GET /api/tests/:id/pages - Get pages for a test
   */
  app.get('/api/tests/:id/pages', (req, res) => {
    try {
      const testId = parseInt(req.params.id);
      const pages = db.getPagesByTest(testId);
      res.json(pages);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch pages' });
    }
  });

  /**
   * GET /api/pages/:id/issues - Get issues for a page
   */
  app.get('/api/pages/:id/issues', (req, res) => {
    try {
      const pageId = parseInt(req.params.id);
      const issues = db.getIssuesByPage(pageId);
      res.json(issues);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch issues' });
    }
  });

  /**
   * POST /api/scan/start - Start a new scan
   */
  app.post('/api/scan/start', async (req, res) => {
    try {
      const { domain, custom_urls, domains } = req.body;

      if (!domain) {
        res.status(400).json({ error: 'Domain is required' });
        return;
      }

      // Start scan asynchronously with optional multi-domain support
      runScan(domain, db, {
        customUrls: custom_urls,
        domains: domains,  // Pass domain codes array (e.g., ['en', 'ru', 'ar', 'fr'])
        source: 'manual'
      }).catch(error => {
        console.error('Scan failed:', error);
      });

      res.json({
        message: 'Scan started',
        domain,
        domains: domains || [domain],
        multiDomain: !!(domains && domains.length > 1)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to start scan' });
    }
  });

  /**
   * GET /api/scan/status/:id - Get scan status
   */
  app.get('/api/scan/status/:id', (req, res) => {
    try {
      const testId = parseInt(req.params.id);
      const test = db.getTest(testId);

      if (!test) {
        res.status(404).json({ error: 'Test not found' });
        return;
      }

      res.json({ status: test.status, progress: test });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch scan status' });
    }
  });

  /**
   * DELETE /api/tests/:id - Delete a specific test
   */
  app.delete('/api/tests/:id', async (req, res) => {
    try {
      const testId = parseInt(req.params.id);
      const test = db.getTest(testId);

      if (!test) {
        res.status(404).json({ error: 'Test not found' });
        return;
      }

      // Don't allow deletion of running tests
      if (test.status === 'running') {
        res.status(400).json({ error: 'Cannot delete running test' });
        return;
      }

      await db.deleteTest(testId);
      res.json({ message: 'Test deleted successfully', testId });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete test' });
    }
  });

  /**
   * DELETE /api/tests - Delete all tests
   */
  app.delete('/api/tests', async (req, res) => {
    try {
      await db.deleteAllTests();
      res.json({ message: 'All tests deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete all tests' });
    }
  });

  /**
   * GET /api/scheduled-tasks - Get all scheduled tasks
   */
  app.get('/api/scheduled-tasks', (req, res) => {
    console.log('[API] GET /api/scheduled-tasks called');
    try {
      const tasks = db.getScheduledTasks();
      console.log('[API] Returning tasks:', tasks.length);
      res.json(tasks);
    } catch (error) {
      console.error('[API] Error fetching scheduled tasks:', error);
      res.status(500).json({ error: 'Failed to fetch scheduled tasks' });
    }
  });

  /**
   * GET /api/scheduled-tasks/:id - Get a scheduled task by ID
   */
  app.get('/api/scheduled-tasks/:id', (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = db.getScheduledTask(taskId);

      if (!task) {
        res.status(404).json({ error: 'Scheduled task not found' });
        return;
      }

      res.json(task);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch scheduled task' });
    }
  });

  /**
   * POST /api/scheduled-tasks - Create a new scheduled task
   */
  app.post('/api/scheduled-tasks', (req, res) => {
    try {
      const { name, domain, cron_expression } = req.body;

      if (!name || !domain || !cron_expression) {
        res.status(400).json({ error: 'Name, domain, and cron_expression are required' });
        return;
      }

      const taskId = db.createScheduledTask(name, domain, cron_expression);
      const task = db.getScheduledTask(taskId);

      // Schedule the task
      if (task) {
        scheduler.addTask(task);
      }

      res.status(201).json(task);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create scheduled task' });
    }
  });

  /**
   * PUT /api/scheduled-tasks/:id - Update a scheduled task
   */
  app.put('/api/scheduled-tasks/:id', (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const { name, domain, cron_expression, enabled } = req.body;

      const existingTask = db.getScheduledTask(taskId);
      if (!existingTask) {
        res.status(404).json({ error: 'Scheduled task not found' });
        return;
      }

      // Update task in database
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (domain !== undefined) updateData.domain = domain;
      if (cron_expression !== undefined) updateData.cron_expression = cron_expression;
      if (enabled !== undefined) updateData.enabled = enabled ? 1 : 0;

      db.updateScheduledTask(taskId, updateData);
      const updatedTask = db.getScheduledTask(taskId);

      // Update scheduler
      if (updatedTask) {
        scheduler.updateTask(updatedTask);
      }

      res.json(updatedTask);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update scheduled task' });
    }
  });

  /**
   * DELETE /api/scheduled-tasks/:id - Delete a scheduled task
   */
  app.delete('/api/scheduled-tasks/:id', (req, res) => {
    try {
      const taskId = parseInt(req.params.id);

      const task = db.getScheduledTask(taskId);
      if (!task) {
        res.status(404).json({ error: 'Scheduled task not found' });
        return;
      }

      // Unschedule the task
      scheduler.deleteTask(taskId);

      // Delete from database
      db.deleteScheduledTask(taskId);

      res.json({ message: 'Scheduled task deleted successfully', taskId });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete scheduled task' });
    }
  });

  /**
   * POST /api/scheduled-tasks/:id/run - Manually trigger a scheduled task
   */
  app.post('/api/scheduled-tasks/:id/run', async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = db.getScheduledTask(taskId);

      if (!task) {
        res.status(404).json({ error: 'Scheduled task not found' });
        return;
      }

      // Start scan asynchronously
      runScan(task.domain, db, { source: 'manual' }).catch(error => {
        console.error('Scheduled scan failed:', error);
      });

      res.json({ message: 'Scan started', domain: task.domain });
    } catch (error) {
      res.status(500).json({ error: 'Failed to trigger scheduled task' });
    }
  });

  /**
   * GET /api/scan/progress/:id - SSE endpoint for real-time progress
   */
  app.get('/api/scan/progress/:id', (req, res) => {
    const testId = parseInt(req.params.id);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial progress immediately
    const progress = progressManager.getProgress(testId);
    if (progress) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
      console.log(`[SSE] Client connected to test ${testId}, initial progress sent`);
    } else {
      // No progress data found - scan may have completed or not started
      console.log(`[SSE] Client connected to test ${testId}, but no progress data found`);
      // Send a message indicating no data
      res.write(`data: ${JSON.stringify({
        testId,
        status: 'not_found',
        message: 'No progress data available. The scan may have completed.'
      })}\n\n`);
    }

    // Listen for progress updates
    const onProgress = (progressData: any) => {
      if (progressData.testId === testId) {
        res.write(`data: ${JSON.stringify(progressData)}\n\n`);
      }
    };

    progressManager.on('progress', onProgress);

    // Cleanup on client disconnect
    req.on('close', () => {
      progressManager.off('progress', onProgress);
      console.log(`[SSE] Client disconnected from test ${testId}`);
    });
  });

  /**
   * GET /api/notifications/stream - SSE endpoint for real-time notifications
   */
  app.get('/api/notifications/stream', (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    console.log('[SSE] Client connected to notifications stream');

    // Send recent notifications on connect
    const recentNotifications = progressManager.getNotifications(10);
    if (recentNotifications.length > 0) {
      res.write(`data: ${JSON.stringify({
        type: 'recent',
        notifications: recentNotifications
      })}\n\n`);
    }

    // Listen for new notifications
    const onNotification = (notification: any) => {
      res.write(`data: ${JSON.stringify({
        type: 'new',
        notification
      })}\n\n`);
      console.log(`[Notification] Sent to client: ${notification.title}`);
    };

    progressManager.on('notification', onNotification);

    // Cleanup on client disconnect
    req.on('close', () => {
      progressManager.off('notification', onNotification);
      console.log('[SSE] Client disconnected from notifications stream');
    });
  });

  /**
   * GET /api/notifications - Get recent notifications
   */
  app.get('/api/notifications', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const notifications = progressManager.getNotifications(limit);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  /**
   * DELETE /api/notifications - Clear all notifications
   */
  app.delete('/api/notifications', (req, res) => {
    try {
      progressManager.clearNotifications();
      res.json({ message: 'Notifications cleared successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to clear notifications' });
    }
  });

  /**
   * GET /api/config/custom-urls - Get custom URLs from global config
   */
  app.get('/api/config/custom-urls', (req, res) => {
    try {
      const customUrls = db.getCustomUrls();
      res.json(customUrls);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch custom URLs' });
    }
  });

  /**
   * PUT /api/config/custom-urls - Update custom URLs in global config
   */
  app.put('/api/config/custom-urls', (req, res) => {
    try {
      const { custom_urls } = req.body;

      if (!Array.isArray(custom_urls)) {
        res.status(400).json({ error: 'custom_urls must be an array' });
        return;
      }

      db.setCustomUrls(custom_urls);
      res.json({ message: 'Custom URLs updated successfully', custom_urls });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update custom URLs' });
    }
  });

  /**
   * GET /api/config/multi-domains - Get multi-domain configuration
   */
  app.get('/api/config/multi-domains', (req, res) => {
    try {
      const config = db.getMultiDomainsConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch multi-domain config' });
    }
  });

  /**
   * PUT /api/config/multi-domains - Update multi-domain configuration
   */
  app.put('/api/config/multi-domains', (req, res) => {
    try {
      const { enabled, domains } = req.body;

      if (enabled !== undefined && typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }

      if (domains !== undefined) {
        if (!Array.isArray(domains)) {
          res.status(400).json({ error: 'domains must be an array' });
          return;
        }
        // Validate domain codes
        const validDomainCodes = ['en', 'ru', 'ar', 'fr', 'es'];
        const invalidDomains = domains.filter(d => !validDomainCodes.includes(d));
        if (invalidDomains.length > 0) {
          res.status(400).json({ error: `Invalid domain codes: ${invalidDomains.join(', ')}` });
          return;
        }
      }

      const currentConfig = db.getMultiDomainsConfig();
      const newConfig = {
        enabled: enabled !== undefined ? enabled : currentConfig.enabled,
        domains: domains !== undefined ? domains : currentConfig.domains,
      };

      db.setMultiDomainsConfig(newConfig);
      res.json({ message: 'Multi-domain config updated successfully', config: newConfig });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update multi-domain config' });
    }
  });

  /**
   * GET /api/config/cleanup-policy - Get cleanup policy
   */
  app.get('/api/config/cleanup-policy', (req, res) => {
    try {
      const policy = db.getCleanupPolicy();
      res.json(policy);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch cleanup policy' });
    }
  });

  /**
   * PUT /api/config/cleanup-policy - Update cleanup policy
   */
  app.put('/api/config/cleanup-policy', (req, res) => {
    try {
      const policy = req.body;

      // Validate policy
      if (policy.retainDays !== undefined && (typeof policy.retainDays !== 'number' || policy.retainDays < 1)) {
        res.status(400).json({ error: 'retainDays must be a positive number' });
        return;
      }
      if (policy.maxTests !== undefined && (typeof policy.maxTests !== 'number' || policy.maxTests < 1)) {
        res.status(400).json({ error: 'maxTests must be a positive number' });
        return;
      }

      db.setCleanupPolicy(policy);
      res.json({ message: 'Cleanup policy updated successfully', policy });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update cleanup policy' });
    }
  });

  /**
   * POST /api/cleanup/run - Manually trigger cleanup
   */
  app.post('/api/cleanup/run', async (req, res) => {
    try {
      const result = await db.cleanupOldTests();
      res.json({
        message: 'Cleanup completed successfully',
        deleted: result.deleted,
        archived: result.archived,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to run cleanup' });
    }
  });

  /**
   * GET /api/stats - Get database statistics
   */
  app.get('/api/stats', (req, res) => {
    try {
      const stats = db.getStats();

      // Format dbSize to human readable
      const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      };

      res.json({
        ...stats,
        dbSizeFormatted: formatSize(stats.dbSize),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  });

  // Serve frontend static files
  app.use(express.static(path.join(__dirname, '../reporter/public')));

  // Serve frontend for all other routes
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../reporter/public/index.html'));
  });

  return app;
}

export function startServer(db: DatabaseManager, port: number = 3000): void {
  const app = createWebServer(db, port);

  app.listen(port, () => {
    console.log(`Enspider web server running on http://localhost:${port}`);
  });
}
