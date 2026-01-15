import cron from 'node-cron';
import { DatabaseManager } from './database.js';
import { runScan } from './scanner-service.js';

interface ScheduledTask {
  id: number;
  name: string;
  domain: string;
  cron_expression: string;
  enabled: number;
}

class SchedulerService {
  private db: DatabaseManager;
  private tasks: Map<number, any> = new Map();

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Initialize scheduler - load and start all enabled tasks
   */
  initialize(): void {
    const tasks = this.db.getScheduledTasks();
    const enabledTasks = tasks.filter(t => t.enabled === 1);

    console.log(`[Scheduler] Initializing ${enabledTasks.length} scheduled tasks...`);

    for (const task of enabledTasks) {
      this.scheduleTask(task);
    }

    console.log(`[Scheduler] Initialized ${this.tasks.size} active tasks`);
  }

  /**
   * Schedule a single task
   */
  scheduleTask(task: ScheduledTask): void {
    // Remove existing task if any
    this.unscheduleTask(task.id);

    // Validate cron expression
    if (!cron.validate(task.cron_expression)) {
      console.error(`[Scheduler] Invalid cron expression for task ${task.id}: ${task.cron_expression}`);
      return;
    }

    try {
      const scheduledTask = cron.schedule(task.cron_expression, async () => {
        console.log(`[Scheduler] Running scheduled task: ${task.name} (${task.domain})`);
        await this.executeTask(task.id, task.domain);
      }, {
        timezone: process.env.TZ || 'Asia/Shanghai'
      });

      this.tasks.set(task.id, scheduledTask);
      console.log(`[Scheduler] Scheduled task "${task.name}" with cron: ${task.cron_expression}`);
    } catch (error) {
      console.error(`[Scheduler] Failed to schedule task ${task.id}:`, error);
    }
  }

  /**
   * Unschedule (stop) a task
   */
  unscheduleTask(taskId: number): void {
    const existingTask = this.tasks.get(taskId);
    if (existingTask) {
      existingTask.stop();
      this.tasks.delete(taskId);
      console.log(`[Scheduler] Unscheduled task ${taskId}`);
    }
  }

  /**
   * Execute a scheduled scan task
   */
  private async executeTask(taskId: number, domain: string): Promise<void> {
    try {
      // Get task details
      const task = this.db.getScheduledTask(taskId);
      if (!task) {
        console.error(`[Scheduler] Task ${taskId} not found`);
        return;
      }

      // Update last_run time
      this.db.updateScheduledTask(taskId, {
        last_run: Date.now()
      });

      // Run the scan (will use global custom URLs from database)
      await runScan(domain, this.db);

      console.log(`[Scheduler] Task ${taskId} completed successfully`);
    } catch (error) {
      console.error(`[Scheduler] Task ${taskId} failed:`, error);
    }
  }

  /**
   * Add a new scheduled task
   */
  addTask(task: ScheduledTask): void {
    if (task.enabled === 1) {
      this.scheduleTask(task);
    }
  }

  /**
   * Update a scheduled task
   */
  updateTask(task: ScheduledTask): void {
    // Unschedule existing task
    this.unscheduleTask(task.id);

    // Reschedule if enabled
    if (task.enabled === 1) {
      this.scheduleTask(task);
    }
  }

  /**
   * Delete a scheduled task
   */
  deleteTask(taskId: number): void {
    this.unscheduleTask(taskId);
  }

  /**
   * Get all active tasks
   */
  getActiveTasks(): number[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * Check if a task is currently scheduled
   */
  isTaskActive(taskId: number): boolean {
    return this.tasks.has(taskId);
  }
}

// Singleton instance
let schedulerInstance: SchedulerService | null = null;

export function createScheduler(db: DatabaseManager): SchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerService(db);
  }
  return schedulerInstance;
}

export function getScheduler(): SchedulerService | null {
  return schedulerInstance;
}
