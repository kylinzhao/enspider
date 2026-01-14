
import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { MultiViewportScanner } from './checker/multi-viewport-scanner.js';
import { DatabaseManager } from './server/database.js';
import { Config } from './types.js';
import { screenshotAnalyzer } from './utils/screenshot-analyzer.js';

async function main() {
  const domain = 'en.guazi.com';
  const url = 'https://en.guazi.com/used-cars/?saleMethod=1';
  
  const configPath = path.join(process.cwd(), 'config', 'default.json');
  const configContent = await fs.readFile(configPath, 'utf-8');
  const config: Config = JSON.parse(configContent);
  
  // Use a temporary DB or existing one
  const db = new DatabaseManager(path.join(process.cwd(), 'output/data'));
  const testId = db.createTest(domain);
  console.log(`Created test ${testId}`);

  const browser = await chromium.launch({ headless: true });
  const scanner = new MultiViewportScanner(browser, config);
  
  try {
      console.log(`Scanning ${url}...`);
      const result = await scanner.scanPage(url, domain, 'manual', 'other', testId);
      
      console.log('Screenshots:', result.screenshots);
      
      // Analyze screenshots
      const issues = await screenshotAnalyzer.analyzePageScreenshots(result.screenshots);
      console.log('Analysis Issues:', JSON.stringify(issues, null, 2));
      
  } catch (err) {
      console.error(err);
  } finally {
      await browser.close();
  }
}

main().catch(console.error);
