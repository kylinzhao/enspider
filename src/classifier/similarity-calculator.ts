import { DOMFingerprint } from '../types.js';

export class SimilarityCalculator {
  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string[], str2: string[]): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1, // deletion
            dp[i][j - 1] + 1, // insertion
            dp[i - 1][j - 1] + 1 // substitution
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Calculate tag sequence similarity using Levenshtein distance
   */
  private tagSequenceSimilarity(fp1: DOMFingerprint, fp2: DOMFingerprint): number {
    if (fp1.tagSequence.length === 0 && fp2.tagSequence.length === 0) {
      return 1;
    }
    if (fp1.tagSequence.length === 0 || fp2.tagSequence.length === 0) {
      return 0;
    }

    const maxLen = Math.max(fp1.tagSequence.length, fp2.tagSequence.length);
    const distance = this.levenshteinDistance(fp1.tagSequence, fp2.tagSequence);
    return 1 - distance / maxLen;
  }

  /**
   * Calculate structural similarity
   */
  private structuralSimilarity(fp1: DOMFingerprint, fp2: DOMFingerprint): number {
    // Depth similarity
    const depthSim =
      fp1.depth === 0 && fp2.depth === 0
        ? 1
        : 1 - Math.abs(fp1.depth - fp2.depth) / Math.max(fp1.depth, fp2.depth);

    // Breadth similarity
    const breadthSim =
      fp1.breadth === 0 && fp2.breadth === 0
        ? 1
        : 1 - Math.abs(fp1.breadth - fp2.breadth) / Math.max(fp1.breadth, fp2.breadth);

    // Node count similarity
    const nodeSim =
      fp1.nodeCount === 0 && fp2.nodeCount === 0
        ? 1
        : 1 -
          Math.abs(fp1.nodeCount - fp2.nodeCount) /
            Math.max(fp1.nodeCount, fp2.nodeCount);

    // Class pattern similarity (Jaccard index)
    const classSet1 = new Set(fp1.classPatterns);
    const classSet2 = new Set(fp2.classPatterns);
    const intersection = new Set([...classSet1].filter(x => classSet2.has(x)));
    const union = new Set([...classSet1, ...classSet2]);
    const classSim = union.size === 0 ? 1 : intersection.size / union.size;

    // Weighted combination
    return depthSim * 0.3 + breadthSim * 0.2 + nodeSim * 0.2 + classSim * 0.3;
  }

  /**
   * Calculate overall similarity between two fingerprints
   */
  calculate(fp1: DOMFingerprint, fp2: DOMFingerprint): number {
    const tagSim = this.tagSequenceSimilarity(fp1, fp2);
    const structSim = this.structuralSimilarity(fp1, fp2);

    // Weighted combination: 60% tag sequence, 40% structure
    return tagSim * 0.6 + structSim * 0.4;
  }

  /**
   * Calculate average similarity between a fingerprint and cluster members
   */
  calculateAverageSimilarity(fp: DOMFingerprint, members: DOMFingerprint[]): number {
    if (members.length === 0) return 0;

    const similarities = members.map(m => this.calculate(fp, m));
    return similarities.reduce((a, b) => a + b, 0) / similarities.length;
  }
}
