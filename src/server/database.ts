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
  source?: 'manual' | 'scheduled';
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
  seo?: {
    score: number;
    meta: any;
    openGraph: any;
    twitterCard: any;
    structuredData: any;
    headings: any;
    images: any;
    links: any;
  };
  original_url?: string;
  original_domain?: string;
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
  created_at: number;
  updated_at: number;
}

export interface GlobalConfigRecord {
  id: number;
  key: string;
  value: string;
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

    // Add seo column if not exists
    try {
      const columns = this.db.pragma('table_info(pages)') as any[];
      const hasSEO = columns.some((col) => col.name === 'seo');

      if (!hasSEO) {
        this.db.exec('ALTER TABLE pages ADD COLUMN seo TEXT');
      }
    } catch (error) {
      // Column might already exist
    }

    // Add original_url and original_domain columns for multi-domain support
    try {
      const columns = this.db.pragma('table_info(pages)') as any[];
      const hasOriginalUrl = columns.some((col) => col.name === 'original_url');

      if (!hasOriginalUrl) {
        this.db.exec('ALTER TABLE pages ADD COLUMN original_url TEXT');
      }
    } catch (error) {
      // Column might already exist
    }

    try {
      const columns = this.db.pragma('table_info(pages)') as any[];
      const hasOriginalDomain = columns.some((col) => col.name === 'original_domain');

      if (!hasOriginalDomain) {
        this.db.exec('ALTER TABLE pages ADD COLUMN original_domain TEXT');
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
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Global configuration table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS global_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Insert default custom URLs config if not exists
    const existingConfig = this.db.prepare('SELECT * FROM global_config WHERE key = ?').get('custom_urls');
    if (!existingConfig) {
      this.db.prepare('INSERT INTO global_config (key, value, updated_at) VALUES (?, ?, ?)')
        .run('custom_urls', '[]', Date.now());
    }

    // Insert default cleanup policy if not exists
    const existingCleanupPolicy = this.db.prepare('SELECT * FROM global_config WHERE key = ?').get('cleanup_policy');
    if (!existingCleanupPolicy) {
      const defaultPolicy = {
        enabled: true,
        retainDays: 30,
        maxTests: 100,
        autoCleanup: true,
        archiveBeforeDelete: false,
      };
      this.db.prepare('INSERT INTO global_config (key, value, updated_at) VALUES (?, ?, ?)')
        .run('cleanup_policy', JSON.stringify(defaultPolicy), Date.now());
    }

    // Add domains column to tests table for multi-domain support
    try {
      const columns = this.db.pragma('table_info(tests)') as any[];
      const hasDomains = columns.some((col) => col.name === 'domains');

      if (!hasDomains) {
        this.db.exec('ALTER TABLE tests ADD COLUMN domains TEXT');
      }
    } catch (error) {
      // Column might already exist
    }

    // Add source column to tests table
    try {
      const columns = this.db.pragma('table_info(tests)') as any[];
      const hasSource = columns.some((col) => col.name === 'source');

      if (!hasSource) {
        this.db.exec('ALTER TABLE tests ADD COLUMN source TEXT DEFAULT "manual"');
      }
    } catch (error) {
      // Column might already exist
    }

    // Insert default multi-domain config if not exists
    let existingMultiDomainConfig = this.db.prepare('SELECT * FROM global_config WHERE key = ?').get('multi_domains') as any;
    if (!existingMultiDomainConfig) {
      const defaultMultiDomain = {
        enabled: true,
        domains: ['en', 'ar', 'fr', 'ru'],  // Default first 4 domains
      };
      this.db.prepare('INSERT INTO global_config (key, value, updated_at) VALUES (?, ?, ?)')
        .run('multi_domains', JSON.stringify(defaultMultiDomain), Date.now());
    } else {
      // Migrate existing config to remove 'de' if present and reorder to match UI
      try {
        const config = JSON.parse(existingMultiDomainConfig.value);
        if (config.domains) {
          // Filter out 'de' and keep only valid domains in correct order
          const validDomains = ['en', 'ar', 'fr', 'ru', 'es'];
          const filteredDomains = config.domains.filter((d: string) => validDomains.includes(d));
          // Reorder to match preferred order: en, ar, fr, ru, es
          const reorderedDomains = validDomains.filter(d => filteredDomains.includes(d));

          if (JSON.stringify(filteredDomains) !== JSON.stringify(reorderedDomains)) {
            config.domains = reorderedDomains;
            this.db.prepare('UPDATE global_config SET value = ?, updated_at = ? WHERE key = ?')
              .run(JSON.stringify(config), Date.now(), 'multi_domains');
            console.log('[Database] Migrated multi-domain config to:', reorderedDomains);
          }
        }
      } catch (error) {
        console.error('[Database] Failed to migrate multi-domain config:', error);
      }
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
  createTest(domain: string, domains?: string[], source: 'manual' | 'scheduled' = 'manual'): number {
    const domainsJson = domains ? JSON.stringify(domains) : null;
    const stmt = this.db.prepare(`
      INSERT INTO tests (domain, domains, timestamp, status, source)
      VALUES (?, ?, ?, 'running', ?)
    `);
    const result = stmt.run(domain, domainsJson, Date.now(), source);
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
      INSERT INTO pages (test_id, url, domain, page_type, category, status, issues_count, screenshots, screenshot_issues, load_time, http_status, request_ids, seo, original_url, original_domain)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      page.request_ids ? JSON.stringify(page.request_ids) : null,
      page.seo ? JSON.stringify(page.seo) : null,
      page.original_url || null,
      page.original_domain || null
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
      request_ids: row.request_ids ? JSON.parse(row.request_ids) : undefined,
      seo: row.seo ? JSON.parse(row.seo) : undefined
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
  createScheduledTask(name: string, domain: string, cronExpression: string): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO scheduled_tasks (name, domain, cron_expression, enabled, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `);
    const result = stmt.run(name, domain, cronExpression, now, now);
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

  updateScheduledTask(id: number, data: Partial<ScheduledTaskRecord>): void {
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

  // Global Config operations
  getGlobalConfig(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM global_config WHERE key = ?');
    const result = stmt.get(key) as any;
    return result ? result.value : null;
  }

  setGlobalConfig(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO global_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);
    stmt.run(key, value, Date.now());
  }

  getCustomUrls(): string[] {
    const value = this.getGlobalConfig('custom_urls');
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  setCustomUrls(urls: string[]): void {
    this.setGlobalConfig('custom_urls', JSON.stringify(urls));
  }

  // Multi-domain operations
  getMultiDomainsConfig(): any {
    const value = this.getGlobalConfig('multi_domains');
    if (!value) {
      // Return default config
      return {
        enabled: true,
        domains: ['en', 'ar', 'fr', 'ru'],  // Default first 4 domains
      };
    }
    try {
      return JSON.parse(value);
    } catch {
      return {
        enabled: true,
        domains: ['en', 'ar', 'fr', 'ru'],  // Default first 4 domains
      };
    }
  }

  setMultiDomainsConfig(config: any): void {
    this.setGlobalConfig('multi_domains', JSON.stringify(config));
  }

  // Cleanup policy operations
  getCleanupPolicy(): any {
    const value = this.getGlobalConfig('cleanup_policy');
    if (!value) {
      // Return default policy
      return {
        enabled: true,
        retainDays: 30,
        maxTests: 100,
        autoCleanup: true,
        archiveBeforeDelete: false,
      };
    }
    try {
      return JSON.parse(value);
    } catch {
      return {
        enabled: true,
        retainDays: 30,
        maxTests: 100,
        autoCleanup: true,
        archiveBeforeDelete: false,
      };
    }
  }

  setCleanupPolicy(policy: any): void {
    this.setGlobalConfig('cleanup_policy', JSON.stringify(policy));
  }

  /**
   * Cleanup old tests based on retention policy
   * Returns the number of tests deleted
   */
  async cleanupOldTests(): Promise<{ deleted: number; archived: number }> {
    const policy = this.getCleanupPolicy();

    if (!policy.enabled || !policy.autoCleanup) {
      return { deleted: 0, archived: 0 };
    }

    let deleted = 0;
    let archived = 0;

    // Get all tests, ordered by timestamp (oldest first)
    const allTests = this.getLatestTests(10000); // Get up to 10k tests

    const now = Date.now();
    const cutoffTime = now - (policy.retainDays * 24 * 60 * 60 * 1000);

    // Filter tests that should be deleted
    const testsToDelete = allTests.filter(test => {
      // Delete if older than retention days
      if (test.timestamp < cutoffTime) {
        return true;
      }
      // Also delete if we have more than maxTests (keep only the most recent)
      const testIndex = allTests.findIndex(t => t.id === test.id);
      return testIndex >= policy.maxTests;
    });

    // Delete tests (excluding running tests)
    for (const test of testsToDelete) {
      if (test.status === 'running') {
        continue; // Skip running tests
      }

      try {
        // Archive if enabled
        if (policy.archiveBeforeDelete) {
          await this.archiveTest(test.id);
          archived++;
        }

        await this.deleteTest(test.id);
        deleted++;
      } catch (error) {
        console.error(`Failed to delete test ${test.id}:`, error);
      }
    }

    return { deleted, archived };
  }

  /**
   * Archive a test by copying data to archive directory
   */
  private async archiveTest(testId: number): Promise<void> {
    const test = this.getTest(testId);
    if (!test) return;

    const fs = await import('fs/promises');
    const path = await import('path');

    const archiveDir = path.join(process.cwd(), 'output', 'archive', `test_${testId}_${Date.now()}`);
    await fs.mkdir(archiveDir, { recursive: true });

    // Export test data as JSON
    const pages = this.getPagesByTest(testId);
    const archiveData = {
      test,
      pages,
      exportedAt: Date.now(),
    };

    const archiveFile = path.join(archiveDir, 'data.json');
    await fs.writeFile(archiveFile, JSON.stringify(archiveData, null, 2));

    // Copy screenshots to archive
    for (const page of pages) {
      if (page.screenshots) {
        for (const [viewport, screenshotPath] of Object.entries(page.screenshots)) {
          try {
            const sourcePath = path.join(process.cwd(), screenshotPath);
            const destPath = path.join(archiveDir, path.basename(screenshotPath));
            await fs.copyFile(sourcePath, destPath);
          } catch (error) {
            // Screenshot might not exist, ignore
          }
        }
      }
    }
  }

  /**
   * Get statistics about the database
   */
  getStats(): {
    totalTests: number;
    totalPages: number;
    totalIssues: number;
    oldestTest: number | null;
    newestTest: number | null;
    dbSize: number;
  } {
    const totalTests = this.db.prepare('SELECT COUNT(*) as count FROM tests').get() as { count: number };
    const totalPages = this.db.prepare('SELECT COUNT(*) as count FROM pages').get() as { count: number };
    const totalIssues = this.db.prepare('SELECT COUNT(*) as count FROM issues').get() as { count: number };
    const oldestTest = this.db.prepare('SELECT MIN(timestamp) as min FROM tests').get() as { min: number | null };
    const newestTest = this.db.prepare('SELECT MAX(timestamp) as max FROM tests').get() as { max: number | null };

    // Get database file size
    const fs = require('fs');
    const stats = fs.statSync(this.dbPath);
    const dbSize = stats.size;

    return {
      totalTests: totalTests.count,
      totalPages: totalPages.count,
      totalIssues: totalIssues.count,
      oldestTest: oldestTest.min,
      newestTest: newestTest.max,
      dbSize,
    };
  }
}
