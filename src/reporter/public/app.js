// State
let currentTest = null;
let currentPages = [];
let progressEventSource = null;
let progressStartTime = null;
let currentScheduledTask = null; // For editing

// DOM Elements - will be initialized in DOMContentLoaded
let progressModal, scanModal, configModal, cleanupModal, scheduledTaskModal;
let startScanBtn, configBtn, confirmScanBtn, refreshBtn;
let testList, testDetails, scheduledTasksPage, backBtn;
let pageTypeFilter, issueFilter, pageResults;
let testStatusFilter, testIssueFilter;
let lightbox, lightboxClose;
let editCleanupPolicyBtn, runCleanupBtn, deleteAllBtn, deleteTestBtn;

// Initialize DOM elements
function initializeDOMElements() {
  progressModal = document.getElementById('progressModal');
  scanModal = document.getElementById('scanModal');
  configModal = document.getElementById('configModal');
  cleanupModal = document.getElementById('cleanupModal');
  scheduledTaskModal = document.getElementById('scheduledTaskModal');
  startScanBtn = document.getElementById('startScanBtn');
  configBtn = document.getElementById('configBtn');
  confirmScanBtn = document.getElementById('confirmScanBtn');
  refreshBtn = document.getElementById('refreshBtn');
  testList = document.getElementById('testList');
  testDetails = document.getElementById('testDetails');
  scheduledTasksPage = document.getElementById('scheduledTasksPage');
  backBtn = document.getElementById('backBtn');
  pageTypeFilter = document.getElementById('pageTypeFilter');
  issueFilter = document.getElementById('issueFilter');
  pageResults = document.getElementById('pageResults');
  testStatusFilter = document.getElementById('testStatusFilter');
  testIssueFilter = document.getElementById('testIssueFilter');
  lightbox = document.getElementById('lightbox');
  lightboxClose = document.querySelector('.lightbox-close');
  editCleanupPolicyBtn = document.getElementById('editCleanupPolicyBtn');
  runCleanupBtn = document.getElementById('runCleanupBtn');
  deleteAllBtn = document.getElementById('deleteAllBtn');
  deleteTestBtn = document.getElementById('deleteTestBtn');

  // Verify critical elements exist
  if (!testList || !testStatusFilter || !testIssueFilter) {
    console.error('[ERROR] Critical elements not found:', {
      testList: !!testList,
      testStatusFilter: !!testStatusFilter,
      testIssueFilter: !!testIssueFilter
    });
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('[DEBUG] DOMContentLoaded fired');
  console.log('[DEBUG] Current URL:', window.location.pathname);
  initializeDOMElements();  // Initialize all DOM element references first
  console.log('[DEBUG] DOM elements initialized, testList:', !!testList);
  setupEventListeners();
  initRouter();  // Initialize router first
  console.log('[DEBUG] Calling loadTests()...');
  loadTests();  // Load test data immediately for default page
  initNotifications();  // Initialize notifications
});

// Debug: expose loadTests to window for manual testing
window.loadTestsDebug = loadTests;
window.debug = {
  loadTests: loadTests,
  testList: () => testList,
  allTests: () => allTests
};

