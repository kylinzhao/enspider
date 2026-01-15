// Type definitions for enspider

export interface Config {
  domains: string[];
  maxPagesPerCategory: number;
  concurrency: number;
  timeout: number;
  retries: number;
  delay: number;
  similarityThreshold: number;
  viewports: {
    pc: ViewportConfig;
    mobile: ViewportConfig;
  };
  excludedPatterns: string[];
  output: OutputConfig;
  checks: CheckConfig;
  pageTypePatterns: PageTypePatterns;
}

export interface PageTypePatterns {
  detail: RegExp[];
  list: RegExp[];
}

export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile: boolean;
  hasTouch?: boolean;
}

export type ViewportType = 'pc_normal' | 'mobile_normal' | 'pc_spider' | 'mobile_spider';

export interface ViewportMode {
  name: ViewportType;
  config: ViewportConfig;
  userAgent: string;
  isSpider: boolean;
}

export interface OutputConfig {
  screenshotsDir: string;
  reportsDir: string;
  dataDir: string;
  logsDir: string;
}

export interface CheckConfig {
  viewportOverflow: boolean;
  horizontalScroll: boolean;
  httpErrors: boolean;
  timeout: boolean;
  jsErrors: boolean;
  brokenImages: boolean;
}

export interface PageUrl {
  url: string;
  domain: string;
  normalized: string;
}

export interface PageResult {
  url: string;
  domain: string;
  pageType: 'homepage' | 'detail' | 'list' | 'other';
  category: string;
  status: 'success' | 'error' | 'timeout';
  screenshots: {
    pc_normal?: string;
    mobile_normal?: string;
    pc_spider?: string;
    mobile_spider?: string;
  };
  issues: Issue[];
  timestamp: number;
  loadTime: number;
  httpStatus: number;
  requestIds?: {
    pc_normal?: string;
    mobile_normal?: string;
    pc_spider?: string;
    mobile_spider?: string;
  };
  seo?: {
    score: number;
    meta: any;
    openGraph: any;
    twitterCard: any;
    structuredData: any;
    headings: any;
    images: any;
    links: any;
  };
}

export interface Issue {
  type: 'viewport_overflow' | 'horizontal_scroll' | 'http_error' | 'timeout' | 'js_error' | 'broken_image' | 'error_text' | 'request_id' | 'screenshot_failed';
  severity: 'error' | 'warning' | 'info';
  message: string;
  viewport: ViewportType;
}

export interface DOMFingerprint {
  url: string;
  tagSequence: string[];
  classPatterns: string[];
  depth: number;
  breadth: number;
  nodeCount: number;
}

export interface PageCluster {
  id: string;
  category: string;
  members: DOMFingerprint[];
  representative: DOMFingerprint;
}

export interface ScanReport {
  domain: string;
  timestamp: number;
  totalPages: number;
  totalIssues: number;
  categories: number;
  pages: PageResult[];
}

export interface ScreenshotInfo {
  domain: string;
  pagePath: string;
  viewport: string;
  path: string;
}
