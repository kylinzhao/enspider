import { Page } from 'playwright';
import { Issue, ViewportType } from '../types.js';
import logger from '../utils/logger.js';

export class ViewportChecker {
  async checkViewport(page: Page, viewportType: 'pc' | 'mobile'): Promise<Omit<Issue, 'viewport'>[]> {
    const issues: Omit<Issue, 'viewport'>[] = [];

    try {
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth;
      });

      if (hasHorizontalScroll) {
        const overflowAmount = await page.evaluate(() => {
          return document.body.scrollWidth - window.innerWidth;
        });

        issues.push({
          type: 'horizontal_scroll',
          severity: 'error',
          message: `Horizontal overflow detected: ${overflowAmount}px exceeds viewport width`,
        });
      }
    } catch (error) {
      logger.error(`Failed to check viewport:`, error);
    }

    return issues;
  }
}
