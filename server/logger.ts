import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, any>;
}

class Logger {
  private logDir: string;
  private logFile?: string;
  private logLevel: LogLevel;
  private secretKeys = ['password', 'token', 'key', 'secret', 'auth', 'credential', 'api_key', 'apikey'];

  constructor() {
    this.logDir = process.env.LOG_DIR || './logs';
    this.logFile = process.env.LOG_FILE; // If set, overrides daily rotation
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
    
    // Ensure log directory exists (if using daily rotation)
    if (!this.logFile) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch (err) {
        console.warn('⚠️  Could not create log directory:', err);
      }
    }
  }

  private getLogFilePath(): string {
    if (this.logFile) return this.logFile;
    
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `app-${today}.log`);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  private sanitize(obj: any, maxDepth = 3): any {
    if (maxDepth <= 0) return '[max depth]';
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Buffer.isBuffer(obj)) return '[Buffer]';
    if (obj instanceof Date) return obj.toISOString();
    
    if (Array.isArray(obj)) {
      return obj.slice(0, 10).map(item => this.sanitize(item, maxDepth - 1));
    }

    const sanitized: any = {};
    let fieldCount = 0;
    
    for (const [key, value] of Object.entries(obj)) {
      if (fieldCount >= 50) { // Limit field count
        sanitized['...'] = `[${Object.keys(obj).length - fieldCount} more fields]`;
        break;
      }

      const keyLower = key.toLowerCase();
      const isSecret = this.secretKeys.some(secret => keyLower.includes(secret));
      
      if (isSecret) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.substring(0, 1000) + '...[truncated]';
      } else {
        sanitized[key] = this.sanitize(value, maxDepth - 1);
      }
      
      fieldCount++;
    }
    
    return sanitized;
  }

  private writeToFile(entry: LogEntry): void {
    try {
      const logPath = this.getLogFilePath();
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(logPath, line, 'utf8');
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  private log(level: LogLevel, message: string, meta?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta: meta ? this.sanitize(meta) : undefined,
    };

    // Write detailed entry to file
    this.writeToFile(entry);

    // Minimal console output (respecting suppress verbose logs rule)
    const levelEmoji = { debug: '🐛', info: 'ℹ️', warn: '⚠️', error: '❌' };
    const consoleMsg = `${levelEmoji[level]} [${level.toUpperCase()}] ${message}`;
    
    if (level === 'error') {
      console.error(consoleMsg);
    } else if (level === 'warn') {
      console.warn(consoleMsg);
    } else {
      console.log(consoleMsg);
    }
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, any>): void {
    this.log('error', message, meta);
  }

  // HTTP middleware for detailed request/response logging
  http(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const originalSend = res.send;
    let responseBody: any;
    let responseSize = 0;

    // Capture response
    res.send = function (body: any) {
      responseBody = body;
      responseSize = Buffer.isBuffer(body) ? body.length : 
                    typeof body === 'string' ? Buffer.byteLength(body) :
                    JSON.stringify(body).length;
      return originalSend.call(this, body);
    };

    res.on('finish', () => {
      const duration = Date.now() - start;
      const isApiPath = req.path.startsWith('/api');
      
      // Console: minimal single-line summary
      const shortMsg = `${req.method} ${req.path} ${res.statusCode} (${duration}ms)`;
      if (isApiPath || res.statusCode >= 400) {
        console.log(`🌐 ${shortMsg}`);
      }

      // File: detailed JSON entry
      const meta = {
        request: {
          method: req.method,
          path: req.path,
          query: this.sanitize(req.query),
          headers: this.sanitize(req.headers),
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent'),
          body: req.body ? this.sanitize(req.body) : undefined,
        },
        response: {
          statusCode: res.statusCode,
          headers: this.sanitize(res.getHeaders()),
          size: responseSize,
          body: responseBody && isApiPath ? this.sanitize(responseBody) : undefined,
        },
        timing: {
          duration,
          timestamp: new Date().toISOString(),
        },
      };

      this.debug(`HTTP ${req.method} ${req.path}`, meta);
    });

    next();
  }
}

// Export singleton instance
export const logger = new Logger();

// Export middleware
export const httpLogger = (req: Request, res: Response, next: NextFunction) => {
  logger.http(req, res, next);
};

// Legacy compatibility (replace the vite log function)
export const log = (message: string) => logger.info(message);