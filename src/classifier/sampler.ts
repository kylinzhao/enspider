import { PageCluster, DOMFingerprint } from '../types.js';
import { SimilarityCalculator } from './similarity-calculator.js';
import logger from '../utils/logger.js';

export class Sampler {
  private calculator: SimilarityCalculator;

  constructor() {
    this.calculator = new SimilarityCalculator();
  }

  /**
   * Select diverse pages from a cluster using k-means++ style selection
   */
  private selectDiversePages(members: DOMFingerprint[], maxSamples: number): DOMFingerprint[] {
    if (members.length <= maxSamples) {
      return members;
    }

    const selected: DOMFingerprint[] = [];

    // First selection: the cluster representative (centroid-like)
    // For simplicity, select the first member
    selected.push(members[0]);

    // Subsequent selections: choose the most diverse from remaining
    while (selected.length < maxSamples) {
      let bestCandidate: DOMFingerprint | null = null;
      let minMaxSimilarity = 1; // We want minimum similarity to be selected

      for (const member of members) {
        if (selected.includes(member)) continue;

        // Find maximum similarity to any already selected member
        let maxSim = 0;
        for (const s of selected) {
          const sim = this.calculator.calculate(member, s);
          if (sim > maxSim) {
            maxSim = sim;
          }
        }

        // Choose candidate with smallest max similarity (most diverse)
        if (maxSim < minMaxSimilarity) {
          minMaxSimilarity = maxSim;
          bestCandidate = member;
        }
      }

      if (bestCandidate) {
        selected.push(bestCandidate);
      } else {
        break;
      }
    }

    return selected;
  }

  /**
   * Sample pages from all clusters
   */
  sampleFromClusters(
    clusters: PageCluster[],
    maxPagesPerCategory: number
  ): Map<string, DOMFingerprint[]> {
    const sampled = new Map<string, DOMFingerprint[]>();

    for (const cluster of clusters) {
      const selected = this.selectDiversePages(cluster.members, maxPagesPerCategory);
      sampled.set(cluster.id, selected);

      logger.info(
        `Cluster ${cluster.category}: sampled ${selected.length}/${cluster.members.length} pages`
      );
    }

    return sampled;
  }

  /**
   * Get all sampled pages as a flat array
   */
  getSampledPages(sampledClusters: Map<string, DOMFingerprint[]>): DOMFingerprint[] {
    const allPages: DOMFingerprint[] = [];

    for (const [clusterId, pages] of sampledClusters.entries()) {
      allPages.push(...pages);
    }

    return allPages;
  }
}
