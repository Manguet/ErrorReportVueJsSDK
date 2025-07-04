import { ErrorData } from '../types';

export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
  duplicateErrorWindow: number;
}

export interface RateLimitInfo {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  reason?: string;
}

export class RateLimiter {
  private config: RateLimiterConfig;
  private requests: number[] = [];
  private errorHashes: Map<string, number> = new Map();
  private cleanupInterval: number | null = null;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.setupCleanupInterval();
  }

  private setupCleanupInterval(): void {
    if (typeof window !== 'undefined') {
      this.cleanupInterval = window.setInterval(() => {
        this.cleanup();
      }, this.config.windowMs);
    }
  }

  canSendError(errorData: ErrorData): RateLimitInfo {
    const now = Date.now();
    
    // Check rate limit
    this.removeExpiredRequests(now);
    
    if (this.requests.length >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: this.getNextResetTime(now),
        reason: 'Rate limit exceeded'
      };
    }

    // Check for duplicate errors
    const errorHash = this.generateErrorHash(errorData);
    const lastSeen = this.errorHashes.get(errorHash);
    
    if (lastSeen && (now - lastSeen) < this.config.duplicateErrorWindow) {
      return {
        allowed: false,
        remaining: this.config.maxRequests - this.requests.length,
        resetTime: this.getNextResetTime(now),
        reason: 'Duplicate error'
      };
    }

    return {
      allowed: true,
      remaining: this.config.maxRequests - this.requests.length - 1,
      resetTime: this.getNextResetTime(now)
    };
  }

  markErrorSent(errorData: ErrorData): void {
    const now = Date.now();
    this.requests.push(now);
    
    const errorHash = this.generateErrorHash(errorData);
    this.errorHashes.set(errorHash, now);
  }

  private generateErrorHash(errorData: ErrorData): string {
    // Generate hash based on error message, stack trace, and file/line
    const key = `${errorData.message}-${errorData.file}-${errorData.line}`;
    return btoa(key).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  }

  private removeExpiredRequests(now: number): void {
    const cutoff = now - this.config.windowMs;
    this.requests = this.requests.filter(timestamp => timestamp > cutoff);
  }

  private getNextResetTime(now: number): number {
    if (this.requests.length === 0) {
      return now + this.config.windowMs;
    }
    
    const oldestRequest = Math.min(...this.requests);
    return oldestRequest + this.config.windowMs;
  }

  cleanup(): void {
    const now = Date.now();
    
    // Clean up old requests
    this.removeExpiredRequests(now);
    
    // Clean up old error hashes
    const cutoff = now - this.config.duplicateErrorWindow;
    for (const [hash, timestamp] of this.errorHashes.entries()) {
      if (timestamp < cutoff) {
        this.errorHashes.delete(hash);
      }
    }
  }

  getStats(): { requestCount: number; errorHashCount: number } {
    return {
      requestCount: this.requests.length,
      errorHashCount: this.errorHashes.size
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.requests = [];
    this.errorHashes.clear();
  }
}