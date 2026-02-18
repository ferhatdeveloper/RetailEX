/**
 * RetailEX - Centralized Logging Service
 * 
 * Captures INFO, WARN, ERROR, and SQL logs.
 * Persists logs in localStorage for UI debugging.
 * Integrates with Tauri events if needed.
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SQL';

export interface LogEntry {
    id: string;
    timestamp: string;
    level: LogLevel;
    module: string;
    message: string;
    details?: any;
    duration?: number; // For SQL/Async tasks
}

class LoggingService {
    private static instance: LoggingService;
    private logs: LogEntry[] = [];
    private readonly MAX_LOGS = 1000;
    private listeners: ((log: LogEntry) => void)[] = [];

    private constructor() {
        this.loadLogs();
    }

    static getInstance(): LoggingService {
        if (!LoggingService.instance) {
            LoggingService.instance = new LoggingService();
        }
        return LoggingService.instance;
    }

    private loadLogs() {
        try {
            const saved = localStorage.getItem('retailex_system_logs');
            if (saved) {
                this.logs = JSON.parse(saved);
            }
        } catch (e) {
            this.logs = [];
        }
    }

    private saveLogs() {
        try {
            // Only keep last N logs in storage to prevent bloat
            const toSave = this.logs.slice(-500);
            localStorage.setItem('retailex_system_logs', JSON.stringify(toSave));
        } catch (e) {
            console.error('Failed to save logs to localStorage', e);
        }
    }

    private createLog(level: LogLevel, module: string, message: string, details?: any, duration?: number): LogEntry {
        const log: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            level,
            module,
            message,
            details,
            duration
        };

        this.logs.push(log);
        if (this.logs.length > this.MAX_LOGS) {
            this.logs.shift();
        }

        this.notifyListeners(log);
        this.saveLogs();

        // Also log to console for development
        const color = level === 'ERROR' ? 'color: #ff5555' : level === 'WARN' ? 'color: #ffaa00' : level === 'SQL' ? 'color: #55aaff' : 'color: #55ff55';
        console.log(`%c[${level}] [${module}] %c${message}`, color, 'color: inherit', details || '');

        return log;
    }

    info(module: string, message: string, details?: any) {
        return this.createLog('INFO', module, message, details);
    }

    warn(module: string, message: string, details?: any) {
        return this.createLog('WARN', module, message, details);
    }

    error(module: string, message: string, details?: any) {
        return this.createLog('ERROR', module, message, details);
    }

    sql(module: string, sql: string, params?: any[], duration?: number) {
        return this.createLog('SQL', module, sql, { params }, duration);
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    clearLogs() {
        this.logs = [];
        localStorage.removeItem('retailex_system_logs');
        this.notifyListeners({} as any); // Notify of clear
    }

    subscribe(callback: (log: LogEntry) => void) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private notifyListeners(log: LogEntry) {
        this.listeners.forEach(l => l(log));
    }

    exportLogs(): string {
        return JSON.stringify(this.logs, null, 2);
    }
}

export const logger = LoggingService.getInstance();
