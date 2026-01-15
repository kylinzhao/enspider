import { Page } from 'playwright';

export interface SEOResult {
  meta: {
    hasTitle: boolean;
    hasDescription: boolean;
    hasKeywords: boolean;
    title: string;
    description: string;
    keywords: string;
    titleLength: number;
    descriptionLength: number;
    issues: string[];
  };
  openGraph: {
    hasOGTitle: boolean;
    hasOGDescription: boolean;
    hasOGImage: boolean;
    hasOGType: boolean;
    hasOGUrl: boolean;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    ogType: string;
    ogUrl: string;
    issues: string[];
  };
  twitterCard: {
    hasTwitterCard: boolean;
    hasTwitterTitle: boolean;
    hasTwitterDescription: boolean;
    hasTwitterImage: boolean;
    twitterCard: string;
    twitterTitle: string;
    twitterDescription: string;
    twitterImage: string;
    issues: string[];
  };
  structuredData: {
    hasJSONLD: boolean;
    hasMicrodata: boolean;
    hasRDFa: boolean;
    jsonLDCount: number;
    microdataCount: number;
    rdfaCount: number;
    types: string[];
    issues: string[];
  };
  headings: {
    hasH1: boolean;
    h1Count: number;
    headingStructure: string[];
    issues: string[];
  };
  images: {
    totalImages: number;
    imagesWithoutAlt: number;
    imagesWithEmptyAlt: number;
    issues: string[];
  };
  links: {
    totalLinks: number;
    brokenLinks: number;
    noFollowLinks: number;
    issues: string[];
  };
  score: number;
}

