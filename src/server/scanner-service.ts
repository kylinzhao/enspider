import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';

import { PageVisitor } from '../crawler/page-visitor.js';
import { DOMAnalyzer } from '../classifier/dom-analyzer.js';
import { PageClusterEngine } from '../classifier/page-cluster.js';
import { SmartSampler } from '../classifier/smart-sampler.js';
import { MultiViewportScanner } from '../checker/multi-viewport-scanner.js';
import { DatabaseManager } from './database.js';
import { progressManager } from './progress-manager.js';
import { Config } from '../types.js';
import { identifyPageType } from '../utils/page-utils.js';
import { ProgressTracker } from '../utils/progress.js';
import { screenshotAnalyzer } from '../utils/screenshot-analyzer.js';
import logger from '../utils/logger.js';

export interface ScanOptions {
  customUrls?: string[];
}

export async function runScan(domain: string, db: DatabaseManager, options?: ScanOptions): Promise<void> {
  const progress = new ProgressTracker(`SCAN ${domain}`);
  const startTime = Date.now();

  // Timeout: 10 minutes
  const TIMEOUT_MS = 10 * 60 * 1000;
  let timeoutTimer: NodeJS.Timeout | null = null;
  let isScanComplete = false;

  try {
    progress.info('='.repeat(60));
    progress.info(`Starting accessibility scan for ${domain}`);
    progress.info(`Timeout: ${TIMEOUT_MS / 60000} minutes`);
    progress.info('='.repeat(60));

    // Set timeout timer
    timeoutTimer = setTimeout(() => {
      if (!isScanComplete) {
        progress.error(`Scan timeout after ${TIMEOUT_MS / 60000} minutes`);
        progressManager.updateStep(testId, 0, 0, `⏱️ Timeout: Scan exceeded ${TIMEOUT_MS / 60000} minutes`);
        progressManager.completeScan(testId, false);

        db.updateTest(testId, {
          status: 'failed',
          duration_ms: Date.now() - startTime,
        });

        // Close resources gracefully - don't kill the server process
        browser.close().catch(err => logger.error('Error closing browser:', err));
        pageVisitor.close().catch(err => logger.error('Error closing page visitor:', err));

        // Just log the timeout, don't exit the process
        progress.error(`Scan ${domain} terminated due to timeout. Server continues running.`);

        // Don't call process.exit() - let the function return naturally
      }
    }, TIMEOUT_MS);

    const configPath = path.join(process.cwd(), 'config', 'default.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: Config = JSON.parse(configContent);

    const testId = db.createTest(domain);
    progress.info(`Created test record ID: ${testId}`);

    // Initialize progress manager
    progressManager.createScan(testId, domain);

    const browser = await chromium.launch({ headless: true });
    const pageVisitor = new PageVisitor(config);
    await pageVisitor.initialize();

    const domAnalyzer = new DOMAnalyzer();
    const cluster = new PageClusterEngine(config.similarityThreshold);
    const sampler = new SmartSampler();
    const scanner = new MultiViewportScanner(browser, config);

    const fingerprints: any[] = [];

    try {
      // Step 1: Visit homepage
      progress.step(1, 5, '📡 Fetching homepage and extracting links...');
      progressManager.updateStep(testId, 1, 5, '📡 Fetching homepage and extracting links...');
      const { page: homepage, links } = await pageVisitor.visitHomepage(domain);
      progress.step(1, 5, `✓ Found ${links.length} unique links from homepage`);
      progressManager.updateStep(testId, 1, 5, `✓ Found ${links.length} unique links from homepage`);

      // Count page types
      const detailCount = links.filter(l => l.url.includes('/products/')).length;
      const listCount = links.filter(l => l.url.includes('/used-cars/') || l.url.includes('/cars/')).length;
      progress.info(`  → Detail pages: ${detailCount}, List pages: ${listCount}, Other: ${links.length - detailCount - listCount}`);

      const homepageFp = await domAnalyzer.analyze(homepage, `https://${domain}/`);
      fingerprints.push(homepageFp);
      await homepage.close();

      // Step 2: Analyze DOM structure
      // SAMPLE LINKS: Limit to max 10 pages to avoid overwhelming the server
      // Must include at least 2 list pages and 2 detail pages
      // Custom URLs are NOT subject to this limit
      const totalSteps = 5;
      const MAX_SAMPLE_PAGES = 10;
      const MIN_LIST_PAGES = 2;
      const MIN_DETAIL_PAGES = 2;

      progress.step(2, totalSteps, `🔍 Analyzing DOM structure for sampled pages...`);
      progressManager.updateStep(testId, 2, totalSteps, `🔍 Analyzing DOM structure for sampled pages...`);

      // Categorize links
      const listPages = links.filter(l =>
        l.url.includes('/used-cars/') || l.url.includes('/cars/')
      );
      const detailPages = links.filter(l =>
        l.url.includes('/products/')
      );
      const otherPages = links.filter(l =>
        !l.url.includes('/used-cars/') &&
        !l.url.includes('/cars/') &&
        !l.url.includes('/products/')
      );

      progress.info(`  Found ${listPages.length} list pages, ${detailPages.length} detail pages, ${otherPages.length} other pages`);

      // Sample pages strategically (only for auto-crawled pages)
      const sampledLinks = [];

      // Add minimum required pages
      const listPagesToAdd = Math.min(MIN_LIST_PAGES, listPages.length);
      for (let i = 0; i < listPagesToAdd; i++) {
        sampledLinks.push(listPages[i]);
      }

      const detailPagesToAdd = Math.min(MIN_DETAIL_PAGES, detailPages.length);
      for (let i = 0; i < detailPagesToAdd; i++) {
        sampledLinks.push(detailPages[i]);
      }

      // Fill remaining slots with other pages
      let remainingSlots = MAX_SAMPLE_PAGES - sampledLinks.length;
      for (let i = 0; i < Math.min(remainingSlots, otherPages.length); i++) {
        sampledLinks.push(otherPages[i]);
      }

      progress.info(`  → Sampling ${sampledLinks.length} auto-crawled pages for analysis (${listPagesToAdd} list, ${detailPagesToAdd} detail, ${sampledLinks.length - listPagesToAdd - detailPagesToAdd} other)`);

      // Add custom URLs if provided (not subject to the 10-page limit)
      const customUrls = options?.customUrls || [];
      if (customUrls.length > 0) {
        progress.info(`  → Adding ${customUrls.length} custom URLs (not subject to sampling limit)`);
        progressManager.addLog(testId, `Adding ${customUrls.length} custom URLs`);
        customUrls.forEach(url => {
          sampledLinks.push({ url, source: 'custom' });
        });
      }

      const visitPromises = sampledLinks.map(async (link, idx) => {
        try {
          progressManager.addLog(testId, `Analyzing: ${link.url} (${idx + 1}/${sampledLinks.length})`);
          const page = await pageVisitor.visitPage(link.url);
          const fp = await domAnalyzer.analyze(page, link.url);
          await page.close();

          return fp;
        } catch (error) {
          logger.warn(`Failed to analyze ${link.url}`);
          return null;
        }
      });

      const results = await Promise.all(visitPromises);
      for (const fp of results) {
        if (fp) fingerprints.push(fp);
      }

      progress.info(`  ✓ Analyzed ${fingerprints.length} pages successfully`);
      progressManager.addLog(testId, `✓ Analyzed ${fingerprints.length} pages successfully`);

      // Step 3: Cluster pages
      progress.step(3, 5, `📊 Clustering ${fingerprints.length} pages by similarity...`);
      progressManager.updateStep(testId, 3, 5, `📊 Clustering ${fingerprints.length} pages by similarity...`);
      const clusters = cluster.cluster(fingerprints);

      progress.info(`  → Created ${clusters.length} page categories:`);
      clusters.forEach(c => {
        progress.info(`    • "${c.category}": ${c.members.length} pages`);
      });

      // Step 4: Sample pages
      progress.step(4, 5, `🎲 Sampling pages (max ${config.maxPagesPerCategory} per category)...`);
      progressManager.updateStep(testId, 4, 5, `🎲 Sampling pages (max ${config.maxPagesPerCategory} per category)...`);
      const sampledClusters = sampler.sampleFromClusters(
        clusters,
        config.maxPagesPerCategory,
        config.pageTypePatterns
      );
      const sampledPages = sampler.getSampledPages(sampledClusters);

      // Count page types in sample
      const sampledDetails = sampledPages.filter(p => identifyPageType(p.url, config.pageTypePatterns) === 'detail').length;
      const sampledLists = sampledPages.filter(p => identifyPageType(p.url, config.pageTypePatterns) === 'list').length;

      progress.info(`  → Selected ${sampledPages.length} pages for testing:`);
      progress.info(`    • Detail pages: ${sampledDetails} ✓`);
      progress.info(`    • List pages: ${sampledLists} ✓`);
      progress.info(`    • Other: ${sampledPages.length - sampledDetails - sampledLists}`);

      // Step 5: Scan pages with 4 viewports
      progress.step(5, totalSteps, `🖼️  Testing ${sampledPages.length} pages × 4 viewports (PC/Mobile × Normal/Spider)...`);
      progressManager.updateStep(testId, 5, totalSteps, `🖼️  Testing ${sampledPages.length} pages × 4 viewports (PC/Mobile × Normal/Spider)...`);
      progress.info(`  Total screenshots: ${sampledPages.length * 4}`);

      let scanIndex = 0;
      const totalPages = sampledPages.length;
      let totalIssues = 0;
      const viewportTypes = ['PC-Normal', 'Mobile-Normal', 'PC-Spider', 'Mobile-Spider'];

      for (const pageFp of sampledPages) {
        try {
          const pageType = identifyPageType(pageFp.url, config.pageTypePatterns);
          const pageCluster = clusters.find(c => c.members.includes(pageFp));
          const category = pageCluster?.category || 'other';

          const pagePercent = Math.round(((scanIndex + 1) / totalPages) * 100);
          console.log(`\n[${pagePercent}%] Testing page ${scanIndex + 1}/${totalPages}: ${pageFp.url}`);
          console.log(`  Type: ${pageType.toUpperCase()}, Category: ${category}`);

          // Update progress manager with current page
          progressManager.updatePageScan(testId, pageFp.url, pagePercent, totalPages, scanIndex);
          progressManager.addLog(testId, `Testing: ${pageFp.url} (${scanIndex + 1}/${totalPages})`);
          progressManager.addLog(testId, `  Type: ${pageType.toUpperCase()}, Category: ${category}`);

          const result = await scanner.scanPage(pageFp.url, domain, category, pageType, testId);

          // Update screenshot status
          const screenshotStatus = {
            pcNormal: !!result.screenshots.pc_normal,
            mobileNormal: !!result.screenshots.mobile_normal,
            pcSpider: !!result.screenshots.pc_spider,
            mobileSpider: !!result.screenshots.mobile_spider,
          };
          progressManager.updatePageDetails(testId, pageType, category, screenshotStatus);

          const viewportStatus = (Object.keys(result.screenshots) as Array<keyof typeof result.screenshots>).map(k => {
            return result.screenshots[k] ? `✓` : `✗`;
          }).join(' ');

          console.log(`  Viewports: [${viewportStatus}]`);
          console.log(`  Issues found: ${result.issues.length}`);
          progressManager.addLog(testId, `  Screenshots: [${viewportStatus}]`);
          progressManager.addLog(testId, `  Issues: ${result.issues.length}`);

          // Create page record first (without screenshot issues)
          const pageId = db.createPage({
            test_id: testId,
            url: result.url,
            domain: result.domain,
            page_type: result.pageType,
            category: result.category,
            status: result.status === 'timeout' ? 'error' : result.status,
            issues_count: result.issues.length,
            screenshots: result.screenshots,
            screenshot_issues: undefined,  // Will be updated asynchronously
            load_time: result.loadTime,
            http_status: result.httpStatus,
            request_ids: result.requestIds && Object.keys(result.requestIds).length > 0 ? result.requestIds : undefined,
          });

          // Analyze screenshot quality asynchronously (don't block the scan)
          screenshotAnalyzer.analyzePageScreenshots(result.screenshots)
            .then(screenshotIssues => {
              // Count screenshot quality issues and filter nulls
              const filteredIssues: Record<string, {
                type: string;
                severity: string;
                message: string;
                whitePercentage: number;
              }> = {};

              for (const [viewport, issue] of Object.entries(screenshotIssues)) {
                if (issue) {
                  // Only log significant issues
                  if (issue.severity !== 'info') {
                    console.log(`    [Async] ${result.url} ${viewport}: ${issue.message}`);
                  }
                  filteredIssues[viewport] = {
                    type: issue.type,
                    severity: issue.severity,
                    message: issue.message,
                    whitePercentage: issue.whitePercentage,
                  };
                }
              }

              // Update database with screenshot issues
              if (Object.keys(filteredIssues).length > 0) {
                const stmt = db.getDb().prepare(
                  'UPDATE pages SET screenshot_issues = ? WHERE id = ?'
                );
                stmt.run(JSON.stringify(filteredIssues), pageId);
              }
            })
            .catch(error => {
              logger.error(`Failed to analyze screenshots for ${result.url}`, error);
            });

          for (const issue of result.issues) {
            db.createIssue({
              page_id: pageId,
              type: issue.type,
              severity: issue.severity,
              message: issue.message,
              viewport: issue.viewport,
            });
          }

          totalIssues += result.issues.length;
          scanIndex++;

        } catch (error) {
          progress.error(`Failed to scan ${pageFp.url}`, error);
        }
      }

      // Complete
      isScanComplete = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);

      const duration = Date.now() - startTime;
      db.updateTest(testId, {
        status: 'completed',
        total_pages: totalPages,
        total_issues: totalIssues,
        categories: clusters.length,
        duration_ms: duration,
      });

      // Notify progress manager
      progressManager.completeScan(testId, true);

      await pageVisitor.close();
      await browser.close();

      progress.complete(`Scan completed successfully!`);
      progress.info('='.repeat(60));
      progress.info(`Summary:`);
      progress.info(`  • Pages tested: ${totalPages}`);
      progress.info(`  • Screenshots captured: ${totalPages * 4} (4 viewports per page)`);
      progress.info(`  • Issues found: ${totalIssues}`);
      progress.info(`  • Categories: ${clusters.length}`);
      progress.info(`  • Duration: ${Math.round(duration / 1000)}s`);
      progress.info('='.repeat(60));

    } catch (error) {
      isScanComplete = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);

      progress.error('Scan failed!', error);

      db.updateTest(testId, {
        status: 'failed',
        duration_ms: Date.now() - startTime,
      });

      // Notify progress manager
      progressManager.completeScan(testId, false);

      await pageVisitor.close();
      await browser.close();

      throw error;
    }
  } catch (error) {
    progress.error('Fatal error during scan', error);
    throw error;
  }
}
