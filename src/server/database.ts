import Database from 'better-sqlite3';
import path from 'path';
import { promises as fs } from 'fs';

export interface TestRecord {
  id: number;
  domain: string;
  timestamp: number;
  status: 'running' | 'completed' | 'failed';
  total_pages: number;
  total_issues: number;
  categories: number;
  duration_ms: number;
}

export interface PageRecord {
  id: number;
  test_id: number;
  url: string;
  domain: string;
  page_type: string;
  category: string;
  status: 'success' | 'error';
  issues_count: number;
  screenshots: {
    pc_normal?: string;
    mobile_normal?: string;
    pc_spider?: string;
    mobile_spider?: string;
  };
  screenshot_issues?: Record<string, {
    type: string;
    severity: string;
    message: string;
    whitePercentage: number;
  }>;
  load_time?: number;
  http_status?: number;
  request_ids?: {
    pc_normal?: string;
    mobile_normal?: string;
    pc_spider?: string;
    mobile_spider?: string;
  };
}

export interface IssueRecord {
  id: number;
  page_id: number;
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  viewport: string;
}

export interface ScheduledTaskRecord {
  id: number;
  name: string;
  domain: string;
  cron_expression: string;
  enabled: number;
  last_run: number | null;
  next_run: number | null;
  custom_urls: string | null;
  created_at: number;
  updated_at: number;
}