export class SEOChecker {
  async checkSEO(page: Page): Promise<SEOResult> {
    const result: SEOResult = {
      meta: {
        hasTitle: false,
        hasDescription: false,
        hasKeywords: false,
        title: '',
        description: '',
        keywords: '',
        titleLength: 0,
        descriptionLength: 0,
        issues: [],
      },
      openGraph: {
        hasOGTitle: false,
        hasOGDescription: false,
        hasOGImage: false,
        hasOGType: false,
        hasOGUrl: false,
        ogTitle: '',
        ogDescription: '',
        ogImage: '',
        ogType: '',
        ogUrl: '',
        issues: [],
      },
      twitterCard: {
        hasTwitterCard: false,
        hasTwitterTitle: false,
        hasTwitterDescription: false,
        hasTwitterImage: false,
        twitterCard: '',
        twitterTitle: '',
        twitterDescription: '',
        twitterImage: '',
        issues: [],
      },
      structuredData: {
        hasJSONLD: false,
        hasMicrodata: false,
        hasRDFa: false,
        jsonLDCount: 0,
        microdataCount: 0,
        rdfaCount: 0,
        types: [],
        issues: [],
      },
      headings: {
        hasH1: false,
        h1Count: 0,
        headingStructure: [],
        issues: [],
      },
      images: {
        totalImages: 0,
        imagesWithoutAlt: 0,
        imagesWithEmptyAlt: 0,
        issues: [],
      },
      links: {
        totalLinks: 0,
        brokenLinks: 0,
        noFollowLinks: 0,
        issues: [],
      },
      score: 0,
    };

    // Extract SEO data from page
    const seoData = await page.evaluate(() => {
      const data: any = {
        meta: {},
        openGraph: {},
        twitterCard: {},
        structuredData: {},
        headings: {},
        images: {},
        links: {},
      };

      // Meta tags
      const title = document.querySelector('title');
      data.meta.title = title?.textContent || '';
      data.meta.hasTitle = !!data.meta.title;

      const metaDesc = document.querySelector('meta[name="description"]');
      data.meta.description = metaDesc?.getAttribute('content') || '';
      data.meta.hasDescription = !!data.meta.description;

      const metaKeywords = document.querySelector('meta[name="keywords"]');
      data.meta.keywords = metaKeywords?.getAttribute('content') || '';
      data.meta.hasKeywords = !!data.meta.keywords;

      // Open Graph tags
      const ogTitle = document.querySelector('meta[property="og:title"]');
      data.openGraph.ogTitle = ogTitle?.getAttribute('content') || '';
      data.openGraph.hasOGTitle = !!data.openGraph.ogTitle;

      const ogDesc = document.querySelector('meta[property="og:description"]');
      data.openGraph.ogDescription = ogDesc?.getAttribute('content') || '';
      data.openGraph.hasOGDescription = !!data.openGraph.ogDescription;

      const ogImage = document.querySelector('meta[property="og:image"]');
      data.openGraph.ogImage = ogImage?.getAttribute('content') || '';
      data.openGraph.hasOGImage = !!data.openGraph.ogImage;

      const ogType = document.querySelector('meta[property="og:type"]');
      data.openGraph.ogType = ogType?.getAttribute('content') || '';
      data.openGraph.hasOGType = !!data.openGraph.ogType;

      const ogUrl = document.querySelector('meta[property="og:url"]');
      data.openGraph.ogUrl = ogUrl?.getAttribute('content') || '';
      data.openGraph.hasOGUrl = !!data.openGraph.ogUrl;

      // Twitter Card tags
      const twitterCard = document.querySelector('meta[name="twitter:card"]');
      data.twitterCard.twitterCard = twitterCard?.getAttribute('content') || '';
      data.twitterCard.hasTwitterCard = !!data.twitterCard.twitterCard;

      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      data.twitterCard.twitterTitle = twitterTitle?.getAttribute('content') || '';
      data.twitterCard.hasTwitterTitle = !!data.twitterCard.twitterTitle;

      const twitterDesc = document.querySelector('meta[name="twitter:description"]');
      data.twitterCard.twitterDescription = twitterDesc?.getAttribute('content') || '';
      data.twitterCard.hasTwitterDescription = !!data.twitterCard.twitterDescription;

      const twitterImage = document.querySelector('meta[name="twitter:image"]');
      data.twitterCard.twitterImage = twitterImage?.getAttribute('content') || '';
      data.twitterCard.hasTwitterImage = !!data.twitterCard.twitterImage;

      // Structured data
      const jsonLDScripts = document.querySelectorAll('script[type="application/ld+json"]');
      data.structuredData.jsonLDCount = jsonLDScripts.length;
      data.structuredData.hasJSONLD = jsonLDScripts.length > 0;

      const types: string[] = [];
      jsonLDScripts.forEach(script => {
        try {
          const json = JSON.parse(script.textContent || '');
          if (json['@type']) {
            types.push(json['@type']);
          }
        } catch (e) {
          // Invalid JSON
        }
      });
      data.structuredData.types = types;

      // Microdata
      const microdataElements = document.querySelectorAll('[itemscope]');
      data.structuredData.microdataCount = microdataElements.length;
      data.structuredData.hasMicrodata = microdataElements.length > 0;

      // RDFa
      const rdfaElements = document.querySelectorAll('[typeof]');
      data.structuredData.rdfaCount = rdfaElements.length;
      data.structuredData.hasRDFa = rdfaElements.length > 0;

      // Headings
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const headingStructure: string[] = [];
      let h1Count = 0;

      headings.forEach(heading => {
        const tagName = heading.tagName.toLowerCase();
        if (tagName === 'h1') h1Count++;
        headingStructure.push(`${tagName}: ${heading.textContent?.substring(0, 50) || ''}`);
      });

      data.headings.h1Count = h1Count;
      data.headings.hasH1 = h1Count > 0;
      data.headings.headingStructure = headingStructure;

      // Images
      const images = document.querySelectorAll('img');
      let imagesWithoutAlt = 0;
      let imagesWithEmptyAlt = 0;

      images.forEach(img => {
        const alt = img.getAttribute('alt');
        if (alt === null) {
          imagesWithoutAlt++;
        } else if (alt.trim() === '') {
          imagesWithEmptyAlt++;
        }
      });

      data.images.totalImages = images.length;
      data.images.imagesWithoutAlt = imagesWithoutAlt;
      data.images.imagesWithEmptyAlt = imagesWithEmptyAlt;

      // Links
      const links = document.querySelectorAll('a[href]');
      let noFollowLinks = 0;

      links.forEach(link => {
        const rel = link.getAttribute('rel');
        if (rel && rel.includes('nofollow')) {
          noFollowLinks++;
        }
      });

      data.links.totalLinks = links.length;
      data.links.noFollowLinks = noFollowLinks;

      return data;
    });

    // Update result with extracted data
    result.meta = {
      ...result.meta,
      ...seoData.meta,
      titleLength: seoData.meta.title?.length || 0,
      descriptionLength: seoData.meta.description?.length || 0,
    };

    result.openGraph = {
      ...result.openGraph,
      ...seoData.openGraph,
    };

    result.twitterCard = {
      ...result.twitterCard,
      ...seoData.twitterCard,
    };

    result.structuredData = {
      ...result.structuredData,
      ...seoData.structuredData,
    };

    result.headings = {
      ...result.headings,
      ...seoData.headings,
    };

    result.images = {
      ...result.images,
      ...seoData.images,
    };

    result.links = {
      ...result.links,
      ...seoData.links,
    };

    // Generate issues
    this.generateMetaIssues(result);
    this.generateOpenGraphIssues(result);
    this.generateTwitterCardIssues(result);
    this.generateStructuredDataIssues(result);
    this.generateHeadingIssues(result);
    this.generateImageIssues(result);
    this.generateLinkIssues(result);

    // Calculate score
    result.score = this.calculateScore(result);

    return result;
  }

