import { Page } from 'playwright';
import { URLNormalizer } from './url-normalizer.js';
import { PageUrl } from '../types.js';
import logger from '../utils/logger.js';

export class LinkExtractor {
  private normalizer: URLNormalizer;

  constructor(domain: string, excludedPatterns: string[]) {
    this.normalizer = new URLNormalizer(domain, excludedPatterns);
  }

  async extractLinks(page: Page, baseUrl: string): Promise<PageUrl[]> {
    try {
      const links = await page.evaluate(() => {
        const anchors = document.querySelectorAll('a[href]');
        return Array.from(anchors).map(a => ({
          href: (a as HTMLAnchorElement).href,
          text: a.textContent?.trim() || '',
        }));
      });

      const normalized: PageUrl[] = [];
      for (const link of links) {
        const normalizedUrl = this.normalizer.normalize(link.href, baseUrl);
        if (normalizedUrl) {
          normalized.push(normalizedUrl);
        }
      }

      const deduplicated = this.normalizer.deduplicate(normalized);
      logger.info(`Extracted ${deduplicated.length} unique links from ${baseUrl}`);

      return deduplicated;
    } catch (error) {
      logger.error(`Failed to extract links from ${baseUrl}:`, error);
      return [];
    }
  }
}