function setupEventListeners() {
  startScanBtn.addEventListener('click', openScanModal);
  configBtn.addEventListener('click', openConfigModal);
  confirmScanBtn.addEventListener('click', startScan);
  refreshBtn.addEventListener('click', loadTests);
  backBtn.addEventListener('click', () => {
    navigateToTests();  // Go back to tests list
  });
  pageTypeFilter.addEventListener('change', filterPages);
  issueFilter.addEventListener('change', filterPages);
  testStatusFilter.addEventListener('change', filterTests);
  testIssueFilter.addEventListener('change', filterTests);
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', deleteAllTests);
  }
  if (deleteTestBtn) {
    deleteTestBtn.addEventListener('click', deleteCurrentTest);
  }

  // Navigation links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = e.target.getAttribute('data-page');
      if (page === 'tests') {
        navigateToTests();
      } else if (page === 'scheduled') {
        navigateTo('/scheduled');
      }
    });
  });

  // Scheduled tasks
  document.getElementById('addScheduledTaskBtn').addEventListener('click', openAddScheduledTaskModal);
  document.getElementById('scheduledTaskForm').addEventListener('submit', saveScheduledTask);

  // Config
  document.getElementById('configForm').addEventListener('submit', saveGlobalConfig);

  // Cleanup policy (removed from dashboard, still accessible via config)
  if (editCleanupPolicyBtn) {
    editCleanupPolicyBtn.addEventListener('click', openCleanupModal);
  }
  if (runCleanupBtn) {
    runCleanupBtn.addEventListener('click', runCleanup);
  }

  // Cleanup policy
  document.getElementById('cleanupForm').addEventListener('submit', saveCleanupPolicy);
  document.getElementById('taskCronPreset').addEventListener('change', (e) => {
    if (e.target.value) {
      document.getElementById('taskCron').value = e.target.value;
      updateCronExplanation();
    }
  });

  // Real-time cron explanation
  const taskCronInput = document.getElementById('taskCron');
  taskCronInput.addEventListener('input', updateCronExplanation);

  // Modal close buttons
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal === scanModal) closeScanModal();
      if (modal === scheduledTaskModal) closeScheduledTaskModal();
      if (modal === configModal) closeConfigModal();
      if (modal === cleanupModal) closeCleanupModal();
    });
  });

  // Select all domains functionality
  const selectAllDomainsInput = document.getElementById('selectAllDomains');
  if (selectAllDomainsInput) {
    selectAllDomainsInput.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.domain-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
      });
    });
  }

  // Modal close on outside click
  scanModal.addEventListener('click', (e) => {
    if (e.target === scanModal) closeScanModal();
  });
  scheduledTaskModal.addEventListener('click', (e) => {
    if (e.target === scheduledTaskModal) closeScheduledTaskModal();
  });
  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) closeConfigModal();
  });
  cleanupModal.addEventListener('click', (e) => {
    if (e.target === cleanupModal) closeCleanupModal();
  });

  // Lightbox
  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
}

// Global variable to store all loaded tests
let allTests = [];

// Load tests
async function loadTests() {
  console.log('[DEBUG] loadTests() called');
  console.log('[DEBUG] testList element:', testList);

  try {
    if (!testList) {
      throw new Error('testList element not found');
    }

    testList.innerHTML = '<div class="loading">Loading...</div>';
    console.log('[DEBUG] Fetching /api/tests...');

    const response = await fetch('/api/tests');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const tests = await response.json();
    console.log('[DEBUG] Loaded tests:', tests.length);

    // Store all tests for filtering
    allTests = tests;

    if (tests.length === 0) {
      testList.innerHTML = '<p class="loading">No tests found. Start a new scan to begin.</p>';
      return;
    }

    // Apply filters and render
    filterTests();
    console.log('[DEBUG] Tests rendered successfully');
  } catch (error) {
    console.error('[DEBUG] Error loading tests:', error);
    if (testList) {
      testList.innerHTML = `<div class="loading">Error loading tests: ${error.message}</div>`;
    }
  }
}