  private generateMetaIssues(result: SEOResult): void {
    if (!result.meta.hasTitle) {
      result.meta.issues.push('Missing title tag');
    } else if (result.meta.titleLength < 30) {
      result.meta.issues.push(`Title too short (${result.meta.titleLength} chars, recommended: 30-60)`);
    } else if (result.meta.titleLength > 60) {
      result.meta.issues.push(`Title too long (${result.meta.titleLength} chars, recommended: 30-60)`);
    }

    if (!result.meta.hasDescription) {
      result.meta.issues.push('Missing meta description');
    } else if (result.meta.descriptionLength < 120) {
      result.meta.issues.push(`Description too short (${result.meta.descriptionLength} chars, recommended: 120-160)`);
    } else if (result.meta.descriptionLength > 160) {
      result.meta.issues.push(`Description too long (${result.meta.descriptionLength} chars, recommended: 120-160)`);
    }

    if (!result.meta.hasKeywords) {
      result.meta.issues.push('Missing meta keywords (optional but recommended)');
    }
  }

  private generateOpenGraphIssues(result: SEOResult): void {
    if (!result.openGraph.hasOGTitle) {
      result.openGraph.issues.push('Missing og:title tag');
    }
    if (!result.openGraph.hasOGDescription) {
      result.openGraph.issues.push('Missing og:description tag');
    }
    if (!result.openGraph.hasOGImage) {
      result.openGraph.issues.push('Missing og:image tag');
    }
    if (!result.openGraph.hasOGType) {
      result.openGraph.issues.push('Missing og:type tag (recommended: "website" or "article")');
    }
    if (!result.openGraph.hasOGUrl) {
      result.openGraph.issues.push('Missing og:url tag (recommended for accurate sharing)');
    }
  }

  private generateTwitterCardIssues(result: SEOResult): void {
    if (!result.twitterCard.hasTwitterCard) {
      result.twitterCard.issues.push('Missing twitter:card tag (recommended: "summary" or "summary_large_image")');
    }
    if (!result.twitterCard.hasTwitterTitle) {
      result.twitterCard.issues.push('Missing twitter:title tag');
    }
    if (!result.twitterCard.hasTwitterDescription) {
      result.twitterCard.issues.push('Missing twitter:description tag');
    }
    if (!result.twitterCard.hasTwitterImage) {
      result.twitterCard.issues.push('Missing twitter:image tag');
    }
  }

