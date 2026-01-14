import logger from './logger.js';

export class ProgressTracker {
  private testName: string;
  private startTime: number;

  constructor(testName: string) {
    this.testName = testName;
    this.startTime = Date.now();
  }

  step(step: number, total: number, message: string): void {
    const progress = Math.round((step / total) * 100);
    const elapsed = Date.now() - this.startTime;
    logger.info(`[${this.testName}] [${progress}%] [${step}/${total}] ${message} (${elapsed}ms)`);
    console.log(`[${progress}%] ${message} (${step}/${total})`);
  }

  complete(message: string): void {
    const elapsed = Date.now() - this.startTime;
    logger.info(`[${this.testName}] ✓ ${message} (${elapsed}ms)`);
    console.log(`✓ ${message} (${Math.round(elapsed/1000)}s)`);
  }

  error(message: string, error?: any): void {
    logger.error(`[${this.testName}] ✗ ${message}`, error);
    console.log(`✗ ${message}`);
  }

  info(message: string): void {
    logger.info(`[${this.testName}] ${message}`);
    console.log(`  ${message}`);
  }
}
