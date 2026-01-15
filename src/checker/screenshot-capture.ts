import { Page, Browser } from 'playwright';
import path from 'path';
import { promises as fs } from 'fs';
import { ViewportConfig, ScreenshotInfo } from '../types.js';
import logger from '../utils/logger.js';
import sharp from 'sharp';

export class ScreenshotCapture {
  private browser: Browser;
  private screenshotsDir: string;

  constructor(browser: Browser, screenshotsDir: string) {
    this.browser = browser;
    this.screenshotsDir = screenshotsDir;
  }

  /**
   * Generate a safe filename from URL
   */
  private sanitizeFilename(url: string): string {
    // Remove protocol and domain, keep path
    try {
      const urlObj = new URL(url);
      let path = urlObj.pathname + urlObj.search;

      // Replace special characters
      path = path.replace(/[^a-zA-Z0-9-_]/g, '_');

      // Limit length
      if (path.length > 100) {
        path = path.substring(0, 100);
      }

      return path || 'homepage';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Capture screenshot for a specific viewport
   */
  async capture(
    page: Page,
    url: string,
    domain: string,
    viewport: ViewportConfig,
    type: string,
    testId?: number  // Add testId parameter
  ): Promise<ScreenshotInfo> {
    const filename = this.sanitizeFilename(url);
    const dir = path.join(this.screenshotsDir, type, domain);

    await this.ensureDir(dir);

    // Include test_id in filename to avoid overwriting
    const testIdPrefix = testId !== undefined ? `${testId}_` : '';
    const filepath = path.join(dir, `${testIdPrefix}${filename}.png`);

    try {
      // Set viewport
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      const isHomepage = url === '/' || url === domain || url.endsWith(`//${domain}/`);
      const baseTimeout = isHomepage ? 20000 : 15000;

      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            logger.info(`Retry screenshot capture for ${url} (attempt ${attempt}/${maxRetries})`);
            // Add a delay before retry (2 seconds)
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          await page.screenshot({
            path: filepath,
            fullPage: false,
            timeout: baseTimeout,
            animations: 'disabled',
            caret: 'initial',
          });
          
          // If successful, break the loop
          lastError = null;
          break;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          lastError = err;
          logger.warn(`Screenshot attempt ${attempt + 1} failed for ${url}: ${err.message}`);

          if (attempt === maxRetries - 1) {
            throw err;
          }
        }
      }

      logger.info(`Screenshot captured: ${filepath}`);

      if (type === 'pc_normal' || type === 'pc_spider') {
        try {
          const image = sharp(filepath);
          const metadata = await image.metadata();
          if (metadata.width && metadata.height) {
            const targetWidth = Math.min(1100, metadata.width);
            if (targetWidth > 0 && targetWidth < metadata.width) {
              const left = Math.floor((metadata.width - targetWidth) / 2);
              const buffer = await image
                .extract({ left, top: 0, width: targetWidth, height: metadata.height })
                .png()
                .toBuffer();
              await fs.writeFile(filepath, buffer);
              logger.info(`PC screenshot cropped to center width ${targetWidth}px: ${filepath}`);
            }
          }
        } catch (cropError) {
          logger.warn(`Failed to crop PC screenshot: ${filepath}`);
        }
      }

      return {
        domain,
        pagePath: url,
        viewport: type,
        path: filepath,
      };
    } catch (error) {
      logger.error(`Failed to capture screenshot for ${url}:`, error);
      throw error;
    }
  }
}
