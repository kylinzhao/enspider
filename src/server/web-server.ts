import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseManager } from './database.js';
import { runScan } from './scanner-service.js';
import { progressManager } from './progress-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createWebServer(db: DatabaseManager, port: number = 3000): express.Application {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../reporter/public')));
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
      const { domain } = req.body;

      if (!domain) {
        res.status(400).json({ error: 'Domain is required' });
        return;
      }

      // Start scan asynchronously
      runScan(domain, db).catch(error => {
        console.error('Scan failed:', error);
      });

      res.json({ message: 'Scan started', domain });
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
