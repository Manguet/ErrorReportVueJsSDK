import { PerformanceMetrics, SDKHealth } from '../types';

export interface SDKMetrics extends PerformanceMetrics {
  memoryUsage?: number;
}

interface PerformanceEntry {
  operation: string;
  duration: number;
  timestamp: number;
  success: boolean;
}

export class SDKMonitor {
  private metrics: SDKMetrics;
  private performanceEntries: PerformanceEntry[] = [];
  private startTime: number;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly maxPerformanceEntries = 100;

  constructor() {
    this.startTime = Date.now();
    this.metrics = this.initializeMetrics();
    this.setupHealthCheck();
  }

  private initializeMetrics(): SDKMetrics {
    return {
      errorsReported: 0,
      errorsSuppressed: 0,
      retryAttempts: 0,
      offlineQueueSize: 0,
      averageResponseTime: 0,
      uptime: 0
    };
  }

  private setupHealthCheck(): void {
    if (typeof setInterval !== 'undefined') {
      this.healthCheckInterval = setInterval(() => {
        this.updateMemoryUsage();
        this.cleanupOldPerformanceEntries();
      }, 30000);
    }
  }

  trackError(error: Error, context?: any): void {
    this.metrics.errorsReported++;
    this.metrics.lastErrorTime = Date.now();
    
    if (context?.suppressed) {
      this.metrics.errorsSuppressed++;
    }
  }

  trackSuppressedError(reason: string): void {
    this.metrics.errorsSuppressed++;
  }

  trackRetryAttempt(): void {
    this.metrics.retryAttempts++;
  }

  trackPerformance(operation: string, duration: number, success: boolean = true): void {
    const entry: PerformanceEntry = {
      operation,
      duration,
      timestamp: Date.now(),
      success
    };

    this.performanceEntries.push(entry);
    this.updateAverageResponseTime();
    
    if (this.performanceEntries.length > this.maxPerformanceEntries) {
      this.performanceEntries = this.performanceEntries.slice(-this.maxPerformanceEntries);
    }
  }

  updateOfflineQueueSize(size: number): void {
    this.metrics.offlineQueueSize = size;
  }

  private updateAverageResponseTime(): void {
    if (this.performanceEntries.length === 0) {
      this.metrics.averageResponseTime = 0;
      return;
    }

    const recentEntries = this.performanceEntries.slice(-20);
    const total = recentEntries.reduce((sum, entry) => sum + entry.duration, 0);
    this.metrics.averageResponseTime = total / recentEntries.length;
  }

  private updateUptimeMetric(): void {
    this.metrics.uptime = Date.now() - this.startTime;
  }

  private updateMemoryUsage(): void {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const memory = (window.performance as any).memory;
      if (memory) {
        this.metrics.memoryUsage = memory.usedJSHeapSize;
      }
    }
  }

  private cleanupOldPerformanceEntries(): void {
    const cutoff = Date.now() - (60 * 60 * 1000);
    this.performanceEntries = this.performanceEntries.filter(
      entry => entry.timestamp > cutoff
    );
  }

  getMetrics(): SDKMetrics {
    this.updateUptimeMetric();
    return { ...this.metrics };
  }

  assessHealth(): SDKHealth {
    const metrics = this.getMetrics();
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    const errorRate = metrics.errorsReported > 0 ? 
      (metrics.errorsSuppressed / metrics.errorsReported) * 100 : 0;
    
    if (errorRate > 50) {
      issues.push('High error suppression rate');
      recommendations.push('Review error filtering configuration');
      score -= 20;
    }

    if (metrics.averageResponseTime > 5000) {
      issues.push('Slow average response time');
      recommendations.push('Check network connectivity and server performance');
      score -= 15;
    }

    if (metrics.offlineQueueSize > 10) {
      issues.push('Large offline queue');
      recommendations.push('Check network connectivity');
      score -= 10;
    }

    if (metrics.memoryUsage && metrics.memoryUsage > 50 * 1024 * 1024) {
      issues.push('High memory usage');
      recommendations.push('Consider reducing breadcrumb retention or queue sizes');
      score -= 10;
    }

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (score >= 80) {
      status = 'healthy';
    } else if (score >= 60) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      score: Math.max(0, score),
      issues,
      recommendations
    };
  }

  reset(): void {
    this.metrics = this.initializeMetrics();
    this.performanceEntries = [];
    this.startTime = Date.now();
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.performanceEntries = [];
  }
}