import { Page } from 'playwright';
import { Issue, ViewportType } from '../types.js';
import logger from '../utils/logger.js';

export class ErrorDetector {
  async detectErrors(page: Page, url: string, httpStatus?: number): Promise<Omit<Issue, 'viewport'>[]> {
    const issues: Omit<Issue, 'viewport'>[] = [];
    const jsErrors: string[] = [];

    // Check HTTP status code
    if (httpStatus && httpStatus !== 200 && httpStatus !== 304) {
      issues.push({
        type: 'http_error',
        severity: 'error',
        message: `HTTP status code ${httpStatus} (expected 200 or 304)`,
      });
    }

    page.on('console', msg => {
      if (msg.type() === 'error') {
        jsErrors.push(msg.text());
      }
    });

    try {
      await page.waitForTimeout(2000);

      const pageData = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        const broken: string[] = [];

        images.forEach(img => {
          const i = img as HTMLImageElement;
          if (i.complete && i.naturalWidth === 0 && i.naturalHeight === 0) {
            broken.push(i.src);
          }
        });

        // Check for error text patterns in the page
        const bodyText = document.body?.innerText || '';
        const errorPatterns = [
          'No source found',
          'page faults',
          'Page faults',
        ];

        const foundErrors: string[] = [];
        for (const pattern of errorPatterns) {
          if (bodyText.includes(pattern)) {
            foundErrors.push(pattern);
          }
        }

        // Get request ID if available (for error pages)
        const requestId = (window as any).__REQUEST_ID__ || null;

        return {
          brokenImages: broken,
          errorTexts: foundErrors,
          requestId,
        };
      });

      for (const src of pageData.brokenImages) {
        issues.push({
          type: 'broken_image',
          severity: 'warning',
          message: `Broken image: ${src}`,
        });
      }

      // Report error text patterns found
      for (const errorText of pageData.errorTexts) {
        issues.push({
          type: 'error_text',
          severity: 'error',
          message: `Error text detected on page: "${errorText}"`,
        });
      }

      // Return request ID for storage (if any issues were found)
      if (pageData.requestId && (pageData.errorTexts.length > 0 || issues.length > 0)) {
        issues.push({
          type: 'request_id',
          severity: 'info',
          message: `Request ID: ${pageData.requestId}`,
        });
      }

    } catch (error) {
      logger.warn('Failed to check for broken images');
    }

    const ignoredJsErrorPatterns = [
      '[GSI_LOGGER]',
      'FedCM get() rejects with TypeError',
      'IdentityCredentialRequestOptionsMode',
    ];

    for (const err of jsErrors) {
      if (ignoredJsErrorPatterns.some(pattern => err.includes(pattern))) {
        continue;
      }
      issues.push({
        type: 'js_error',
        severity: 'warning',
        message: `JavaScript error: ${err}`,
      });
    }

    return issues;
  }
}
