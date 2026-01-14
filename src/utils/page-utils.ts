import { PageTypePatterns, ViewportMode, ViewportType, ViewportConfig } from '../types.js';

/**
 * Identify page type from URL
 */
export function identifyPageType(url: string, patterns: PageTypePatterns): 'homepage' | 'detail' | 'list' | 'other' {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Check homepage
    if (pathname === '/' || pathname === '') {
      return 'homepage';
    }

    // Check detail pages
    for (const pattern of patterns.detail) {
      const regex = new RegExp(pattern);
      if (regex.test(pathname)) {
        return 'detail';
      }
    }

    // Check list pages
    for (const pattern of patterns.list) {
      const regex = new RegExp(pattern);
      if (regex.test(pathname)) {
        return 'list';
      }
    }

    return 'other';
  } catch {
    return 'other';
  }
}

/**
 * Get UserAgent strings for different modes
 */
export function getUserAgents(): { normal: string; spider: string } {
  const testTag = ' enspider-test/1.0';

  return {
    normal: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36${testTag}`,
    spider: `Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)${testTag}`
  };
}

/**
 * Get all 4 viewport modes
 */
export function getViewportModes(pcConfig: ViewportConfig, mobileConfig: ViewportConfig): ViewportMode[] {
  const userAgents = getUserAgents();

  return [
    {
      name: 'pc_normal',
      config: pcConfig,
      userAgent: userAgents.normal,
      isSpider: false
    },
    {
      name: 'mobile_normal',
      config: mobileConfig,
      userAgent: userAgents.normal,
      isSpider: false
    },
    {
      name: 'pc_spider',
      config: pcConfig,
      userAgent: userAgents.spider,
      isSpider: true
    },
    {
      name: 'mobile_spider',
      config: mobileConfig,
      userAgent: userAgents.spider,
      isSpider: true
    }
  ];
}

/**
 * Get viewport mode by name
 */
export function getViewportModeByName(name: ViewportType, pcConfig: ViewportConfig, mobileConfig: ViewportConfig): ViewportMode {
  const modes = getViewportModes(pcConfig, mobileConfig);
  return modes.find(m => m.name === name)!;
}
