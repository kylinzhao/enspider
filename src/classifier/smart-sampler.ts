import { PageCluster, DOMFingerprint } from '../types.js';
import { SimilarityCalculator } from './similarity-calculator.js';
import { identifyPageType } from '../utils/page-utils.js';
import logger from '../utils/logger.js';

interface TypedFingerprint extends DOMFingerprint {
  pageType: 'homepage' | 'detail' | 'list' | 'other';
}

export class SmartSampler {
  private calculator: SimilarityCalculator;

  constructor() {
    this.calculator = new SimilarityCalculator();
  }

  /**
   * Select diverse pages from a cluster using k-means++ style selection
   */
  private selectDiversePages(members: TypedFingerprint[], maxSamples: number): TypedFingerprint[] {
    if (members.length <= maxSamples) {
      return members;
    }

    const selected: TypedFingerprint[] = [];

    // First selection: the cluster representative (centroid-like)
    selected.push(members[0]);

    // Subsequent selections: choose the most diverse from remaining
    while (selected.length < maxSamples) {
      let bestCandidate: TypedFingerprint | null = null;
      let minMaxSimilarity = 1;

      for (const member of members) {
        if (selected.includes(member)) continue;

        let maxSim = 0;
        for (const s of selected) {
          const sim = this.calculator.calculate(member, s);
          if (sim > maxSim) {
            maxSim = sim;
          }
        }

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
   * Sample pages ensuring detail and list pages are included
   */
  sampleFromClusters(
    clusters: PageCluster[],
    maxPagesPerCategory: number,
    patterns: any
  ): Map<string, TypedFingerprint[]> {
    const sampled = new Map<string, TypedFingerprint[]>();

    // Add page types to fingerprints
    const typedClusters: Array<{ id: string; category: string; members: TypedFingerprint[] }> = [];

    for (const cluster of clusters) {
      const typedMembers: TypedFingerprint[] = cluster.members.map(fp => ({
        ...fp,
        pageType: identifyPageType(fp.url, patterns)
      }));

      typedClusters.push({
        id: cluster.id,
        category: cluster.category,
        members: typedMembers
      });
    }

    // Sample from each cluster
    for (const cluster of typedClusters) {
      const selected = this.selectDiversePages(cluster.members, maxPagesPerCategory);
      sampled.set(cluster.id, selected);

      logger.info(
        `Cluster ${cluster.category}: sampled ${selected.length}/${cluster.members.length} pages`
      );
    }

    // Ensure at least one detail page and one list page are included
    this.ensurePageTypes(sampled, typedClusters, patterns);

    return sampled;
  }

  /**
   * Ensure required page types are included in the sample (at least 3 each)
   */
  private ensurePageTypes(
    sampled: Map<string, TypedFingerprint[]>,
    clusters: Array<{ id: string; category: string; members: TypedFingerprint[] }>,
    patterns: any
  ): void {
    const allSampled = Array.from(sampled.values()).flat();

    // Ensure at least 3 detail pages
    const detailPages = allSampled.filter(fp => fp.pageType === 'detail');
    const detailCount = detailPages.length;
    const minDetailPages = 3;

    if (detailCount < minDetailPages) {
      const needed = minDetailPages - detailCount;
      logger.info(`Need ${needed} more detail page(s) (have ${detailCount}, need ${minDetailPages})`);

      for (let i = 0; i < needed; i++) {
        const detailPage = this.findPageByType(clusters, 'detail', allSampled);
        if (detailPage) {
          this.addToSample(sampled, clusters, detailPage);
          allSampled.push(detailPage);
          logger.info(`Added detail page: ${detailPage.url}`);
        } else {
          logger.warn('Could not find enough detail pages');
          break;
        }
      }
    }

    // Ensure at least 3 list pages
    const listPages = allSampled.filter(fp => fp.pageType === 'list');
    const listCount = listPages.length;
    const minListPages = 3;

    if (listCount < minListPages) {
      const needed = minListPages - listCount;
      logger.info(`Need ${needed} more list page(s) (have ${listCount}, need ${minListPages})`);

      for (let i = 0; i < needed; i++) {
        const listPage = this.findPageByType(clusters, 'list', allSampled);
        if (listPage) {
          this.addToSample(sampled, clusters, listPage);
          allSampled.push(listPage);
          logger.info(`Added list page: ${listPage.url}`);
        } else {
          logger.warn('Could not find enough list pages');
          break;
        }
      }
    }

    logger.info(`Final count: ${allSampled.filter(fp => fp.pageType === 'detail').length} detail pages, ${allSampled.filter(fp => fp.pageType === 'list').length} list pages`);
  }

  /**
   * Find a page of specific type not already sampled
   */
  private findPageByType(
    clusters: Array<{ id: string; category: string; members: TypedFingerprint[] }>,
    pageType: 'homepage' | 'detail' | 'list' | 'other',
    exclude: TypedFingerprint[]
  ): TypedFingerprint | null {
    const excludeUrls = new Set(exclude.map(fp => fp.url));

    for (const cluster of clusters) {
      const page = cluster.members.find(fp => fp.pageType === pageType && !excludeUrls.has(fp.url));
      if (page) return page;
    }

    return null;
  }

  /**
   * Add a page to the appropriate cluster in samples
   */
  private addToSample(
    sampled: Map<string, TypedFingerprint[]>,
    clusters: Array<{ id: string; category: string; members: TypedFingerprint[] }>,
    page: TypedFingerprint
  ): void {
    // Find which cluster this page belongs to
    for (const cluster of clusters) {
      if (cluster.members.some(m => m.url === page.url)) {
        const current = sampled.get(cluster.id) || [];
        current.push(page);
        sampled.set(cluster.id, current);
        return;
      }
    }
  }

  /**
   * Get all sampled pages as a flat array
   */
  getSampledPages(sampledClusters: Map<string, TypedFingerprint[]>): DOMFingerprint[] {
    const allPages: DOMFingerprint[] = [];

    for (const [clusterId, pages] of sampledClusters.entries()) {
      allPages.push(...pages);
    }

    return allPages;
  }
}
