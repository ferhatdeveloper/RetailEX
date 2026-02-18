// Production-Ready Logger Utility
// Automatically disables console logs in production

const isDevelopment = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

/**
 * Smart logger that only outputs in development mode
 * In production, all logs are no-ops for better performance
 */
export const logger = {
  log: isDevelopment ? console.log.bind(console) : () => {},
  info: isDevelopment ? console.info.bind(console) : () => {},
  warn: isDevelopment ? console.warn.bind(console) : () => {},
  error: console.error.bind(console), // Always log errors
  debug: isDevelopment ? console.debug.bind(console) : () => {},
  group: isDevelopment ? console.group.bind(console) : () => {},
  groupEnd: isDevelopment ? console.groupEnd.bind(console) : () => {},
  table: isDevelopment ? console.table.bind(console) : () => {},
  time: isDevelopment ? console.time.bind(console) : () => {},
  timeEnd: isDevelopment ? console.timeEnd.bind(console) : () => {},
};

/**
 * Performance logger for measuring execution time
 */
export class PerformanceLogger {
  private timers: Map<string, number> = new Map();

  start(label: string): void {
    if (isDevelopment) {
      this.timers.set(label, performance.now());
      logger.log(`⏱️ [${label}] Started`);
    }
  }

  end(label: string): void {
    if (isDevelopment) {
      const startTime = this.timers.get(label);
      if (startTime) {
        const duration = performance.now() - startTime;
        logger.log(`✅ [${label}] Completed in ${duration.toFixed(2)}ms`);
        this.timers.delete(label);
      }
    }
  }
}

export const perfLogger = new PerformanceLogger();
