# Code Review: scanner-service.ts

**Date:** 2025-01-19
**Commit:** d16e54f - fix: home page loading tests issue and implement scheduled tasks
**File:** `src/server/scanner-service.ts`
**Reviewer:** Claude Code

## Summary

This commit introduces multi-domain scanning support, allowing the accessibility scanner to test multiple domain variants (e.g., `en.guazi.com`, `ru.guazi.com`) in a single scan operation. The implementation adds domain replacement logic, increases timeout duration, and includes duplicate URL prevention.

---

## Changes Overview

### 1. **New Feature: Multi-Domain Support**

**Added:**
- `domains?: string[]` to `ScanOptions` interface (line 20)
- `replaceDomainInUrl()` helper function (lines 23-35)
- Multi-domain configuration retrieval from database (lines 46-51)
- Domain loop in scanning logic (lines 262-336)

**Positive:**
- ✅ Well-structured feature addition
- ✅ Extends existing functionality without breaking changes
- ✅ Provides clear logging for multi-domain scans
- ✅ Follows existing code patterns and style

**Concerns:**
- ⚠️ **Limited URL Pattern Support**: The `replaceDomainInUrl()` function assumes URLs follow the pattern `subdomain.domain.tld`. It may fail with:
  - Different TLD structures (e.g., `co.uk`)
  - IP addresses
  - Non-standard domain formats
  - URLs without subdomains

```typescript
// Current implementation (lines 23-35)
function replaceDomainInUrl(url: string, oldDomain: string, newDomain: string): string {
  const urlObj = new URL(url);
  const hostname = urlObj.hostname;
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    const baseDomain = parts.slice(1).join('.');  // Assumption: simple structure
    urlObj.hostname = `${newDomain}.${baseDomain}`;
  }
  return urlObj.toString();
}
```

**Recommendation:**
```typescript
function replaceDomainInUrl(url: string, oldDomain: string, newDomain: string): string {
  try {
    const urlObj = new URL(url);
    // More robust: replace the first occurrence of oldDomain
    if (urlObj.hostname.includes(`${oldDomain}.`)) {
      urlObj.hostname = urlObj.hostname.replace(`${oldDomain}.`, `${newDomain}.`);
    } else if (urlObj.hostname.startsWith(oldDomain) && !urlObj.hostname.includes('.')) {
      urlObj.hostname = newDomain;
    } else {
      logger.warn(`Cannot replace domain in URL: ${url}. Old domain '${oldDomain}' not found in hostname.`);
    }
    return urlObj.toString();
  } catch (error) {
    logger.error(`Failed to replace domain in URL: ${url}`, error);
    return url; // Return original URL on error
  }
}
```

---

### 2. **Timeout Increase**

**Change:** 10 minutes → 20 minutes (line 73)

```typescript
- const TIMEOUT_MS = 10 * 60 * 1000;
+ const TIMEOUT_MS = 20 * 60 * 1000;
```

**Concerns:**
- ⚠️ **Magic Number**: Hardcoded timeout value makes it difficult to adjust per domain/configuration
- ⚠️ **No Granular Control**: Single timeout for entire scan, not per-page or per-domain

**Recommendation:**
```typescript
// Make timeout configurable
const configPath = path.join(process.cwd(), 'config', 'default.json');
const configContent = await fs.readFile(configPath, 'utf-8');
const config: Config = JSON.parse(configContent);
const TIMEOUT_MS = config.scanTimeout || 20 * 60 * 1000; // Default 20 minutes
```

---

### 3. **Duplicate URL Prevention**

**Added:** `scannedUrls` Set (lines 267-268)

```typescript
const scannedUrls = new Set<string>();
```

**Positive:**
- ✅ Good preventive measure to avoid redundant work
- ✅ Simple and efficient O(1) lookup

**Concerns:**
- ⚠️ **URL Normalization**: Does not account for URL variations that are semantically identical:
  - Trailing slashes: `/path` vs `/path/`
  - Query parameters: `/path?a=1` vs `/path?a=1&b=2`
  - Fragments: `/path#section`
  - Case sensitivity (depending on server)

**Recommendation:**
```typescript
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove fragment
    urlObj.hash = '';
    // Sort query parameters (optional, for more aggressive normalization)
    const params = new URLSearchParams(urlObj.search);
    const sortedParams = [...params.entries()].sort();
    urlObj.search = new URLSearchParams(sortedParams).toString();
    // Remove trailing slash from pathname (if present and not root)
    if (urlObj.pathname.length > 1 && urlObj.pathname.endsWith('/')) {
      urlObj.pathname = urlObj.pathname.slice(0, -1);
    }
    return urlObj.toString().toLowerCase();
  } catch {
    return url;
  }
}

// Usage:
if (scannedUrls.has(normalizeUrl(urlToTest))) {
  logger.warn(`Skipping duplicate URL: ${urlToTest}`);
  continue;
}
scannedUrls.add(normalizeUrl(urlToTest));
```

---

### 4. **Database Schema Changes**

**Added:** `original_url` and `original_domain` fields (lines 327-328)

```typescript
original_url: pageFp.url,
original_domain: domain,
```

**Positive:**
- ✅ Preserves source information for filtering/tracking
- ✅ Enables traceability of which pages were sampled from which domain

**Concerns:**
- ❓ **Migration Check**: Were database migrations run to add these columns?
- ❓ **Backward Compatibility**: What happens with existing database records?

**Recommendation:**
- Verify that `DatabaseManager.createPage()` accepts these new parameters
- Add migration script if not already present
- Consider making these fields optional with proper TypeScript types

