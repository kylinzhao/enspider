import URL from 'url';
import { PageUrl } from '../types.js';

export class URLNormalizer {
  private domain: string;
  private excludedPatterns: RegExp[];

  constructor(domain: string, excludedPatterns: string[]) {
    this.domain = domain;
    this.excludedPatterns = excludedPatterns.map(p => new RegExp(p, 'i'));
  }

  normalize(rawUrl: string, baseUrl?: string): PageUrl | null {
    try {
      let fullUrl: string;

      if (baseUrl && !rawUrl.startsWith('http')) {
        // Handle relative URLs
        fullUrl = new URL.URL(rawUrl, baseUrl).href;
      } else {
        fullUrl = rawUrl;
      }

      const urlObj = new URL.URL(fullUrl);

      // Check if same domain
      if (urlObj.hostname !== this.domain) {
        return null;
      }

      // Check excluded patterns
      for (const pattern of this.excludedPatterns) {
        if (pattern.test(urlObj.pathname) || pattern.test(fullUrl)) {
          return null;
        }
      }

      // Normalize: remove fragment, lowercase hostname, sort query params
      urlObj.hash = '';
      urlObj.hostname = urlObj.hostname.toLowerCase();

      // Sort query parameters
      if (urlObj.searchParams.toString()) {
        const params = Array.from(urlObj.searchParams.entries()).sort((a, b) =>
          a[0].localeCompare(b[0])
        );
        urlObj.search = '';
        params.forEach(([key, value]) => urlObj.searchParams.append(key, value));
      }

      const normalized = urlObj.href;

      return {
        url: fullUrl,
        domain: this.domain,
        normalized,
      };
    } catch (error) {
      return null;
    }
  }

  deduplicate(urls: PageUrl[]): PageUrl[] {
    const seen = new Set<string>();
    return urls.filter(u => {
      if (seen.has(u.normalized)) {
        return false;
      }
      seen.add(u.normalized);
      return true;
    });
  }
}
