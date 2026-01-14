import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import logger from './logger.js';

export interface ScreenshotQualityIssue {
  type: 'all_white' | 'mostly_white' | 'blank' | 'error' | 'normal';
  severity: 'error' | 'warning' | 'info';
  message: string;
  whitePercentage: number;
}

export class ScreenshotAnalyzer {
  // Thresholds for screenshot quality detection (all in percentage 0-100)
  // - 98%+ white = true white screen (error)
  // - 92%+ white = mostly white/incomplete content (warning)
  // - 80%+ white for PC viewport = potential error (error)
  // - Normal pages with content typically have 60-85% white background
  private readonly ALL_WHITE_THRESHOLD = 98; // 98% white pixels = actual white screen
  private readonly MOSTLY_WHITE_THRESHOLD = 92; // 92% white pixels = mostly white/incomplete
  private readonly PC_WARNING_THRESHOLD = 80; // 80%+ white for PC viewport = potential error
  private toPercent(value: number): number {
    return value <= 1 ? value * 100 : value;
  }

  /**
   * Analyze a screenshot and detect quality issues
   */
  async analyzeScreenshot(screenshotPath: string): Promise<ScreenshotQualityIssue | null> {
    try {
      // Check if file exists
      await fs.access(screenshotPath);

      // Get image stats
      const stats = await this.getImageStats(screenshotPath);

      // Check for issues
      if (stats.whitePercentage >= this.toPercent(this.ALL_WHITE_THRESHOLD)) {
        return {
          type: 'all_white',
          severity: 'error',
          message: `Screenshot is ${stats.whitePercentage.toFixed(1)}% white (possibly failed to load)`,
          whitePercentage: stats.whitePercentage,
        };
      }

      if (stats.whitePercentage >= this.toPercent(this.MOSTLY_WHITE_THRESHOLD)) {
        return {
          type: 'mostly_white',
          severity: 'warning',
          message: `Screenshot is ${stats.whitePercentage.toFixed(1)}% white (possibly incomplete)`,
          whitePercentage: stats.whitePercentage,
        };
      }

      return {
        type: 'normal',
        severity: 'info',
        message: 'Normal',
        whitePercentage: stats.whitePercentage,
      };
    } catch (error) {
      logger.error(`Failed to analyze screenshot: ${screenshotPath}`, error);
      return {
        type: 'error',
        severity: 'error',
        message: 'Failed to analyze screenshot',
        whitePercentage: 100,
      };
    }
  }

  /**
   * Get image statistics including white pixel percentage
   */
  private async getImageStats(imagePath: string): Promise<{
    width: number;
    height: number;
    whitePercentage: number;
  }> {
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image metadata');
    }

    // Get image stats (resize to smaller size for performance)
    const { dominant } = await image
      .resize(50, 50, { fit: 'fill' })  // Reduced from 100x100 to 50x50 for speed
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => {
        let whitePixels = 0;
        const totalPixels = info.width * info.height;

        // Count white/light pixels (R, G, B all > 240)
        for (let i = 0; i < data.length; i += 3) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Check if pixel is white or very light
          if (r > 240 && g > 240 && b > 240) {
            whitePixels++;
          }
        }

        return {
          dominant: { whitePercentage: (whitePixels / totalPixels) * 100 },
        };
      });

    return {
      width: metadata.width,
      height: metadata.height,
      whitePercentage: dominant.whitePercentage,
    };
  }

  /**
   * Analyze all screenshots for a page
   */
  async analyzePageScreenshots(
    screenshots: Record<string, string>
  ): Promise<Record<string, ScreenshotQualityIssue | null>> {
    const results: Record<string, ScreenshotQualityIssue | null> = {};

    for (const [viewport, path] of Object.entries(screenshots)) {
      if (path) {
        // For PC viewports, use stricter threshold (80%)
        if (viewport === 'pc_normal' || viewport === 'pc_spider') {
          results[viewport] = await this.analyzeScreenshotWithThreshold(path, this.PC_WARNING_THRESHOLD);
        } else {
          results[viewport] = await this.analyzeScreenshot(path);
        }
      }
    }

    return results;
  }

  /**
   * Analyze a screenshot with custom threshold
   */
  async analyzeScreenshotWithThreshold(
    screenshotPath: string,
    threshold: number
  ): Promise<ScreenshotQualityIssue | null> {
    try {
      await fs.access(screenshotPath);
      const stats = await this.getImageStats(screenshotPath);

      const thresholdPct = this.toPercent(threshold);
      if (stats.whitePercentage >= thresholdPct) {
        return {
          type: 'mostly_white',
          severity: 'error',
          message: `Screenshot is ${stats.whitePercentage.toFixed(1)}% white (PC viewport > ${thresholdPct}%)`,
          whitePercentage: stats.whitePercentage,
        };
      }

      return {
        type: 'normal',
        severity: 'info',
        message: 'Normal',
        whitePercentage: stats.whitePercentage,
      };
    } catch (error) {
      logger.error(`Failed to analyze screenshot: ${screenshotPath}`, error);
      return {
        type: 'error',
        severity: 'error',
        message: 'Failed to analyze screenshot',
        whitePercentage: 100,
      };
    }
  }
}

export const screenshotAnalyzer = new ScreenshotAnalyzer();
