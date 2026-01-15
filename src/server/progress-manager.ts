import { EventEmitter } from 'events';

export interface ScanProgress {
  testId: number;
  domain: string;
  status: 'running' | 'completed' | 'failed';
  step: number;
  totalSteps: number;
  stepMessage: string;
  currentPage: string;
  currentPercent: number;
  totalPages: number;
  completedPages: number;
  issues: {
    total: number;
    byPage: Array<{ url: string; count: number }>;
  };
  // Enhanced fields
  startTime: number;
  elapsedTime: number;
  currentLog?: string;
  pageType?: string;
  category?: string;
  screenshotStatus?: {
    pcNormal: boolean;
    mobileNormal: boolean;
    pcSpider: boolean;
    mobileSpider: boolean;
  };
  logs: string[];
}

export interface Notification {
  id: string;
  type: 'scan_completed' | 'scan_failed';
  testId: number;
  domain: string;
  title: string;
  message: string;
  timestamp: number;
  data?: {
    totalPages: number;
    totalIssues: number;
    duration: number;
    durationFormatted: string;
  };
}

export class ProgressManager extends EventEmitter {
  private activeScans: Map<number, ScanProgress> = new Map();
  private notifications: Notification[] = [];
  private notificationIdCounter = 0;

  createScan(testId: number, domain: string): void {
    const progress: ScanProgress = {
      testId,
      domain,
      status: 'running',
      step: 0,
      totalSteps: 5,
      stepMessage: 'Initializing...',
      currentPage: '',
      currentPercent: 0,
      totalPages: 0,
      completedPages: 0,
      issues: {
        total: 0,
        byPage: [],
      },
      startTime: Date.now(),
      elapsedTime: 0,
      logs: [],
    };

    this.activeScans.set(testId, progress);
    this.emit('progress', progress);
  }

  updateStep(testId: number, step: number, totalSteps: number, message: string): void {
    const progress = this.activeScans.get(testId);
    if (progress) {
      progress.step = step;
      progress.totalSteps = totalSteps;
      progress.stepMessage = message;
      progress.currentPercent = Math.round((step / totalSteps) * 100);
      progress.elapsedTime = Date.now() - progress.startTime;
      progress.logs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
      // Keep only last 50 logs
      if (progress.logs.length > 50) {
        progress.logs = progress.logs.slice(-50);
      }
      this.emit('progress', progress);
    }
  }

  updatePageScan(
    testId: number,
    currentPage: string,
    currentPercent: number,
    totalPages: number,
    completedPages: number
  ): void {
    const progress = this.activeScans.get(testId);
    if (progress) {
      progress.currentPage = currentPage;
      progress.currentPercent = currentPercent;
      progress.totalPages = totalPages;
      progress.completedPages = completedPages;
      progress.elapsedTime = Date.now() - progress.startTime;
      this.emit('progress', progress);
    }
  }

  updatePageDetails(
    testId: number,
    pageType: string,
    category: string,
    screenshotStatus: {
      pcNormal: boolean;
      mobileNormal: boolean;
      pcSpider: boolean;
      mobileSpider: boolean;
    }
  ): void {
    const progress = this.activeScans.get(testId);
    if (progress) {
      progress.pageType = pageType;
      progress.category = category;
      progress.screenshotStatus = screenshotStatus;
      this.emit('progress', progress);
    }
  }

  addLog(testId: number, log: string): void {
    const progress = this.activeScans.get(testId);
    if (progress) {
      progress.logs.push(`[${new Date().toLocaleTimeString()}] ${log}`);
      // Keep only last 50 logs
      if (progress.logs.length > 50) {
        progress.logs = progress.logs.slice(-50);
      }
      progress.currentLog = log;
      this.emit('progress', progress);
    }
  }

  addIssue(testId: number, url: string, count: number): void {
    const progress = this.activeScans.get(testId);
    if (progress) {
      progress.issues.total += count;
      const existing = progress.issues.byPage.find(p => p.url === url);
      if (existing) {
        existing.count += count;
      } else {
        progress.issues.byPage.push({ url, count });
      }
      this.emit('progress', progress);
    }
  }

  completeScan(testId: number, success: boolean): void {
    const progress = this.activeScans.get(testId);
    if (progress) {
      progress.status = success ? 'completed' : 'failed';
      progress.currentPercent = 100;
      this.emit('progress', progress);

      // Create notification
      this.createNotification(testId, progress, success);

      // Keep for 5 minutes then cleanup
      setTimeout(() => {
        this.activeScans.delete(testId);
      }, 5 * 60 * 1000);
    }
  }

  private createNotification(testId: number, progress: ScanProgress, success: boolean): void {
    const id = `notif-${++this.notificationIdCounter}`;
    const duration = progress.elapsedTime;
    const durationFormatted = this.formatDuration(duration);

    const notification: Notification = {
      id,
      type: success ? 'scan_completed' : 'scan_failed',
      testId,
      domain: progress.domain,
      title: success ? `✅ Scan Completed - ${progress.domain}` : `❌ Scan Failed - ${progress.domain}`,
      message: success
        ? `Successfully tested ${progress.totalPages} pages with ${progress.issues.total} issues found.`
        : `Scan for ${progress.domain} failed. Please check the logs for details.`,
      timestamp: Date.now(),
      data: success
        ? {
            totalPages: progress.totalPages,
            totalIssues: progress.issues.total,
            duration,
            durationFormatted,
          }
        : undefined,
    };

    this.notifications.push(notification);

    // Keep only last 100 notifications
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(-100);
    }

    // Emit notification event
    this.emit('notification', notification);

    // Also emit to all connected clients via a global event
    this.emit('broadcast', { type: 'notification', data: notification });
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  getNotifications(limit: number = 20): Notification[] {
    return this.notifications
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  clearNotifications(): void {
    this.notifications = [];
    this.emit('notifications_cleared');
  }

  getProgress(testId: number): ScanProgress | undefined {
    return this.activeScans.get(testId);
  }

  getAllProgress(): ScanProgress[] {
    return Array.from(this.activeScans.values());
  }
}

export const progressManager = new ProgressManager();
