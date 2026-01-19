import { Page, Browser } from 'playwright';
import { ViewportChecker } from './viewport-checker.js';
import { ErrorDetector } from './error-detector.js';
import { ScreenshotCapture } from './screenshot-capture.js';
import { SEOChecker, SEOResult } from './seo-checker.js';
import { PageResult, ViewportMode, ViewportType, Config } from '../types.js';
import { getViewportModes } from '../utils/page-utils.js';
import logger from '../utils/logger.js';

export class MultiViewportScanner {
  private viewportChecker: ViewportChecker;
  private errorDetector: ErrorDetector;
  private screenshotCapture: ScreenshotCapture;
  private seoChecker: SEOChecker;
  private config: Config;
  private browser: Browser;

  constructor(browser: Browser, config: Config) {
    this.config = config;
    this.browser = browser;
    this.viewportChecker = new ViewportChecker();
    this.errorDetector = new ErrorDetector();
    this.seoChecker = new SEOChecker();
    this.screenshotCapture = new ScreenshotCapture(
      browser,
      config.output.screenshotsDir
    );
  }

  /**
   * Wait for page content to load based on page type
   * For listing pages, wait for actual list items to appear
   */
  private async waitForContentLoad(
    page: Page,
    pageType: 'homepage' | 'detail' | 'list' | 'other'
  ): Promise<void> {
    const LISTING_SELECTORS = [
      '.car-list',           // Common list container
      '.list-item',          // Individual list items
      '[class*="list"]',     // Any element with 'list' in class
      '[class*="item"]',     // Any element with 'item' in class
      '[class*="product"]',  // Product listings
      '[class*="card"]',     // Card-based layouts
    ];

    if (pageType === 'list') {
      logger.info('Waiting for listing page content to load...');

      try {
        // Strategy 1: Wait for network to be mostly idle
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
          logger.warn('Network idle timeout, continuing anyway');
        });

        // Strategy 2: Wait for at least one listing selector to have content
        const maxRetries = 10;
        let foundContent = false;

        for (let attempt = 0; attempt < maxRetries && !foundContent; attempt++) {
          for (const selector of LISTING_SELECTORS) {
            try {
              const element = await page.$(selector);
              if (element) {
                // Check if element has children (actual content)
                const hasChildren = await element.evaluate((el) => {
                  return el.children.length > 0;
                });

                if (hasChildren) {
                  logger.info(`Found listing content with selector: ${selector}`);
                  foundContent = true;
                  break;
                }
              }
            } catch {
              // Selector not found, try next one
            }
          }

          if (!foundContent) {
            // Wait before retry
            await page.waitForTimeout(500);
          }
        }

        if (!foundContent) {
          logger.warn('Could not detect specific listing content, using timeout fallback');
        }

        // Strategy 3: Final wait to ensure rendering is complete
        await page.waitForTimeout(2000);
      } catch (error) {
        logger.warn('Error waiting for listing content:', error);
        // Fallback to fixed timeout
        await page.waitForTimeout(5000);
      }
    } else {
      // For non-listing pages, use standard wait
      await page.waitForTimeout(this.config.delay);
      await page.waitForTimeout(2000); // Additional wait for async content
    }
  }

  async scanPage(
    url: string,
    domain: string,
    category: string,
    pageType: 'homepage' | 'detail' | 'list' | 'other',
    testId?: number  // Add testId parameter
  ): Promise<PageResult> {
    const result: PageResult = {
      url,
      domain,
      pageType,
      category,
      status: 'success',
      screenshots: {},
      issues: [],
      timestamp: Date.now(),
      loadTime: 0,
      httpStatus: 200,
      requestIds: {},
      seo: undefined,
    };

    const viewportModes = getViewportModes(this.config.viewports.pc, this.config.viewports.mobile);
    let firstViewportPage: Page | null = null;

    // Process viewports SEQUENTIALLY to avoid resource contention and improve success rate
    for (const mode of viewportModes) {
      try {
        const context = await this.browser.newContext({
          userAgent: mode.userAgent,
          viewport: {
            width: mode.config.width,
            height: mode.config.height,
          },
          deviceScaleFactor: mode.config.deviceScaleFactor,
          isMobile: mode.config.isMobile,
          hasTouch: mode.config.hasTouch,
        });

        await context.route('**/*', route => {
          const urlStr = route.request().url();
          if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(urlStr)) {
            return route.abort('failed');
          }
          return route.continue();
        });

        const page = await context.newPage();

        logger.info(`Testing ${url} with ${mode.name}`);

        // Measure page load time and HTTP status
        const pageLoadStart = Date.now();
        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.config.timeout,
        });
        const pageLoadTime = Date.now() - pageLoadStart;

        // Store load time and HTTP status from first viewport
        if (mode.name === 'pc_normal') {
          result.loadTime = pageLoadTime;
          result.httpStatus = response?.status() || 0;
        }

        // Wait for content to load based on page type
        await this.waitForContentLoad(page, pageType);

        if (this.config.checks.viewportOverflow || this.config.checks.horizontalScroll) {
          const viewportType = mode.name.includes('mobile') ? 'mobile' : 'pc';
          const issues = await this.viewportChecker.checkViewport(page, viewportType);

          issues.forEach(issue => {
            result.issues.push({ ...issue, viewport: mode.name });
          });
        }

        // Force a page reflow to trigger rendering before screenshot
        try {
          await page.evaluate(() => {
            // Force layout reflow
            document.body.offsetHeight;
            // Scroll to bottom and back to trigger lazy loading
            window.scrollTo(0, document.body.scrollHeight);
            window.scrollTo(0, 0);
          });
        } catch (error) {
          // Ignore errors
        }

        // Wait longer for listing pages to ensure lazy-loaded content renders
        const settleTime = pageType === 'list' ? 2000 : 800;
        await page.waitForTimeout(settleTime);

        try {
          const screenshot = await this.screenshotCapture.capture(
            page,
            url,
            domain,
            mode.config,
            mode.name,
            testId
          );
          result.screenshots[mode.name] = screenshot.path;
        } catch (error) {
          logger.warn(`Failed to capture screenshot for ${url} with ${mode.name}`);
          result.issues.push({
            type: 'screenshot_failed',
            severity: 'error',
            message: error instanceof Error ? error.message : 'Failed to capture screenshot',
            viewport: mode.name,
          });
        }

        if (!mode.isSpider && (this.config.checks.jsErrors || this.config.checks.brokenImages)) {
          const errorIssues = await this.errorDetector.detectErrors(page, url, response?.status());
          errorIssues.forEach(issue => {
            result.issues.push({ ...issue, viewport: mode.name });
            // Capture request_id if present
            if (issue.type === 'request_id') {
              result.requestIds![mode.name] = issue.message.replace('Request ID: ', '');
            }
          });
        }

        // Always attempt to capture request_id from window object, regardless of errors
        try {
          const requestId = await page.evaluate(() => {
            return (window as any).__REQUEST_ID__ || null;
          });
          if (requestId) {
            result.requestIds![mode.name] = requestId;
          }
        } catch (error) {
          // Ignore errors during request ID extraction
        }

        // Save first viewport page for SEO analysis
        if (mode.name === 'pc_normal') {
          firstViewportPage = page;
        } else {
          await page.close();
        }

        await context.close();
      } catch (error) {
        logger.error(`Failed to scan ${url} with ${mode.name}:`, error);
        result.issues.push({
          type: 'timeout',
          severity: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          viewport: mode.name,
        });
      }
    }

    // Perform SEO analysis on first viewport page
    if (firstViewportPage) {
      try {
        logger.info(`Performing SEO analysis for ${url}`);
        result.seo = await this.seoChecker.checkSEO(firstViewportPage);
        logger.info(`SEO score for ${url}: ${result.seo.score}/100`);
      } catch (error) {
        logger.error(`Failed to perform SEO analysis for ${url}:`, error);
      }
      await firstViewportPage.close();
    }

    if (result.issues.some(i => i.severity === 'error')) {
      result.status = 'error';
    }

    logger.info(`Scan complete for ${url}: ${result.issues.length} issues across 4 viewports`);

    return result;
  }
}
