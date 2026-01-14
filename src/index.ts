#!/usr/bin/env node
import { Command } from 'commander';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

import { PageVisitor } from './crawler/page-visitor.js';
import { DOMAnalyzer } from './classifier/dom-analyzer.js';
import { PageClusterEngine } from './classifier/page-cluster.js';
import { Sampler } from './classifier/sampler.js';
import { MultiViewportScanner } from './checker/multi-viewport-scanner.js';
import { ResultStore } from './storage/result-store.js';
import { Config, ScanReport } from './types.js';
import { identifyPageType } from './utils/page-utils.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('enspider')
  .description('Website accessibility monitor for guazi.com domains')
  .version('1.0.0')
  .option('-d, --domain <domain>', 'Domain to scan (e.g., en.guazi.com)')
  .option('-m, --max-pages <number>', 'Maximum pages per category', '3')
  .option('-c, --concurrency <number>', 'Concurrent page visits', '3')
  .option('-v, --verbose', 'Verbose logging');

program.parse();
const options = program.opts();

async function loadConfig(): Promise<Config> {
  const configPath = path.join(process.cwd(), 'config', 'default.json');
  const content = await fs.readFile(configPath, 'utf-8');
  const config = JSON.parse(content) as Config;

  if (options.domain) {
    config.domains = [options.domain];
  }
  if (options.maxPages) {
    config.maxPagesPerCategory = parseInt(options.maxPages, 10);
  }
  if (options.concurrency) {
    config.concurrency = parseInt(options.concurrency, 10);
  }

  return config;
}

async function scanDomain(config: Config, domain: string): Promise<ScanReport> {
  logger.info(`Starting scan for domain: ${domain}`);

  const browser = await chromium.launch({ headless: true });
  const pageVisitor = new PageVisitor(config);
  await pageVisitor.initialize();

  const domAnalyzer = new DOMAnalyzer();
  const cluster = new PageClusterEngine(config.similarityThreshold);
  const sampler = new Sampler();
  const scanner = new MultiViewportScanner(browser, config);
  const resultStore = new ResultStore(config.output.dataDir);

  const fingerprints: any[] = [];
  const allResults: any[] = [];

  try {
    logger.info(`Step 1: Visiting homepage for ${domain}`);
    const { page: homepage, links } = await pageVisitor.visitHomepage(domain);
    logger.info(`Found ${links.length} unique links`);

    const homepageFp = await domAnalyzer.analyze(homepage, `https://${domain}/`);
    fingerprints.push(homepageFp);
    await homepage.close();

    logger.info(`Step 2: Analyzing DOM structure for ${links.length} pages`);

    const visitPromises = links.map(async (link, idx) => {
      try {
        const page = await pageVisitor.visitPage(link.url);
        const fp = await domAnalyzer.analyze(page, link.url);
        await page.close();
        return fp;
      } catch (error) {
        return null;
      }
    });

    const results = await Promise.all(visitPromises);
    for (const fp of results) {
      if (fp) fingerprints.push(fp);
    }

    logger.info(`Step 3: Clustering ${fingerprints.length} pages`);
    const clusters = cluster.cluster(fingerprints);

    logger.info(`Step 4: Sampling pages`);
    const sampledClusters = sampler.sampleFromClusters(clusters, config.maxPagesPerCategory);
    const sampledPages = sampler.getSampledPages(sampledClusters);
    logger.info(`Selected ${sampledPages.length} pages for testing`);

    logger.info(`Step 5: Running accessibility checks`);

    for (const pageFp of sampledPages) {
      try {
        const pageType = identifyPageType(pageFp.url, config.pageTypePatterns);
        const pageCluster = clusters.find(c => c.members.includes(pageFp));
        const category = pageCluster?.category || 'other';

        const result = await scanner.scanPage(pageFp.url, domain, category, pageType);
        allResults.push(result);
      } catch (error) {
        logger.error(`Failed to scan ${pageFp.url}:`, error);
      }
    }

    const report: ScanReport = {
      domain,
      timestamp: Date.now(),
      totalPages: allResults.length,
      totalIssues: allResults.reduce((sum, r) => sum + r.issues.length, 0),
      categories: clusters.length,
      pages: allResults,
    };

    await resultStore.saveResults(report);

    await pageVisitor.close();
    await browser.close();

    return report;
  } catch (error) {
    logger.error(`Failed to scan domain ${domain}:`, error);
    await pageVisitor.close();
    await browser.close();
    throw error;
  }
}

async function main() {
  if (options.verbose) {
    logger.level = 'debug';
  }

  logger.info('Enspider - Website Accessibility Monitor');

  try {
    const config = await loadConfig();

    await fs.mkdir(config.output.screenshotsDir, { recursive: true });
    await fs.mkdir(config.output.reportsDir, { recursive: true });
    await fs.mkdir(config.output.dataDir, { recursive: true });
    await fs.mkdir(config.output.logsDir, { recursive: true });

    const reports: ScanReport[] = [];

    for (const domain of config.domains) {
      const report = await scanDomain(config, domain);
      reports.push(report);
    }

    logger.info('Scan complete!');

    const totalPages = reports.reduce((sum, r) => sum + r.totalPages, 0);
    const totalIssues = reports.reduce((sum, r) => sum + r.totalIssues, 0);
    console.log(`\nSummary: ${totalPages} pages tested, ${totalIssues} issues found\n`);
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