---

### 5. **Progress Tracking Updates**

**Change:** Updated progress calculations for multi-domain scans (lines 252-256, 276-277)

```typescript
const totalDomainsToTest = domainsToTest && domainsToTest.length > 0 ? domainsToTest.length : 1;
const totalPageScans = sampledPages.length * totalDomainsToTest;
```

**Positive:**
- ✅ Accurate progress reporting across domains
- ✅ Clear logging of domain in progress messages

**Minor Issue:**
- 📝 The `totalPages` variable name is misleading (line 260):
  ```typescript
  const totalPages = sampledPages;  // Should be totalPagesSampled or similar
  ```
  This variable is not used correctly for progress calculation. The actual total is `totalPageScans`.

---

### 6. **Error Handling**

**Observations:**
- ⚠️ `replaceDomainInUrl()` has no error handling for invalid URLs
- ⚠️ No validation that `oldDomain` parameter exists in the URL
- ✅ Good error handling in the main scanning loop with try-catch
- ✅ Screenshot analysis errors are caught and logged

**Recommendation:**
Add validation and error handling to `replaceDomainInUrl()` as shown in section 1.

---

### 7. **Performance Considerations**

**Positive:**
- ✅ Duplicate URL prevention saves resources
- ✅ Screenshot analysis is asynchronous (non-blocking)
- ✅ Set data structure for O(1) duplicate checking

**Concerns:**
- ⚠️ **Sequential Domain Scanning**: Domains are scanned sequentially within the page loop. For large scans, this could be slow.

```typescript
// Current: Sequential (lines 263-336)
for (const pageFp of sampledPages) {
  for (let domainIndex = 0; domainIndex < domainsForScan.length; domainIndex++) {
    // Scan each domain sequentially
  }
}
```

**Question:**
- Was sequential scanning intentional (to avoid overwhelming servers)?
- Could parallel scanning with rate limiting improve performance?

---

### 8. **Code Quality & Maintainability**

**Positive:**
- ✅ Consistent code style with existing codebase
- ✅ Clear variable names (`domainsToTest`, `urlToTest`, `domainLabel`)
- ✅ Informative console logging and progress messages
- ✅ Comments explain the purpose of new code blocks

**Minor Suggestions:**
- 📝 Consider extracting domain scanning logic into a separate function for better readability:
  ```typescript
  async function scanPageAcrossDomains(
    pageFp: PageFingerprint,
    domains: string[],
    baseDomain: string,
    scanner: MultiViewportScanner,
    testId: number,
    // ... other params
  ): Promise<void> {
    // Domain scanning logic here
  }
  ```

---

### 9. **TypeScript Typing**

**Observation:**
- ✅ New fields added to `ScanOptions` interface
- ⚠️ `fingerprints` is typed as `any[]` (line 100) - should have a proper type

**Recommendation:**
```typescript
interface PageFingerprint {
  url: string;
  title?: string;
  // ... other properties
}

const fingerprints: PageFingerprint[] = [];
```

---

### 10. **Testing Considerations**

**Missing:**
- No unit tests visible for `replaceDomainInUrl()`
- No integration tests for multi-domain scanning

**Recommendations:**
Add test cases for:
1. `replaceDomainInUrl()` with various URL formats
2. Duplicate URL detection with URL normalization
3. Multi-domain progress tracking accuracy
4. Database schema compatibility

---

## Security Considerations

### 1. **URL Injection Risk**

The `replaceDomainInUrl()` function constructs URLs from user input. While using the `URL` API provides some protection, consider:

- ✅ Good: Uses `new URL()` which validates URL format
- ⚠️ Risk: If `domainsToTest` comes from user input, malicious domains could be injected
- ✅ Mitigation: Database configuration should validate domain patterns

**Recommendation:**
```typescript
// Validate domains before use
function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-z0-9-]+$/i; // Only alphanumeric and hyphens
  return domainRegex.test(domain);
}

if (domainsToTest) {
  const invalidDomains = domainsToTest.filter(d => !isValidDomain(d));
  if (invalidDomains.length > 0) {
    throw new Error(`Invalid domain prefixes: ${invalidDomains.join(', ')}`);
  }
}
```

---

## Summary of Recommendations

### Priority: High
1. ✅ Add error handling to `replaceDomainInUrl()` function
2. ✅ Implement URL normalization for duplicate detection
3. ✅ Add domain validation to prevent injection

### Priority: Medium
4. 📝 Make timeout configurable instead of hardcoded
5. 📝 Extract domain scanning logic into separate function
6. 📝 Fix `totalPages` variable naming for clarity
7. 📝 Add proper TypeScript types instead of `any[]`

### Priority: Low
8. 📝 Consider parallel domain scanning with rate limiting
9. 📝 Add unit tests for new functionality
10. 📝 Document multi-domain scanning in user-facing docs

---

## Overall Assessment

**Grade:** B+ (Good with minor improvements needed)

**Strengths:**
- Well-integrated feature that extends existing functionality smoothly
- Good logging and progress tracking
- Prevents duplicate URL scanning
- Maintains backward compatibility

**Areas for Improvement:**
- Error handling robustness (especially in URL manipulation)
- URL normalization for better duplicate detection
- Input validation for security
- Code organization (extract complex logic into functions)

**Verdict:** ✅ **Approve with minor changes**

The multi-domain scanning feature is a valuable addition that solves a real use case. The implementation is solid but would benefit from the error handling and validation improvements outlined above. Consider addressing high-priority items before merging to production.