  private generateStructuredDataIssues(result: SEOResult): void {
    if (!result.structuredData.hasJSONLD && !result.structuredData.hasMicrodata && !result.structuredData.hasRDFa) {
      result.structuredData.issues.push('No structured data found (JSON-LD, Microdata, or RDFa recommended for SEO)');
    } else {
      if (result.structuredData.types.length > 0) {
        result.structuredData.issues.push(`Found structured data types: ${result.structuredData.types.join(', ')}`);
      }
    }
  }

  private generateHeadingIssues(result: SEOResult): void {
    if (!result.headings.hasH1) {
      result.headings.issues.push('Missing H1 tag (critical for SEO)');
    } else if (result.headings.h1Count > 1) {
      result.headings.issues.push(`Multiple H1 tags found (${result.headings.h1Count}, recommended: 1)`);
    }
  }

  private generateImageIssues(result: SEOResult): void {
    if (result.images.imagesWithoutAlt > 0) {
      result.images.issues.push(`${result.images.imagesWithoutAlt} images missing alt attribute`);
    }
    if (result.images.imagesWithEmptyAlt > 0) {
      result.images.issues.push(`${result.images.imagesWithEmptyAlt} images with empty alt attribute`);
    }
    if (result.images.totalImages > 0 && result.images.imagesWithoutAlt === 0 && result.images.imagesWithEmptyAlt === 0) {
      result.images.issues.push('All images have alt attributes ✓');
    }
  }

  private generateLinkIssues(result: SEOResult): void {
    if (result.links.totalLinks === 0) {
      result.links.issues.push('No links found on page');
    } else {
      const noFollowRatio = (result.links.noFollowLinks / result.links.totalLinks) * 100;
      if (noFollowRatio > 50) {
        result.links.issues.push(`High nofollow ratio: ${noFollowRatio.toFixed(1)}% (${result.links.noFollowLinks}/${result.links.totalLinks} links)`);
      }
    }
  }

  private calculateScore(result: SEOResult): number {
    let score = 0;
    const maxScore = 100;

    // Meta tags (25 points)
    if (result.meta.hasTitle) score += 8;
    if (result.meta.titleLength >= 30 && result.meta.titleLength <= 60) score += 2;
    if (result.meta.hasDescription) score += 10;
    if (result.meta.descriptionLength >= 120 && result.meta.descriptionLength <= 160) score += 5;

    // Open Graph (25 points)
    if (result.openGraph.hasOGTitle) score += 5;
    if (result.openGraph.hasOGDescription) score += 5;
    if (result.openGraph.hasOGImage) score += 8;
    if (result.openGraph.hasOGType) score += 4;
    if (result.openGraph.hasOGUrl) score += 3;

    // Twitter Card (10 points)
    if (result.twitterCard.hasTwitterCard) score += 3;
    if (result.twitterCard.hasTwitterTitle) score += 2;
    if (result.twitterCard.hasTwitterDescription) score += 2;
    if (result.twitterCard.hasTwitterImage) score += 3;

    // Structured Data (10 points)
    if (result.structuredData.hasJSONLD) score += 5;
    if (result.structuredData.hasMicrodata) score += 3;
    if (result.structuredData.hasRDFa) score += 2;

    // Headings (15 points)
    if (result.headings.hasH1) score += 10;
    if (result.headings.h1Count === 1) score += 5;

    // Images (10 points)
    if (result.images.totalImages > 0) {
      const imagesWithAlt = result.images.totalImages - result.images.imagesWithoutAlt;
      const altRatio = imagesWithAlt / result.images.totalImages;
      score += Math.round(altRatio * 10);
    }

    // Links (5 points)
    if (result.links.totalLinks > 0) {
      score += 5;
    }

    return Math.min(score, maxScore);
  }
}
