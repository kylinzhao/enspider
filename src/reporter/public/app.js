// State
let currentTest = null;
let currentPages = [];
let progressEventSource = null;
let progressStartTime = null;
let currentScheduledTask = null; // For editing

// DOM Elements
const progressModal = document.getElementById('progressModal');

// DOM Elements
const scanModal = document.getElementById('scanModal');
const scheduledTaskModal = document.getElementById('scheduledTaskModal');
const startScanBtn = document.getElementById('startScanBtn');
const confirmScanBtn = document.getElementById('confirmScanBtn');
const refreshBtn = document.getElementById('refreshBtn');
const testList = document.getElementById('testList');
const testDetails = document.getElementById('testDetails');
const scheduledTasksPage = document.getElementById('scheduledTasksPage');
const backBtn = document.getElementById('backBtn');
const pageTypeFilter = document.getElementById('pageTypeFilter');
const issueFilter = document.getElementById('issueFilter');
const pageResults = document.getElementById('pageResults');
const lightbox = document.getElementById('lightbox');
const lightboxClose = document.querySelector('.lightbox-close');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initRouter();  // Initialize router first
  loadTests();
});

function setupEventListeners() {
  startScanBtn.addEventListener('click', openScanModal);
  confirmScanBtn.addEventListener('click', startScan);
  refreshBtn.addEventListener('click', loadTests);
  backBtn.addEventListener('click', () => {
    navigateTo('/');  // Use router navigation
  });
  pageTypeFilter.addEventListener('change', filterPages);
  issueFilter.addEventListener('change', filterPages);
  deleteAllBtn.addEventListener('click', deleteAllTests);
  deleteTestBtn.addEventListener('click', deleteCurrentTest);

  // Navigation links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = e.target.getAttribute('data-page');
      if (page === 'tests') {
        navigateTo('/');
      } else if (page === 'scheduled') {
        navigateTo('/scheduled');
      }
    });
  });

  // Scheduled tasks
  document.getElementById('addScheduledTaskBtn').addEventListener('click', openAddScheduledTaskModal);
  document.getElementById('scheduledTaskForm').addEventListener('submit', saveScheduledTask);
  document.getElementById('taskCronPreset').addEventListener('change', (e) => {
    if (e.target.value) {
      document.getElementById('taskCron').value = e.target.value;
    }
  });

  // Modal close buttons
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal === scanModal) closeScanModal();
      if (modal === scheduledTaskModal) closeScheduledTaskModal();
    });
  });

  // Select all domains functionality
  document.getElementById('selectAllDomains').addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.domain-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = e.target.checked;
    });
  });

  // Modal close on outside click
  scanModal.addEventListener('click', (e) => {
    if (e.target === scanModal) closeScanModal();
  });
  scheduledTaskModal.addEventListener('click', (e) => {
    if (e.target === scheduledTaskModal) closeScheduledTaskModal();
  });

  // Lightbox
  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
}

// Load tests
async function loadTests() {
  try {
    testList.innerHTML = '<div class="loading">Loading...</div>';

    const response = await fetch('/api/tests');
    const tests = await response.json();

    if (tests.length === 0) {
      testList.innerHTML = '<p class="loading">No tests found. Start a new scan to begin.</p>';
      return;
    }

    // Group tests by date
    const groupedTests = groupTestsByDate(tests);

    // Render grouped tests
    let html = '';
    for (const [date, dateTests] of Object.entries(groupedTests)) {
      html += `
        <div class="date-group">
          <h3 class="date-header">${date}</h3>
          <div class="date-group-tests">
            ${dateTests.map(test => renderTestCard(test)).join('')}
          </div>
        </div>
      `;
    }

    testList.innerHTML = html;
  } catch (error) {
    testList.innerHTML = `<div class="loading">Error loading tests: ${error.message}</div>`;
  }
}