// Filter tests
function filterTests() {
  const statusFilterValue = testStatusFilter.value;
  const issueFilterValue = testIssueFilter.value;

  let filtered = allTests;

  // Filter by status
  if (statusFilterValue !== 'all') {
    filtered = filtered.filter(t => t.status === statusFilterValue);
  }

  // Filter by issues
  if (issueFilterValue === 'has-issues') {
    filtered = filtered.filter(t => t.total_issues > 0);
  }

  // Render filtered tests
  if (filtered.length === 0) {
    testList.innerHTML = '<p class="loading">No tests match the current filters.</p>';
    return;
  }

  // Group tests by date
  const groupedTests = groupTestsByDate(filtered);

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
  const startDate = new Date(test.timestamp);
  const startTimeStr = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const startDateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Calculate end time
  let endTimeStr = 'N/A';
  let endTimeDisplay = 'In Progress';
  if (test.status !== 'running' && test.duration_ms) {
    const endDate = new Date(test.timestamp + test.duration_ms);
    endTimeStr = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    endTimeDisplay = endTimeStr;
  }

  return `
    <div class="test-list-item ${test.status === 'running' ? 'test-item-running' : ''}" onclick="viewTest(${test.id})">
      <div class="test-item-main">
        <div class="test-item-domain">
          <span style="color: #667eea; font-weight: 600; font-size: 0.75rem; background: #e6e6ff; padding: 2px 6px; border-radius: 4px; margin-right: 0.5rem;">#${test.id}</span>
          ${test.domain}
          <div class="test-item-source" style="
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 500;
            margin-left: 0.5rem;
            background: ${test.source === 'scheduled' ? '#ebf8ff' : '#f0fff4'};
            color: ${test.source === 'scheduled' ? '#2b6cb0' : '#2f855a'};
            border: 1px solid ${test.source === 'scheduled' ? '#bee3f8' : '#c6f6d5'};
          ">
            ${test.source === 'scheduled' ? '⏰ Scheduled' : '👤 Manual'}
          </div>
        </div>
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
        <div style="font-size: 0.75rem; color: #a0aec0; margin-bottom: 0.125rem;">${startDateStr}</div>
        <div style="font-weight: 500;">${startTimeStr} → ${endTimeDisplay}</div>
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

    // Add source to summary
    const summaryStats = document.querySelector('.summary-stats');
    if (summaryStats) {
      // Check if we already added source
      let sourceStat = document.getElementById('testSource');
      if (!sourceStat) {
        const statDiv = document.createElement('div');
        statDiv.className = 'stat';
        statDiv.innerHTML = `
          <span class="stat-label">Source:</span>
          <span id="testSource" class="stat-value"></span>
        `;
        summaryStats.appendChild(statDiv);
        sourceStat = statDiv.querySelector('#testSource');
      }
      
      const sourceText = currentTest.source === 'scheduled' ? 'Scheduled' : 'Manual';
      const sourceIcon = currentTest.source === 'scheduled' ? '⏰' : '👤';
      sourceStat.textContent = `${sourceIcon} ${sourceText}`;
      sourceStat.style.color = currentTest.source === 'scheduled' ? '#2b6cb0' : '#2f855a';
    }

    // Hide all other pages and show only details
    document.querySelector('.test-history').style.display = 'none';
    scheduledTasksPage.style.display = 'none';
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
      const rawScreenshotIssues = p.screenshot_issues || {};
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
      return hasScreenshotIssues || (p.issues_count > 0);
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
  // Get selected domain codes (e.g., 'en', 'ru', 'ar', 'fr')
  const checkboxes = document.querySelectorAll('.domain-checkbox:checked');
  const domainCodes = Array.from(checkboxes).map(cb => cb.value);

  if (domainCodes.length === 0) {
    alert('Please select at least one domain');
    return;
  }

  try {
    closeScanModal();

    // Use the first domain as the primary domain for page filtering
    const primaryDomainCode = domainCodes[0];
    const primaryDomain = `${primaryDomainCode}.guazi.com`;

    // Start a single scan with multiple domains
    const response = await fetch('/api/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: primaryDomain,
        domains: domainCodes  // Send domain codes array
      })
    });

    if (response.ok) {
      // Show progress for the scan
      showProgressModal(primaryDomain);

      // Wait for test to be created and connect to progress
      setTimeout(() => {
        loadTests();

        fetch('/api/tests?limit=10')
          .then(r => r.json())
          .then(tests => {
            const test = tests.find(t => t.domain === primaryDomain && t.status === 'running');
            if (test) {
              connectProgress(test.id);
            }
          });
      }, 500);
    } else {
      alert('Failed to start scan');
    }
  } catch (error) {
    alert('Error starting scan: ' + error.message);
  }
}

// Navigation
function showTestList() {
  testDetails.style.display = 'none';
  document.querySelector('.test-history').style.display = 'block';
  scheduledTasksPage.style.display = 'none';
  currentTest = null;
  currentPages = [];
  // Update URL to indicate we're on tests page
  if (window.location.pathname !== '/tests') {
    window.history.pushState({}, '', '/tests');
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
    } else if (path === '/' || path === '/dashboard' || path === '/tests') {
      // Just show the tests section, data is already loaded
      testDetails.style.display = 'none';
      document.querySelector('.test-history').style.display = 'block';
      scheduledTasksPage.style.display = 'none';
    } else {
      navigateToTests();
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
  } else {
    // Default to tests page - just show the section, data will be loaded separately
    testDetails.style.display = 'none';
    document.querySelector('.test-history').style.display = 'block';
    scheduledTasksPage.style.display = 'none';
  }
}

function navigateTo(path, state = null) {
  if (path === '/' || path === '/tests') {
    window.history.pushState({}, '', path === '/' ? '/tests' : path);
    navigateToTests();
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

// Cron explanation and next run time functions
function explainCron(cronExpression) {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { explanation: 'Invalid cron format', nextRun: null };
  }

  const [minute, hour, day, month, weekday] = parts;

  let explanation = [];

  // Explain minute
  if (minute === '*') {
    explanation.push('Every minute');
  } else if (minute.includes('/')) {
    const interval = minute.split('/')[1];
    explanation.push(`Every ${interval} minutes`);
  } else if (minute.includes(',')) {
    explanation.push(`At minutes ${minute.replace(/,/g, ', ')}`);
  } else {
    explanation.push(`At minute ${minute}`);
  }

  // Explain hour
  if (hour === '*') {
    explanation.push('of every hour');
  } else if (hour.includes('/')) {
    const interval = hour.split('/')[1];
    explanation.push(`every ${interval} hours`);
  } else if (hour.includes(',')) {
    explanation.push(`at hours ${hour.replace(/,/g, ', ')}`);
  } else {
    explanation.push(`past hour ${hour}`);
  }

  // Explain day
  if (day !== '*') {
    if (day.includes('/')) {
      const interval = day.split('/')[1];
      explanation.push(`every ${interval} days`);
    } else {
      explanation.push(`on day ${day}`);
    }
  }

  // Explain month
  if (month !== '*') {
    if (month.includes('/')) {
      const interval = month.split('/')[1];
      explanation.push(`every ${interval} months`);
    } else if (month.includes(',')) {
      explanation.push(`in months ${month.replace(/,/g, ', ')}`);
    } else {
      explanation.push(`in month ${month}`);
    }
  }

  // Explain weekday
  if (weekday !== '*') {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (weekday.includes('-')) {
      const [start, end] = weekday.split('-');
      explanation.push(`from ${weekdays[start]} to ${weekdays[end]}`);
    } else if (weekday.includes(',')) {
      const days = weekday.split(',').map(d => weekdays[d]).join(', ');
      explanation.push(`on ${days}`);
    } else {
      explanation.push(`on ${weekdays[weekday]}`);
    }
  }

  return {
    explanation: explanation.join(' '),
    nextRun: calculateNextRun(cronExpression)
  };
}

function calculateNextRun(cronExpression) {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minute, hour, day, month, weekday] = parts;
  const now = new Date();
  const next = new Date(now);

  // Simple implementation: find next matching time
  // This is a basic implementation - for production use a library like cron-parser would be better

  // Set to next minute
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Try to find a match (simplified - checks up to 1 year ahead)
  for (let i = 0; i < 365 * 24 * 60; i++) {
    if (matchesCron(next, minute, hour, day, month, weekday)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  return null;
}

function matchesCron(date, minute, hour, day, month, weekday) {
  const d = date;

  // Check minute
  if (minute !== '*' && !matchesValue(d.getMinutes(), minute)) return false;

  // Check hour
  if (hour !== '*' && !matchesValue(d.getHours(), hour)) return false;

  // Check day
  if (day !== '*' && !matchesValue(d.getDate(), day)) return false;

  // Check month
  if (month !== '*' && !matchesValue(d.getMonth() + 1, month)) return false;

  // Check weekday (0 = Sunday)
  if (weekday !== '*' && !matchesValue(d.getDay(), weekday)) return false;

  return true;
}

function matchesValue(value, pattern) {
  // Handle ranges: 1-5
  if (pattern.includes('-')) {
    const [start, end] = pattern.split('-').map(Number);
    return value >= start && value <= end;
  }

  // Handle lists: 1,3,5
  if (pattern.includes(',')) {
    return pattern.split(',').map(Number).includes(value);
  }

  // Handle step: */5 or 1-10/2
  if (pattern.includes('/')) {
    const [base, step] = pattern.split('/');
    const stepNum = parseInt(step);
    if (base === '*') {
      return value % stepNum === 0;
    }
    const [start, end] = base.split('-').map(Number);
    if (value < start || value > end) return false;
    return (value - start) % stepNum === 0;
  }

  // Simple match
  return value === parseInt(pattern);
}

function formatNextRunDate(date) {
  if (!date) return 'Unknown';

  const now = new Date();
  const diff = date - now;

  if (diff < 60000) { // Less than 1 minute
    return 'In less than a minute';
  } else if (diff < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    return `In ${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else if (diff < 86400000) { // Less than 1 day
    const hours = Math.floor(diff / 3600000);
    return `In ${hours} hour${hours > 1 ? 's' : ''}`;
  } else if (diff < 604800000) { // Less than 1 week
    const days = Math.floor(diff / 86400000);
    return `In ${days} day${days > 1 ? 's' : ''}`;
  } else {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

function updateCronExplanation() {
  const cronInput = document.getElementById('taskCron');
  const cronExplanationDiv = document.getElementById('cronExplanation');
  const cronExplanationText = document.getElementById('cronExplanationText');
  const cronNextRun = document.getElementById('cronNextRun');

  const cronExpression = cronInput.value.trim();

  if (!cronExpression) {
    cronExplanationDiv.style.display = 'none';
    return;
  }

  const cronInfo = explainCron(cronExpression);

  if (cronInfo.explanation === 'Invalid cron format') {
    cronExplanationDiv.style.display = 'none';
    return;
  }

  cronExplanationText.textContent = cronInfo.explanation;
  cronNextRun.textContent = `Next run: ${cronInfo.nextRun ? formatNextRunDate(cronInfo.nextRun) : 'Unknown'}`;
  cronExplanationDiv.style.display = 'block';
}

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

  // Get cron explanation and next run time
  const cronInfo = explainCron(task.cron_expression);
  const cronExplanation = cronInfo.explanation;
  const nextRun = cronInfo.nextRun ? formatNextRunDate(cronInfo.nextRun) : 'Unknown';

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
          <div style="margin-top: 0.5rem; padding: 0.5rem; background: #f7fafc; border-radius: 4px; font-size: 0.875rem;">
            <div style="color: #4a5568; margin-bottom: 0.25rem;">💡 <strong>Schedule:</strong> ${cronExplanation}</div>
            <div style="color: #667eea; font-weight: 500;">⏰ Next run: ${nextRun}</div>
          </div>
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

    // Update cron explanation for existing task
    updateCronExplanation();

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
  // Hide cron explanation
  document.getElementById('cronExplanation').style.display = 'none';
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

// ===== Notifications System =====

let notificationEventSource = null;
const NOTIFICATION_AUTO_DISMISS = 10000; // 10 seconds

function initNotifications() {
  // Connect to notification stream
  connectNotificationStream();

  // Request notification permission if not granted
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function connectNotificationStream() {
  if (notificationEventSource) {
    notificationEventSource.close();
  }

  notificationEventSource = new EventSource('/api/notifications/stream');

  notificationEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'recent') {
        // Display recent notifications
        data.notifications.forEach(notification => {
          showNotification(notification);
        });
      } else if (data.type === 'new') {
        // Display new notification
        showNotification(data.notification);
      }
    } catch (error) {
      console.error('Error parsing notification data:', error);
    }
  };

  notificationEventSource.onerror = (error) => {
    console.error('Notification stream error:', error);
    // Attempt to reconnect after 5 seconds
    setTimeout(() => {
      connectNotificationStream();
    }, 5000);
  };
}

function showNotification(notification) {
  const container = document.getElementById('notificationsContainer');
  if (!container) return;

  // Check if notification already exists
  const existingNotif = document.getElementById(`notif-${notification.id}`);
  if (existingNotif) return;

  // Create notification element
  const notifEl = document.createElement('div');
  notifEl.id = `notif-${notification.id}`;
  notifEl.className = `notification ${notification.type === 'scan_completed' ? 'notification-success' : 'notification-error'}`;

  const icon = notification.type === 'scan_completed' ? '✅' : '❌';
  const time = new Date(notification.timestamp).toLocaleTimeString();

  let dataHTML = '';
  if (notification.data) {
    dataHTML = `
      <div class="notification-data">
        <div class="notification-data-item">
          <div class="notification-data-value">${notification.data.totalPages}</div>
          <div class="notification-data-label">Pages</div>
        </div>
        <div class="notification-data-item">
          <div class="notification-data-value">${notification.data.totalIssues}</div>
          <div class="notification-data-label">Issues</div>
        </div>
        <div class="notification-data-item">
          <div class="notification-data-value">${notification.data.durationFormatted}</div>
          <div class="notification-data-label">Duration</div>
        </div>
      </div>
    `;
  }

  notifEl.innerHTML = `
    <div class="notification-icon">${icon}</div>
    <div class="notification-content">
      <div class="notification-title">${notification.title}</div>
      <div class="notification-message">${notification.message}</div>
      ${dataHTML}
      <div class="notification-time">${time}</div>
    </div>
    <button class="notification-close" onclick="dismissNotification('${notification.id}')">&times;</button>
  `;

  // Add click handler to navigate to test details
  notifEl.addEventListener('click', (e) => {
    if (!e.target.classList.contains('notification-close')) {
      navigateTo(`/test/${notification.testId}`, { testId: notification.testId });
    }
  });

  container.appendChild(notifEl);

  // Auto-dismiss after NOTIFICATION_AUTO_DISMISS milliseconds
  setTimeout(() => {
    dismissNotification(notification.id);
  }, NOTIFICATION_AUTO_DISMISS);

  // Show browser notification if permission granted
  if ('Notification' in window && Notification.permission === 'granted') {
    new BrowserNotification(notification.title, {
      body: notification.message,
      icon: '/favicon.ico',
      tag: notification.id
    });
  }
}

function dismissNotification(notificationId) {
  const notifEl = document.getElementById(`notif-${notificationId}`);
  if (notifEl) {
    notifEl.classList.add('removing');
    setTimeout(() => {
      if (notifEl.parentNode) {
        notifEl.parentNode.removeChild(notifEl);
      }
    }, 300);
  }
}

function clearAllNotifications() {
  const container = document.getElementById('notificationsContainer');
  if (container) {
    container.innerHTML = '';
  }
}

// ===== Global Configuration Functions =====

function openConfigModal() {
  configModal.classList.add('active');
  loadGlobalConfig();
}

function closeConfigModal() {
  configModal.classList.remove('active');
}

async function loadGlobalConfig() {
  try {
    const response = await fetch('/api/config/custom-urls');
    const customUrls = await response.json();

    const configCustomUrlsInput = document.getElementById('configCustomUrls');
    configCustomUrlsInput.value = customUrls.join('\n');
  } catch (error) {
    console.error('Error loading global config:', error);
  }
}

async function saveGlobalConfig(e) {
  e.preventDefault();

  const configCustomUrlsInput = document.getElementById('configCustomUrls');
  const customUrlsText = configCustomUrlsInput.value.trim();
  const customUrls = customUrlsText
    ? customUrlsText.split('\n').map(url => url.trim()).filter(url => url.length > 0)
    : [];

  try {
    const response = await fetch('/api/config/custom-urls', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_urls: customUrls })
    });

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to save configuration: ' + (error.error || 'Unknown error'));
      return;
    }

    closeConfigModal();
    alert('✅ Configuration saved successfully!');
  } catch (error) {
    alert('Error saving configuration: ' + error.message);
  }
}

