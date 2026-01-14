import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { LinkExtractor } from './link-extractor.js';
import { PageUrl, Config } from '../types.js';
import logger from '../utils/logger.js';

export class PageVisitor {
  private config: Config;
  private browser?: Browser;
  private context?: BrowserContext;
  private linkExtractor: LinkExtractor;

  constructor(config: Config) {
    this.config = config;
    this.linkExtractor = new LinkExtractor(
      config.domains[0],
      config.excludedPatterns
    );
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; enspider/1.0; +https://guazi.com)',
    });
  }

  async visitHomepage(domain: string): Promise<{ page: Page; links: PageUrl[] }> {
    if (!this.context) {
      await this.initialize();
    }

    const page = await this.context!.newPage();
    const url = `https://${domain}/`;

    try {
      logger.info(`Visiting homepage: ${url}`);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      // Wait a bit for dynamic content
      await page.waitForTimeout(this.config.delay);

      const linkExtractor = new LinkExtractor(domain, this.config.excludedPatterns);
      const links = await linkExtractor.extractLinks(page, url);

      return { page, links };
    } catch (error) {
      logger.error(`Failed to visit homepage ${url}:`, error);
      await page.close();
      throw error;
    }
  }

  async visitPage(url: string): Promise<Page> {
    if (!this.context) {
      await this.initialize();
    }

    const page = await this.context!.newPage();

    try {
      logger.info(`Visiting page: ${url}`);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      // Wait for dynamic content
      await page.waitForTimeout(this.config.delay);

      return page;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  getBrowser(): Browser {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }
    return this.browser;
  }
}