export class DatabaseManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(dataDir: string) {
    this.dbPath = path.join(dataDir, 'enspider.db');
    this.db = new Database(this.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    // Tests table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        status TEXT NOT NULL,
        total_pages INTEGER DEFAULT 0,
        total_issues INTEGER DEFAULT 0,
        categories INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0
      )
    `);

    // Pages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        domain TEXT NOT NULL,
        page_type TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        issues_count INTEGER DEFAULT 0,
        screenshots TEXT,
        FOREIGN KEY (test_id) REFERENCES tests(id)
      )
    `);

    // Check if screenshot_issues column exists, if not add it
    try {
      const columns = this.db.pragma('table_info(pages)') as any[];
      const hasScreenshotIssues = columns.some((col) => col.name === 'screenshot_issues');

      if (!hasScreenshotIssues) {
        this.db.exec('ALTER TABLE pages ADD COLUMN screenshot_issues TEXT');
      }
    } catch (error) {
      // Column might already exist or table doesn't exist yet
    }

    // Add load_time column if not exists
    try {
      const columns = this.db.pragma('table_info(pages)') as any[];
      const hasLoadTime = columns.some((col) => col.name === 'load_time');

      if (!hasLoadTime) {
        this.db.exec('ALTER TABLE pages ADD COLUMN load_time INTEGER');
      }
    } catch (error) {
      // Column might already exist
    }

    // Add http_status column if not exists
    try {
      const columns = this.db.pragma('table_info(pages)') as any[];
      const hasHttpStatus = columns.some((col) => col.name === 'http_status');

      if (!hasHttpStatus) {
        this.db.exec('ALTER TABLE pages ADD COLUMN http_status INTEGER');
      }
    } catch (error) {
      // Column might already exist
    }

    // Add request_ids column if not exists
    try {
      const columns = this.db.pragma('table_info(pages)') as any[];
      const hasRequestIds = columns.some((col) => col.name === 'request_ids');

      if (!hasRequestIds) {
        this.db.exec('ALTER TABLE pages ADD COLUMN request_ids TEXT');
      }
    } catch (error) {
      // Column might already exist
    }

    // Issues table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        viewport TEXT NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id)
      )
    `);

    // Scheduled tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        domain TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        last_run INTEGER,
        next_run INTEGER,
        custom_urls TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Add custom_urls column if not exists
    try {
      const columns = this.db.pragma('table_info(scheduled_tasks)') as any[];
      const hasCustomUrls = columns.some((col) => col.name === 'custom_urls');

      if (!hasCustomUrls) {
        this.db.exec('ALTER TABLE scheduled_tasks ADD COLUMN custom_urls TEXT');
      }
    } catch (error) {
      // Column might already exist or table doesn't exist yet
    }

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tests_timestamp ON tests(timestamp);
      CREATE INDEX IF NOT EXISTS idx_pages_test_id ON pages(test_id);
      CREATE INDEX IF NOT EXISTS idx_issues_page_id ON issues(page_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);
    `);
  }

  // Test operations
  createTest(domain: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO tests (domain, timestamp, status)
      VALUES (?, ?, 'running')
    `);
    const result = stmt.run(domain, Date.now());
    return result.lastInsertRowid as number;
  }

  updateTest(testId: number, data: Partial<TestRecord>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.total_pages !== undefined) {
      fields.push('total_pages = ?');
      values.push(data.total_pages);
    }
    if (data.total_issues !== undefined) {
      fields.push('total_issues = ?');
      values.push(data.total_issues);
    }
    if (data.categories !== undefined) {
      fields.push('categories = ?');
      values.push(data.categories);
    }
    if (data.duration_ms !== undefined) {
      fields.push('duration_ms = ?');
      values.push(data.duration_ms);
    }

    if (fields.length > 0) {
      values.push(testId);
      const stmt = this.db.prepare(`
        UPDATE tests SET ${fields.join(', ')} WHERE id = ?
      `);
      stmt.run(...values);
    }
  }

  getTest(testId: number): TestRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM tests WHERE id = ?');
    return stmt.get(testId) as TestRecord | undefined;
  }

  getLatestTests(limit: number = 20): TestRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tests ORDER BY timestamp DESC LIMIT ?
    `);
    return stmt.all(limit) as TestRecord[];
  }

  // Page operations
  createPage(page: Omit<PageRecord, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO pages (test_id, url, domain, page_type, category, status, issues_count, screenshots, screenshot_issues, load_time, http_status, request_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      page.test_id,
      page.url,
      page.domain,
      page.page_type,
      page.category,
      page.status,
      page.issues_count,
      JSON.stringify(page.screenshots),
      page.screenshot_issues ? JSON.stringify(page.screenshot_issues) : null,
      page.load_time || null,
      page.http_status || null,
      page.request_ids ? JSON.stringify(page.request_ids) : null
    );
    return result.lastInsertRowid as number;
  }

  getPagesByTest(testId: number): PageRecord[] {
    const stmt = this.db.prepare('SELECT * FROM pages WHERE test_id = ?');
    const rows = stmt.all(testId) as any[];
    return rows.map(row => ({
      ...row,
      screenshots: JSON.parse(row.screenshots || '{}'),
      screenshot_issues: row.screenshot_issues ? JSON.parse(row.screenshot_issues) : undefined,
      request_ids: row.request_ids ? JSON.parse(row.request_ids) : undefined
    }));
  }

  // Issue operations
  createIssue(issue: Omit<IssueRecord, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO issues (page_id, type, severity, message, viewport)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      issue.page_id,
      issue.type,
      issue.severity,
      issue.message,
      issue.viewport
    );
    return result.lastInsertRowid as number;
  }

  getIssuesByPage(pageId: number): IssueRecord[] {
    const stmt = this.db.prepare('SELECT * FROM issues WHERE page_id = ?');
    return stmt.all(pageId) as IssueRecord[];
  }

  getDb(): Database.Database {
    return this.db;
  }

  /**
   * Delete a test and all its pages, issues, and screenshots
   */
  async deleteTest(testId: number): Promise<void> {
    // Get all pages for this test to collect screenshot paths
    const pages = this.getPagesByTest(testId);

    // Delete issues (cascade will handle this, but let's be explicit)
    const stmtDeleteIssues = this.db.prepare('DELETE FROM issues WHERE page_id IN (SELECT id FROM pages WHERE test_id = ?)');
    stmtDeleteIssues.run(testId);

    // Delete pages
    const stmtDeletePages = this.db.prepare('DELETE FROM pages WHERE test_id = ?');
    stmtDeletePages.run(testId);

    // Delete test
    const stmtDeleteTest = this.db.prepare('DELETE FROM tests WHERE id = ?');
    stmtDeleteTest.run(testId);

    // Delete screenshot files
    const fs = await import('fs/promises');
    for (const page of pages) {
      if (page.screenshots) {
        for (const screenshotPath of Object.values(page.screenshots)) {
          try {
            await fs.unlink(screenshotPath);
          } catch (error) {
            // File might not exist, ignore
          }
        }
      }
    }
  }

  /**
   * Delete all tests and their data
   */
  async deleteAllTests(): Promise<void> {
    // Get all tests
    const allTests = this.getLatestTests(1000);

    // Delete each test
    for (const test of allTests) {
      await this.deleteTest(test.id);
    }
  }

  close(): void {
    this.db.close();
  }

  // Scheduled Task operations
  createScheduledTask(name: string, domain: string, cronExpression: string, customUrls?: string[]): number {
    const now = Date.now();
    const customUrlsJson = customUrls && customUrls.length > 0 ? JSON.stringify(customUrls) : null;
    const stmt = this.db.prepare(`
      INSERT INTO scheduled_tasks (name, domain, cron_expression, enabled, custom_urls, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?)
    `);
    const result = stmt.run(name, domain, cronExpression, customUrlsJson, now, now);
    return result.lastInsertRowid as number;
  }

  getScheduledTasks(): ScheduledTaskRecord[] {
    const stmt = this.db.prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC');
    return stmt.all() as ScheduledTaskRecord[];
  }

  getScheduledTask(id: number): ScheduledTaskRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?');
    return stmt.get(id) as ScheduledTaskRecord | undefined;
  }

  updateScheduledTask(id: number, data: Partial<ScheduledTaskRecord & { custom_urls_array?: string[] }>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.domain !== undefined) {
      fields.push('domain = ?');
      values.push(data.domain);
    }
    if (data.cron_expression !== undefined) {
      fields.push('cron_expression = ?');
      values.push(data.cron_expression);
    }
    if (data.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(data.enabled);
    }
    if (data.last_run !== undefined) {
      fields.push('last_run = ?');
      values.push(data.last_run);
    }
    if (data.next_run !== undefined) {
      fields.push('next_run = ?');
      values.push(data.next_run);
    }
    if (data.custom_urls !== undefined) {
      fields.push('custom_urls = ?');
      values.push(data.custom_urls);
    } else if (data.custom_urls_array !== undefined) {
      fields.push('custom_urls = ?');
      const customUrlsJson = data.custom_urls_array && data.custom_urls_array.length > 0
        ? JSON.stringify(data.custom_urls_array)
        : null;
      values.push(customUrlsJson);
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(Date.now());
      values.push(id);
      const stmt = this.db.prepare(`
        UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?
      `);
      stmt.run(...values);
    }
  }

  deleteScheduledTask(id: number): void {
    const stmt = this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?');
    stmt.run(id);
  }
}