// ===== Dashboard Functions =====

// Navigate to tests page
function navigateToTests() {
  testDetails.style.display = 'none';
  document.querySelector('.test-history').style.display = 'block';
  scheduledTasksPage.style.display = 'none';
  currentTest = null;
  currentPages = [];

  // Update URL to indicate we're on tests page
  if (window.location.pathname !== '/tests') {
    window.history.pushState({}, '', '/tests');
  }

  // Load tests after showing the section
  loadTests();
}

// Navigate to tests page with issues filter
function navigateToTestsWithIssues() {
  document.querySelector('.test-history').style.display = 'block';
  testDetails.style.display = 'none';
  scheduledTasksPage.style.display = 'none';

  // Load tests first, then set filter
  loadTests().then(() => {
    // Set issue filter after tests are loaded
    setTimeout(() => {
      issueFilter.value = 'has-issues';
      // Trigger filter change event
      issueFilter.dispatchEvent(new Event('change'));
    }, 100);
  });
}

// ===== Cleanup Policy Functions =====

function openCleanupModal() {
  cleanupModal.classList.add('active');
  loadCleanupPolicy();
}

function closeCleanupModal() {
  cleanupModal.classList.remove('active');
}

async function loadCleanupPolicy() {
  try {
    const response = await fetch('/api/config/cleanup-policy');
    const policy = await response.json();

    document.getElementById('cleanupEnabled').checked = policy.enabled;
    document.getElementById('cleanupRetainDaysInput').value = policy.retainDays;
    document.getElementById('cleanupMaxTestsInput').value = policy.maxTests;
    document.getElementById('cleanupArchive').checked = policy.archiveBeforeDelete;
  } catch (error) {
    console.error('Error loading cleanup policy:', error);
  }
}

