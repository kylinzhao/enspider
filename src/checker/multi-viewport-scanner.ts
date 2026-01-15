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

        await page.waitForTimeout(this.config.delay);

        // Add 3 seconds delay for async data loading (e.g. car lists)
        await page.waitForTimeout(3000);

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

        // Short fixed wait to let content settle
        await page.waitForTimeout(800);

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
