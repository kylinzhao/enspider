import path from 'path';
import { promises as fs } from 'fs';
import { ScanReport, PageResult } from '../types.js';
import logger from '../utils/logger.js';

export class ResultStore {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /**
   * Ensure data directory exists
   */
  private async ensureDir(): Promise<void> {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
    }
  }

  /**
   * Save scan results as JSON
   */
  async saveResults(report: ScanReport): Promise<string> {
    await this.ensureDir();

    const filename = `${report.domain}_${report.timestamp}.json`;
    const filepath = path.join(this.dataDir, filename);

    try {
      await fs.writeFile(filepath, JSON.stringify(report, null, 2));
      logger.info(`Results saved to ${filepath}`);
      return filepath;
    } catch (error) {
      logger.error(`Failed to save results:`, error);
      throw error;
    }
  }

  /**
   * Load scan results from JSON file
   */
  async loadResults(filepath: string): Promise<ScanReport | null> {
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(content) as ScanReport;
    } catch (error) {
      logger.error(`Failed to load results from ${filepath}:`, error);
      return null;
    }
  }

  /**
   * Get latest results for a domain
   */
  async getLatestResults(domain: string): Promise<ScanReport | null> {
    try {
      const files = await fs.readdir(this.dataDir);
      const domainFiles = files.filter(f => f.startsWith(domain));

      if (domainFiles.length === 0) return null;

      // Sort by timestamp (filename contains timestamp)
      domainFiles.sort().reverse();
      const latest = path.join(this.dataDir, domainFiles[0]);

      return await this.loadResults(latest);
    } catch (error) {
      logger.error(`Failed to get latest results for ${domain}:`, error);
      return null;
    }
  }
}