async function saveCleanupPolicy(e) {
  e.preventDefault();

  const policy = {
    enabled: document.getElementById('cleanupEnabled').checked,
    retainDays: parseInt(document.getElementById('cleanupRetainDaysInput').value),
    maxTests: parseInt(document.getElementById('cleanupMaxTestsInput').value),
    autoCleanup: document.getElementById('cleanupEnabled').checked,
    archiveBeforeDelete: document.getElementById('cleanupArchive').checked,
  };

  try {
    const response = await fetch('/api/config/cleanup-policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(policy)
    });

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to save cleanup policy: ' + (error.error || 'Unknown error'));
      return;
    }

    closeCleanupModal();
    alert('✅ Cleanup policy saved successfully!');
  } catch (error) {
    alert('Error saving cleanup policy: ' + error.message);
  }
}

async function runCleanup() {
  if (!confirm('Are you sure you want to run cleanup now? This will delete old test data.')) {
    return;
  }

  try {
    const response = await fetch('/api/cleanup/run', {
      method: 'POST'
    });

    const result = await response.json();

    alert(`✅ Cleanup completed!\n\nDeleted: ${result.deleted} tests\nArchived: ${result.archived} tests`);

    // Refresh tests list
    loadTests();
  } catch (error) {
    alert('Error running cleanup: ' + error.message);
  }
}