// Group tests by date
function groupTestsByDate(tests) {
  const groups = {};

  tests.forEach(test => {
    const date = new Date(test.timestamp);
    let dateKey;

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check if today
    if (date.toDateString() === today.toDateString()) {
      dateKey = 'Today';
    }
    // Check if yesterday
    else if (date.toDateString() === yesterday.toDateString()) {
      dateKey = 'Yesterday';
    }
    // Check if within last 7 days
    else if (date > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
      const daysAgo = Math.floor((today - date) / (24 * 60 * 60 * 1000));
      dateKey = `${daysAgo} days ago`;
    }
    // Otherwise use date string
    else {
      dateKey = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(test);
  });

  return groups;
}

// Render a single test card (list item style)
function renderTestCard(test) {
  const date = new Date(test.timestamp);
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return `
    <div class="test-list-item ${test.status === 'running' ? 'test-item-running' : ''}" onclick="viewTest(${test.id})">
      <div class="test-item-main">
        <div class="test-item-domain">${test.domain}</div>
        <div class="test-item-status ${test.status}">${test.status}</div>
      </div>
      <div class="test-item-stats">
        <div class="test-item-stat">
          <span class="stat-icon">📄</span>
          <span class="stat-value">${test.total_pages}</span>
          <span class="stat-label">pages</span>
        </div>
        <div class="test-item-stat ${test.total_issues > 0 ? 'has-error' : ''}">
          <span class="stat-icon">${test.total_issues > 0 ? '⚠️' : '✓'}</span>
          <span class="stat-value">${test.total_issues}</span>
          <span class="stat-label">issues</span>
        </div>
        <div class="test-item-stat">
          <span class="stat-icon">⏱️</span>
          <span class="stat-value">${formatDuration(test.duration_ms)}</span>
        </div>
      </div>
      <div class="test-item-time">
        ${timeStr}
      </div>
      <div class="test-item-actions">
        ${test.status === 'running' ? `
          <button class="btn-icon btn-progress-icon" onclick="event.stopPropagation(); viewProgress(${test.id})" title="View Progress">
            📊
          </button>
        ` : `
          <button class="btn-icon btn-delete-icon" onclick="event.stopPropagation(); deleteTest(${test.id})" title="Delete">
            🗑️
          </button>
        `}
      </div>
    </div>
  `;
}

// View progress for a running test
function viewProgress(testId) {
  // Show progress modal
  document.getElementById('progressDomain').textContent = `Scanning...`;
  document.getElementById('progressLogs').innerHTML = '<div class="log-entry">Connecting to server...</div>';
  progressModal.classList.add('active');
  // Don't reset progressStartTime - we'll use server's elapsedTime

  // Connect to SSE
  connectProgress(testId);
}

// View test details
async function viewTest(testId, updateUrl = true) {
  try {
    // Load test
    const testResponse = await fetch(`/api/tests/${testId}`);
    currentTest = await testResponse.json();

    // Load pages
    const pagesResponse = await fetch(`/api/tests/${testId}/pages`);
    currentPages = await pagesResponse.json();

    // Update summary
    document.getElementById('totalPages').textContent = currentTest.total_pages;
    document.getElementById('totalIssues').textContent = currentTest.total_issues;
    document.getElementById('categories').textContent = currentTest.categories;
    document.getElementById('duration').textContent = formatDuration(currentTest.duration_ms);

    // Show details
    document.querySelector('.test-history').style.display = 'none';
    testDetails.style.display = 'block';

    // Render pages
    renderPages(currentPages);

    // Update URL if needed
    if (updateUrl) {
      navigateTo(`/test/${testId}`, { testId });
    }
  } catch (error) {
    alert('Error loading test details: ' + error.message);
  }
}

// Render pages
function renderPages(pages) {
  const pageTypeFilterValue = pageTypeFilter.value;
  const issueFilterValue = issueFilter.value;

  let filtered = pages;

  // Filter by page type
  if (pageTypeFilterValue !== 'all') {
    filtered = filtered.filter(p => p.page_type === pageTypeFilterValue);
  }

  // Filter by issues
  if (issueFilterValue === 'has-issues') {
    filtered = filtered.filter(p => {
      const rawScreenshotIssues = page.screenshot_issues || {};
      const qualityProblems = Object.entries(rawScreenshotIssues).reduce((acc, [viewport, issue]) => {
        if (!issue) return acc;
        const isProblem = issue.severity === 'error' || issue.severity === 'warning' ||
                         (typeof issue.whitePercentage === 'number' && issue.whitePercentage >= 80);
        if (isProblem) {
          acc[viewport] = issue;
        }
        return acc;
      }, {});
      const hasScreenshotIssues = Object.keys(qualityProblems).length > 0;
      return hasScreenshotIssues || (page.issues_count > 0);
    });
  }

  pageResults.innerHTML = filtered.map(page => {
    const rawScreenshotIssues = page.screenshot_issues || {};
    
    // Filter for actual quality problems (severity != 'info')
    const qualityProblems = Object.entries(rawScreenshotIssues).reduce((acc, [viewport, issue]) => {
      if (!issue) return acc;
      // Check if it's a real issue (not info/normal)
      const isProblem = issue.severity === 'error' || issue.severity === 'warning' || 
                       (typeof issue.whitePercentage === 'number' && issue.whitePercentage >= 80);
      if (isProblem) {
        acc[viewport] = issue;
      }
      return acc;
    }, {});

    const hasScreenshotIssues = Object.keys(qualityProblems).length > 0;
    const hasErrorScreenshotIssues = hasScreenshotIssues;

    // Validation check summary
    const checkSummary = {
      totalIssues: page.issues_count || 0,
      screenshotIssues: hasScreenshotIssues ? Object.keys(qualityProblems).length : 0,
      hasErrors: hasErrorScreenshotIssues || (page.issues_count > 0)
    };

    // Group content issues by viewport
    const contentIssuesMap = (page.issues || []).reduce((acc, issue) => {
      if (issue.viewport) {
        acc[issue.viewport] = true;
      }
      return acc;
    }, {});

    // Format load time and HTTP status
    const loadTime = page.load_time ? `${page.load_time}ms` : 'N/A';
    const httpStatus = page.http_status || 'N/A';
    const httpStatusColor = httpStatus >= 200 && httpStatus < 300 ? '#48bb78' : httpStatus >= 400 ? '#e53e3e' : '#f6ad55';

    return `
    <div class="page-card ${checkSummary.hasErrors ? 'page-card-error' : ''}">
      <div class="page-card-header">
        <div class="page-url">
          ${page.url}
          ${checkSummary.hasErrors ? '<span style="color: #e53e3e; margin-left: 0.5rem;">⚠️ Has Issues</span>' : ''}
        </div>
        <span class="page-badge ${page.page_type}">${page.page_type}</span>
      </div>

      <!-- Performance Stats -->
      <div class="performance-stats">
        <div class="perf-stat">
          <span class="perf-icon">⚡</span>
          <span class="perf-label">Load Time:</span>
          <span class="perf-value">${loadTime}</span>
        </div>
        <div class="perf-stat">
          <span class="perf-icon">🌐</span>
          <span class="perf-label">HTTP Status:</span>
          <span class="perf-value" style="color: ${httpStatusColor}">${httpStatus}</span>
        </div>
      </div>

      <!-- Validation Check Summary -->
      <div class="validation-summary">
        <div class="validation-item ${checkSummary.totalIssues > 0 ? 'has-errors' : 'passed'}">
          <span class="validation-icon">${checkSummary.totalIssues > 0 ? '✗' : '✓'}</span>
          <span class="validation-label">Content Checks</span>
          <span class="validation-count">${checkSummary.totalIssues} issues</span>
        </div>
        <div class="validation-item ${checkSummary.screenshotIssues > 0 ? 'has-errors' : 'passed'}">
          <span class="validation-icon">${checkSummary.screenshotIssues > 0 ? '✗' : '✓'}</span>
          <span class="validation-label">Screenshot Quality</span>
          <span class="validation-count">${checkSummary.screenshotIssues} issues</span>
        </div>
      </div>

      ${hasScreenshotIssues ? `
        <div class="issues-section" style="background: #fff5f5; border-top: 2px solid #fc8181;">
          <h4 style="color: #c53030;">⚠️ Screenshot Quality Issues</h4>
          <div class="issues-list">
            ${Object.entries(qualityProblems).map(([viewport, issue]) => `
              <li class="${issue.severity}">
                <strong>${viewport}:</strong> ${issue.message}
                ${issue.whitePercentage !== undefined ? `<br><small style="color: #718096;">White pixels: ${issue.whitePercentage.toFixed(1)}%</small>` : ''}
              </li>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="viewport-grid">
        ${renderViewport('PC Normal', page.screenshots.pc_normal, 'success', false, rawScreenshotIssues.pc_normal, page.request_ids?.pc_normal, contentIssuesMap.pc_normal)}
        ${renderViewport('Mobile Normal', page.screenshots.mobile_normal, 'success', false, rawScreenshotIssues.mobile_normal, page.request_ids?.mobile_normal, contentIssuesMap.mobile_normal)}
        ${renderViewport('PC Spider', page.screenshots.pc_spider, 'success', true, rawScreenshotIssues.pc_spider, page.request_ids?.pc_spider, contentIssuesMap.pc_spider)}
        ${renderViewport('Mobile Spider', page.screenshots.mobile_spider, 'success', true, rawScreenshotIssues.mobile_spider, page.request_ids?.mobile_spider, contentIssuesMap.mobile_spider)}
      </div>

      ${page.issues_count > 0 ? `
        <div class="issues-section">
          <h4>🔍 Content Validation Issues (${page.issues_count})</h4>
          <div class="issues-list" id="issues-${page.id}">
            <div class="loading">Loading issues...</div>
          </div>
        </div>
      ` : `
        <div class="issues-section" style="background: #f0fff4; border-top: 2px solid #48bb78;">
          <h4 style="color: #2f855a;">✓ All Content Checks Passed</h4>
          <p style="font-size: 0.875rem; color: #718096;">No horizontal scroll, broken images, JavaScript errors, or timeout issues detected.</p>
        </div>
      `}

      ${page.request_ids ? `
        <div class="issues-section" style="background: #fffaf0; border-top: 2px solid #ed8936; display: none;">
          <h4 style="color: #c05621;">📋 Request IDs</h4>
          <div style="font-size: 0.875rem; color: #718096;">
            ${Object.entries(page.request_ids).map(([viewport, requestId]) => `
              <div style="margin-bottom: 0.25rem;">
                <strong>${viewport}:</strong> <code style="background: #edf2f7; padding: 2px 6px; border-radius: 3px;">${requestId}</code>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
  }).join('');

  // Load issues for each page
  filtered.forEach(page => {
    if (page.issues_count > 0) {
      loadIssues(page.id);
    }
  });

  // Setup click handlers for screenshots
  setupScreenshotClickHandlers();
}

function renderViewport(title, screenshot, status, isSpider, screenshotIssue, requestId, hasContentIssue) {
  const hasIssue = !!(screenshotIssue && (
    (typeof screenshotIssue.whitePercentage === 'number' && screenshotIssue.whitePercentage >= 80) ||
    (screenshotIssue.severity === 'error' || screenshotIssue.severity === 'warning')
  )) || hasContentIssue;
  const hasRequestId = requestId && requestId.length > 0;
  const isMobile = title.toLowerCase().includes('mobile');
  const hasWhitePercentage = screenshotIssue && typeof screenshotIssue.whitePercentage === 'number';

  const whiteCoverage = hasWhitePercentage
    ? screenshotIssue.whitePercentage.toFixed(1)
    : null;

  const whiteBadge = hasWhitePercentage ? `
        <span class="white-coverage-badge ${screenshotIssue.whitePercentage >= 80 ? 'high' : 'normal'}">
          ${whiteCoverage}% white
        </span>` : '';

  const copyButton = hasRequestId ? `
        <button class="copy-request-id-btn" data-request-id="${requestId}" data-viewport="${title}"
                onclick="copyRequestId('${requestId}', '${title}')">
          📋 Copy Request ID
        </button>` : '';

  const screenshotContent = screenshot
    ? `<div class="viewport-screenshot-inner">
            <img src="/${screenshot}" alt="${title}" class="viewport-screenshot${isMobile ? ' viewport-screenshot-mobile' : ''}" data-fullpath="/${screenshot}">
          </div>`
    : `<div class="viewport-screenshot-inner">
            <p style="color: white;">No screenshot</p>
          </div>`;

  return `
    <div class="viewport-item ${hasIssue ? 'viewport-item-error' : ''}" data-viewport="${title}">
      <div class="viewport-header">
        <span>${title}</span>
        ${isSpider ? '<span class="viewport-spider">🕷️ Spider</span>' : ''}
        ${hasIssue ? '<span style="color: #e53e3e; font-size: 0.75rem;">⚠️ Issue</span>' : ''}
      </div>
      <div class="viewport-screenshot-container ${hasIssue ? 'screenshot-issue' : ''} ${isMobile ? 'mobile-viewport' : ''}">
        ${screenshotContent}
        ${whiteBadge}
        ${copyButton}
        <span class="viewport-status ${status}">${hasIssue ? '⚠️ Issue' : 'OK'}</span>
      </div>
    </div>
  `;
}

// Copy Request ID to clipboard
function copyRequestId(requestId, viewport) {
  navigator.clipboard.writeText(requestId).then(() => {
    // Show temporary success message
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    btn.style.background = 'rgba(72, 187, 120, 0.9)';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.background = 'rgba(0,0,0,0.7)';
    }, 1500);
  }).catch(err => {
    console.error('Failed to copy:', err);
    alert('Failed to copy Request ID');
  });
}

// Load issues for a page
async function loadIssues(pageId) {
  try {
    const response = await fetch(`/api/pages/${pageId}/issues`);
    const issues = await response.json();

    const container = document.getElementById(`issues-${pageId}`);
    const filteredIssues = issues.filter(issue => issue.type !== 'request_id');
    container.innerHTML = filteredIssues.map(issue => `
      <li class="${issue.severity}">
        <strong>${issue.type}:</strong> ${issue.message}
        <br><small style="color: #718096;">Viewport: ${issue.viewport}</small>
      </li>
    `).join('');
  } catch (error) {
    console.error('Error loading issues:', error);
  }
}

// Filter pages
function filterPages() {
  if (currentPages.length > 0) {
    renderPages(currentPages);
  }
}

// Setup screenshot click handlers
function setupScreenshotClickHandlers() {
  document.querySelectorAll('.viewport-screenshot').forEach(img => {
    img.addEventListener('click', function() {
      const fullPath = this.getAttribute('data-fullpath');
      openLightbox(fullPath);
    });
  });
}

// Lightbox functions
function openLightbox(src) {
  const lightboxImg = lightbox.querySelector('.lightbox-content');
  const lightboxInfo = lightbox.querySelector('.lightbox-info');

  lightboxImg.src = src;
  lightboxInfo.textContent = src.split('/').pop();
  lightbox.classList.add('active');
}

function closeLightbox() {
  lightbox.classList.remove('active');
}

// Scan modal
function openScanModal() {
  scanModal.classList.add('active');
}

function closeScanModal() {
  scanModal.classList.remove('active');
}

async function startScan() {
  // Get selected domains
  const checkboxes = document.querySelectorAll('.domain-checkbox:checked');
  const domains = Array.from(checkboxes).map(cb => cb.value);

  if (domains.length === 0) {
    alert('Please select at least one domain');
    return;
  }

  try {
    closeScanModal();

    // Start scans for all selected domains
    const responses = await Promise.all(
      domains.map(domain =>
        fetch('/api/scan/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain })
        })
      )
    );

    const allSuccessful = responses.every(r => r.ok);

    if (allSuccessful) {
      // Show progress for the first domain
      showProgressModal(domains[0]);

      // Wait a bit for tests to be created
      setTimeout(() => {
        loadTests();

        // Connect to progress for each domain
        domains.forEach((domain, index) => {
          setTimeout(() => {
            fetch('/api/tests?limit=10')
              .then(r => r.json())
              .then(tests => {
                const test = tests.find(t => t.domain === domain && t.status === 'running');
            if (test && index === 0) {
              connectProgress(test.id);
            }
              });
          }, 500 + index * 200);
        });
      }, 500);
    } else {
      alert('Failed to start some scans');
    }
  } catch (error) {
    alert('Error starting scan: ' + error.message);
  }
}

// Navigation
function showTestList() {
  testDetails.style.display = 'none';
  document.querySelector('.test-history').style.display = 'block';
  currentTest = null;
  currentPages = [];
  // Update URL to root
  if (window.location.pathname !== '/') {
    window.history.pushState({}, '', '/');
  }
}

// Delete functions
async function deleteTest(testId) {
  if (!confirm('Are you sure you want to delete this test? This will delete all associated data and screenshots.')) {
    return;
  }

  try {
    const response = await fetch(`/api/tests/${testId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to delete test: ' + (error.error || 'Unknown error'));
      return;
    }

    // Refresh the list
    loadTests();
  } catch (error) {
    alert('Error deleting test: ' + error.message);
  }
}

async function deleteCurrentTest() {
  if (!currentTest) {
    return;
  }

  if (!confirm(`Are you sure you want to delete test for ${currentTest.domain}? This will delete all associated data and screenshots.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/tests/${currentTest.id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to delete test: ' + (error.error || 'Unknown error'));
      return;
    }

    // Go back to list
    showTestList();
    loadTests();
  } catch (error) {
    alert('Error deleting test: ' + error.message);
  }
}

async function deleteAllTests() {
  if (!confirm('Are you sure you want to delete ALL tests? This will delete all data and screenshots. This action cannot be undone!')) {
    return;
  }

  // Double confirmation
  if (!confirm('This will permanently delete all tests. Are you REALLY sure?')) {
    return;
  }

  try {
    const response = await fetch('/api/tests', {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to delete all tests: ' + (error.error || 'Unknown error'));
      return;
    }

    // Refresh the list
    loadTests();
    alert('All tests deleted successfully!');
  } catch (error) {
    alert('Error deleting all tests: ' + error.message);
  }
}

// Router functions
function initRouter() {
  // Handle browser back/forward buttons
  window.addEventListener('popstate', (event) => {
    const path = window.location.pathname;

    if (path.startsWith('/test/')) {
      if (event.state && event.state.testId) {
        restoreTestView(event.state.testId);
      }
    } else if (path === '/scheduled') {
      showScheduledTasksPage();
    } else {
      showTestList();
    }
  });

  // Check current URL on page load
  const path = window.location.pathname;
  if (path.startsWith('/test/')) {
    const testId = parseInt(path.split('/')[2]);
    if (!isNaN(testId)) {
      restoreTestView(testId);
    }
  } else if (path === '/scheduled') {
    showScheduledTasksPage();
  }
}

function navigateTo(path, state = null) {
  if (path === '/') {
    window.history.pushState({}, '', '/');
    showTestList();
  } else if (path.startsWith('/test/')) {
    const testId = parseInt(path.split('/')[2]);
    window.history.pushState({ testId }, '', path);
  } else if (path === '/scheduled') {
    window.history.pushState({}, '', '/scheduled');
    showScheduledTasksPage();
  }
}

function restoreTestView(testId) {
  viewTest(testId, false);  // false = don't update URL again
}

// Utility functions
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Progress Modal Functions
function showProgressModal(domain) {
  document.getElementById('progressDomain').textContent = `Scanning: ${domain}`;
  progressModal.classList.add('active');
  progressStartTime = Date.now();
  updateProgressTime();
}

function closeProgressModal() {
  progressModal.classList.remove('active');
  if (progressEventSource) {
    progressEventSource.close();
    progressEventSource = null;
  }
}

function updateProgressTime() {
  if (progressStartTime && progressModal.classList.contains('active')) {
    const elapsed = Math.floor((Date.now() - progressStartTime) / 1000);
    document.getElementById('progressTime').textContent = formatDuration(elapsed * 1000);
    setTimeout(updateProgressTime, 1000);
  }
}

function connectProgress(testId) {
  // Close existing connection
  if (progressEventSource) {
    progressEventSource.close();
  }

  let hasReceivedData = false;

  // Create SSE connection
  progressEventSource = new EventSource(`/api/scan/progress/${testId}`);

  progressEventSource.onmessage = (event) => {
    hasReceivedData = true;
    const progress = JSON.parse(event.data);
    updateProgressUI(progress);
  };

  progressEventSource.onerror = (error) => {
    console.error('SSE error:', error);

    // If we never received any data, the scan might be completed or not exist
    if (!hasReceivedData) {
      const logsContainer = document.getElementById('progressLogs');
      if (logsContainer) {
        logsContainer.innerHTML = `
          <div class="log-entry" style="color: #fc8181;">⚠️ Unable to connect to scan progress</div>
          <div class="log-entry">The scan may have completed or the test ID is invalid</div>
          <div class="log-entry">Test ID: ${testId}</div>
          <div class="log-entry">Please refresh the page and check the test status</div>
        `;
      }
    }

    // Connection closed - scan likely finished
    progressEventSource.close();
    progressEventSource = null;
  };

  // Check if we receive data within 3 seconds
  setTimeout(() => {
    if (!hasReceivedData && progressEventSource) {
      const logsContainer = document.getElementById('progressLogs');
      if (logsContainer && logsContainer.innerHTML.includes('Connecting to server')) {
        logsContainer.innerHTML = `
          <div class="log-entry" style="color: #f6ad55;">⏳ No progress data received</div>
          <div class="log-entry">The scan may not be running</div>
          <div class="log-entry">Test ID: ${testId}</div>
        `;
      }
    }
  }, 3000);
}

function updateProgressUI(progress) {
  // Update domain
  if (progress.domain) {
    document.getElementById('progressDomain').textContent = `Scanning: ${progress.domain}`;
  }

  // Update progress bar
  const percent = progress.currentPercent || 0;
  document.getElementById('progressBarFill').style.width = `${percent}%`;
  document.getElementById('progressPercent').textContent = `${percent}%`;

  // Update step message
  document.getElementById('progressStep').textContent = progress.stepMessage || '';

  // Update current page
  const currentPage = progress.currentPage || '';
  const totalPages = progress.totalPages || 0;
  const completedPages = progress.completedPages || 0;

  if (currentPage) {
    document.getElementById('progressCurrentPage').textContent =
      `Testing: ${currentPage} (${completedPages}/${totalPages})`;
  }

  // Update stats
  document.getElementById('progressPages').textContent =
    `${completedPages}/${totalPages}`;
  document.getElementById('progressIssues').textContent =
    progress.issues?.total || 0;

  // Update enhanced info
  if (progress.pageType) {
    const pageInfo = document.getElementById('progressPageInfo');
    if (pageInfo) {
      pageInfo.style.display = 'block';
      pageInfo.innerHTML = `
        <strong>Page Type:</strong> ${progress.pageType?.toUpperCase()}<br>
        <strong>Category:</strong> ${progress.category || 'N/A'}
      `;
    }
  }

  // Update screenshot status
  if (progress.screenshotStatus) {
    const screenshotInfo = document.getElementById('progressScreenshotInfo');
    if (screenshotInfo) {
      const ss = progress.screenshotStatus;
      screenshotInfo.innerHTML = `
        <span class="screenshot-badge ${ss.pcNormal ? 'success' : 'error'}">PC: ${ss.pcNormal ? '✓' : '✗'}</span>
        <span class="screenshot-badge ${ss.mobileNormal ? 'success' : 'error'}">Mobile: ${ss.mobileNormal ? '✓' : '✗'}</span>
        <span class="screenshot-badge ${ss.pcSpider ? 'success' : 'error'}">PC Spider: ${ss.pcSpider ? '✓' : '✗'}</span>
        <span class="screenshot-badge ${ss.mobileSpider ? 'success' : 'error'}">Mobile Spider: ${ss.mobileSpider ? '✓' : '✗'}</span>
      `;
    }
  }

  // Update logs
  if (progress.logs && progress.logs.length > 0) {
    const logsContainer = document.getElementById('progressLogs');
    if (logsContainer) {
      logsContainer.innerHTML = progress.logs.map(log =>
        `<div class="log-entry">${log}</div>`
      ).join('');
      // Auto-scroll to bottom
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  }

  // Update elapsed time - use server's elapsedTime
  if (progress.elapsedTime !== undefined) {
    document.getElementById('progressTime').textContent = formatDuration(progress.elapsedTime);
  }

  // Close modal if scan is complete
  if (progress.status === 'completed' || progress.status === 'failed') {
    setTimeout(() => {
      closeProgressModal();
      loadTests(); // Refresh to show completed test
    }, 2000);
  }
}

// Auto-refresh for running tests
setInterval(() => {
  const runningTests = document.querySelectorAll('.test-status.running');
  if (runningTests.length > 0) {
    loadTests();
  }
}, 10000); // Refresh every 10 seconds

// ===== Scheduled Tasks Functions =====

// Show scheduled tasks page
function showScheduledTasksPage() {
  document.querySelector('.test-history').style.display = 'none';
  testDetails.style.display = 'none';
  scheduledTasksPage.style.display = 'block';
  loadScheduledTasks();
}

// Load scheduled tasks
async function loadScheduledTasks() {
  try {
    const response = await fetch('/api/scheduled-tasks');
    const tasks = await response.json();

    const container = document.getElementById('scheduledTasksList');

    if (tasks.length === 0) {
      container.innerHTML = '<p class="loading">No scheduled tasks configured. Click "Add Task" to create one.</p>';
      return;
    }

    container.innerHTML = tasks.map(task => renderScheduledTaskCard(task)).join('');
  } catch (error) {
    console.error('Error loading scheduled tasks:', error);
    document.getElementById('scheduledTasksList').innerHTML = `<p class="loading">Error loading tasks: ${error.message}</p>`;
  }
}

// Render a single scheduled task card
function renderScheduledTaskCard(task) {
  const enabledClass = task.enabled ? 'task-enabled' : 'task-disabled';
  const enabledText = task.enabled ? '✓ Enabled' : '✗ Disabled';
  const enabledColor = task.enabled ? '#48bb78' : '#a0aec0';

  const lastRun = task.last_run ? new Date(task.last_run).toLocaleString() : 'Never';
  const created = new Date(task.created_at).toLocaleString();

  return `
    <div class="scheduled-task-card ${enabledClass}">
      <div class="scheduled-task-header">
        <div class="scheduled-task-name">${task.name}</div>
        <div class="scheduled-task-status" style="color: ${enabledColor};">${enabledText}</div>
      </div>
      <div class="scheduled-task-body">
        <div class="scheduled-task-info">
          <div><strong>Domain:</strong> ${task.domain}</div>
          <div><strong>Cron:</strong> <code style="background: #edf2f7; padding: 2px 6px; border-radius: 3px;">${task.cron_expression}</code></div>
          <div><strong>Last Run:</strong> ${lastRun}</div>
          <div><strong>Created:</strong> ${created}</div>
        </div>
        <div class="scheduled-task-actions">
          <button class="btn btn-sm btn-primary" onclick="runScheduledTask(${task.id})">▶ Run Now</button>
          <button class="btn btn-sm btn-secondary" onclick="editScheduledTask(${task.id})">✎ Edit</button>
          <button class="btn btn-sm ${task.enabled ? 'btn-warning' : 'btn-success'}" onclick="toggleScheduledTask(${task.id}, ${task.enabled})">
            ${task.enabled ? '⏸ Disable' : '▶ Enable'}
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteScheduledTask(${task.id})">🗑 Delete</button>
        </div>
      </div>
    </div>
  `;
}

// Open add scheduled task modal
function openAddScheduledTaskModal() {
  currentScheduledTask = null;
  document.getElementById('scheduledTaskModalTitle').textContent = 'Add Scheduled Task';
  document.getElementById('scheduledTaskForm').reset();
  document.getElementById('taskEnabled').checked = true;
  scheduledTaskModal.classList.add('active');
}

// Open edit scheduled task modal
async function editScheduledTask(taskId) {
  try {
    const response = await fetch(`/api/scheduled-tasks/${taskId}`);
    const task = await response.json();

    currentScheduledTask = task;
    document.getElementById('scheduledTaskModalTitle').textContent = 'Edit Scheduled Task';
    document.getElementById('taskName').value = task.name;
    document.getElementById('taskDomain').value = task.domain;
    document.getElementById('taskCron').value = task.cron_expression;
    document.getElementById('taskEnabled').checked = task.enabled === 1;

    scheduledTaskModal.classList.add('active');
  } catch (error) {
    alert('Error loading task: ' + error.message);
  }
}

// Close scheduled task modal
function closeScheduledTaskModal() {
  scheduledTaskModal.classList.remove('active');
  currentScheduledTask = null;
  document.getElementById('scheduledTaskForm').reset();
}

// Save scheduled task (create or update)
async function saveScheduledTask(e) {
  e.preventDefault();

  const name = document.getElementById('taskName').value;
  const domain = document.getElementById('taskDomain').value;
  const cronExpression = document.getElementById('taskCron').value;
  const enabled = document.getElementById('taskEnabled').checked;

  try {
    let response;
    if (currentScheduledTask) {
      // Update existing task
      response = await fetch(`/api/scheduled-tasks/${currentScheduledTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          domain,
          cron_expression: cronExpression,
          enabled
        })
      });
    } else {
      // Create new task
      response = await fetch('/api/scheduled-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          domain,
          cron_expression: cronExpression
        })
      });
    }

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to save task: ' + (error.error || 'Unknown error'));
      return;
    }

    closeScheduledTaskModal();
    loadScheduledTasks();
  } catch (error) {
    alert('Error saving task: ' + error.message);
  }
}

// Run scheduled task manually
async function runScheduledTask(taskId) {
  try {
    const response = await fetch(`/api/scheduled-tasks/${taskId}/run`, {
      method: 'POST'
    });

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to run task: ' + (error.error || 'Unknown error'));
      return;
    }

    alert('Scan started! Check the Tests page for progress.');
  } catch (error) {
    alert('Error running task: ' + error.message);
  }
}

// Toggle scheduled task enabled/disabled
async function toggleScheduledTask(taskId, currentEnabled) {
  try {
    const response = await fetch(`/api/scheduled-tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: !currentEnabled
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to update task: ' + (error.error || 'Unknown error'));
      return;
    }

    loadScheduledTasks();
  } catch (error) {
    alert('Error updating task: ' + error.message);
  }
}

// Delete scheduled task
async function deleteScheduledTask(taskId) {
  if (!confirm('Are you sure you want to delete this scheduled task?')) {
    return;
  }

  try {
    const response = await fetch(`/api/scheduled-tasks/${taskId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to delete task: ' + (error.error || 'Unknown error'));
      return;
    }

    loadScheduledTasks();
  } catch (error) {
    alert('Error deleting task: ' + error.message);
  }
}
