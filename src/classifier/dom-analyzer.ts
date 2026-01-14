import { Page } from 'playwright';
import { DOMFingerprint } from '../types.js';
import logger from '../utils/logger.js';

export class DOMAnalyzer {
  async analyze(page: Page, url: string): Promise<DOMFingerprint> {
    try {
      const fingerprint = await page.evaluate(() => {
        // Extract tag sequence (top-level hierarchy)
        const tagSequence: string[] = [];
        let current = document.body;
        while (current && current.parentElement) {
          tagSequence.unshift(current.tagName.toLowerCase());
          current = current.parentElement;
        }

        // Extract class patterns (frequent class names)
        const classElements = document.querySelectorAll('[class]');
        const classSet = new Set<string>();
        classElements.forEach(el => {
          const classes = (el as HTMLElement).className?.split(/\s+/);
          classes?.forEach(c => {
            if (c && c.length > 2) classSet.add(c);
          });
        });

        // Calculate DOM depth
        const getDepth = (node: HTMLElement, depth = 0): number => {
          if (!node.parentElement || node.parentElement === document.body) {
            return depth;
          }
          return getDepth(node.parentElement as HTMLElement, depth + 1);
        };

        const allElements = document.querySelectorAll('*');
        let maxDepth = 0;
        allElements.forEach(el => {
          const d = getDepth(el as HTMLElement);
          if (d > maxDepth) maxDepth = d;
        });

        // Count breadth (immediate children of body)
        const breadth = document.body.children.length;

        // Total node count
        const nodeCount = document.querySelectorAll('*').length;

        return {
          tagSequence,
          classPatterns: Array.from(classSet).slice(0, 50), // Limit to top 50
          depth: maxDepth,
          breadth,
          nodeCount,
        };
      });

      return {
        url,
        ...fingerprint,
      };
    } catch (error) {
      logger.error(`Failed to analyze DOM for ${url}:`, error);
      return {
        url,
        tagSequence: [],
        classPatterns: [],
        depth: 0,
        breadth: 0,
        nodeCount: 0,
      };
    }
  }
}
