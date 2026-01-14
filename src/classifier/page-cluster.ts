import { DOMFingerprint, PageCluster } from '../types.js';
import { SimilarityCalculator } from './similarity-calculator.js';
import logger from '../utils/logger.js';

export class PageClusterEngine {
  private calculator: SimilarityCalculator;
  private threshold: number;

  constructor(threshold: number) {
    this.calculator = new SimilarityCalculator();
    this.threshold = threshold;
  }

  /**
   * Infer category name from fingerprint
   */
  private inferCategory(fp: DOMFingerprint): string {
    const url = fp.url.toLowerCase();

    // Pattern-based category inference
    if (url === '/' || url.endsWith('/')) return 'homepage';
    if (url.includes('/detail/') || url.includes('/item/')) return 'detail_page';
    if (url.includes('/list') || url.includes('/search')) return 'list_page';
    if (url.includes('/about') || url.includes('/company')) return 'about_page';
    if (url.includes('/contact')) return 'contact_page';
    if (url.includes('/help') || url.includes('/faq')) return 'help_page';
    if (url.includes('/news') || url.includes('/blog')) return 'news_page';

    // Structure-based inference
    if (fp.nodeCount > 1000 && fp.depth > 10) return 'complex_page';
    if (fp.breadth > 20) return 'content_heavy';

    return 'other';
  }

  /**
   * Generate unique cluster ID
   */
  private generateId(): string {
    return `cluster_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Find the most representative fingerprint in a cluster
   */
  private findRepresentative(members: DOMFingerprint[]): DOMFingerprint {
    if (members.length === 1) return members[0];

    // Find the one with highest average similarity to others
    let bestMember = members[0];
    let bestScore = -1;

    for (const member of members) {
      const others = members.filter(m => m.url !== member.url);
      const avgSim = this.calculator.calculateAverageSimilarity(member, others);
      if (avgSim > bestScore) {
        bestScore = avgSim;
        bestMember = member;
      }
    }

    return bestMember;
  }

  /**
   * Cluster pages by structural similarity using agglomerative hierarchical clustering
   */
  cluster(fingerprints: DOMFingerprint[]): PageCluster[] {
    const clusters: PageCluster[] = [];

    logger.info(`Clustering ${fingerprints.length} pages with threshold ${this.threshold}`);

    for (const fp of fingerprints) {
      let matchedCluster: PageCluster | null = null;

      // Try to add to existing cluster
      for (const cluster of clusters) {
        const avgSimilarity = this.calculator.calculateAverageSimilarity(
          fp,
          cluster.members
        );

        if (avgSimilarity >= this.threshold) {
          matchedCluster = cluster;
          break;
        }
      }

      if (matchedCluster) {
        matchedCluster.members.push(fp);
        // Update representative after adding new member
        matchedCluster.representative = this.findRepresentative(matchedCluster.members);
      } else {
        // Create new cluster
        const category = this.inferCategory(fp);
        clusters.push({
          id: this.generateId(),
          category,
          members: [fp],
          representative: fp,
        });
      }
    }

    logger.info(`Created ${clusters.length} clusters`);
    return clusters;
  }
}
