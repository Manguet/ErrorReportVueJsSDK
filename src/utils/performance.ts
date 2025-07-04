export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  operation: string;
  metadata?: Record<string, any>;
}

export class PerformanceMeasurement {
  private measurements: Map<string, PerformanceMetrics> = new Map();

  start(operation: string, metadata?: Record<string, any>): string {
    const id = this.generateId(operation);
    const startTime = this.getHighResolutionTime();
    
    this.measurements.set(id, {
      startTime,
      operation,
      metadata
    });
    
    return id;
  }

  end(id: string): PerformanceMetrics | null {
    const measurement = this.measurements.get(id);
    if (!measurement) {
      return null;
    }

    const endTime = this.getHighResolutionTime();
    const duration = endTime - measurement.startTime;

    const completed: PerformanceMetrics = {
      ...measurement,
      endTime,
      duration
    };

    this.measurements.delete(id);
    return completed;
  }

  measure<T>(operation: string, fn: () => T | Promise<T>, metadata?: Record<string, any>): Promise<{
    result: T;
    performance: PerformanceMetrics;
  }> {
    return new Promise(async (resolve, reject) => {
      const id = this.start(operation, metadata);
      
      try {
        const result = await fn();
        const performance = this.end(id);
        
        if (performance) {
          resolve({ result, performance });
        } else {
          resolve({ result, performance: { startTime: 0, operation, duration: 0 } });
        }
      } catch (error) {
        const performance = this.end(id);
        reject({ error, performance });
      }
    });
  }

  private generateId(operation: string): string {
    return `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getHighResolutionTime(): number {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  cleanup(): void {
    // Remove measurements older than 5 minutes
    const cutoff = this.getHighResolutionTime() - (5 * 60 * 1000);
    
    for (const [id, measurement] of this.measurements.entries()) {
      if (measurement.startTime < cutoff) {
        this.measurements.delete(id);
      }
    }
  }

  getPendingMeasurements(): PerformanceMetrics[] {
    return Array.from(this.measurements.values());
  }
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate: boolean = false
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    
    const callNow = immediate && !timeout;
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = window.setTimeout(later, wait);
    
    if (callNow) {
      func(...args);
    }
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function safeStringify(obj: any, maxDepth: number = 10, maxLength: number = 10000): string {
  const seen = new WeakSet();
  let depth = 0;
  
  const replacer = (key: string, value: any): any => {
    if (depth >= maxDepth) {
      return '[Max Depth Reached]';
    }
    
    if (value === null) return null;
    
    if (typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
      depth++;
    }
    
    if (typeof value === 'function') {
      return '[Function]';
    }
    
    if (typeof value === 'undefined') {
      return '[Undefined]';
    }
    
    if (typeof value === 'bigint') {
      return `[BigInt: ${value.toString()}]`;
    }
    
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }
    
    return value;
  };
  
  try {
    const result = JSON.stringify(obj, replacer);
    return result.length > maxLength ? result.substring(0, maxLength) + '...[Truncated]' : result;
  } catch (error) {
    return '[Unstringifiable Object]';
  }
}

export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 9);
  return `${timestamp}-${randomPart}`;
}

export function extractErrorInfo(error: Error): {
  name: string;
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
} {
  const info = {
    name: error.name || 'Error',
    message: error.message || 'Unknown error',
    stack: error.stack
  };

  // Try to extract file, line, and column from stack trace
  if (error.stack) {
    const stackLines = error.stack.split('\n');
    const relevantLine = stackLines.find(line => 
      line.includes('.js:') || line.includes('.ts:') || line.includes('.vue:')
    );
    
    if (relevantLine) {
      // Match different stack trace formats
      const match = relevantLine.match(/(?:at\s+.*\()?([^()]+):(\d+):(\d+)/) ||
                   relevantLine.match(/([^@]+)@([^:]+):(\d+):(\d+)/) ||
                   relevantLine.match(/([^:]+):(\d+):(\d+)/);
      
      if (match) {
        return {
          ...info,
          file: match[1] || match[2],
          line: parseInt(match[2] || match[3], 10),
          column: parseInt(match[3] || match[4], 10)
        };
      }
    }
  }

  return info;
}

export function getBrowserInfo(): {
  name: string;
  version: string;
  platform: string;
  mobile: boolean;
} {
  if (typeof window === 'undefined' || !navigator) {
    return {
      name: 'Unknown',
      version: 'Unknown',
      platform: 'Unknown',
      mobile: false
    };
  }

  const userAgent = navigator.userAgent;
  let name = 'Unknown';
  let version = 'Unknown';
  const platform = navigator.platform || 'Unknown';
  const mobile = /Mobi|Android/i.test(userAgent);

  // Chrome
  if (userAgent.includes('Chrome')) {
    name = 'Chrome';
    const match = userAgent.match(/Chrome\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  }
  // Firefox
  else if (userAgent.includes('Firefox')) {
    name = 'Firefox';
    const match = userAgent.match(/Firefox\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  }
  // Safari
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    name = 'Safari';
    const match = userAgent.match(/Version\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  }
  // Edge
  else if (userAgent.includes('Edg')) {
    name = 'Edge';
    const match = userAgent.match(/Edg\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  }

  return { name, version, platform, mobile };
}

export function getPerformanceInfo(): {
  memory?: number;
  timing?: any;
  navigation?: any;
} {
  if (typeof window === 'undefined' || !window.performance) {
    return {};
  }

  const info: any = {};

  // Memory information (Chrome only)
  if ('memory' in window.performance) {
    const memory = (window.performance as any).memory;
    if (memory) {
      info.memory = memory.usedJSHeapSize;
    }
  }

  // Navigation timing
  if (window.performance.timing) {
    info.timing = {
      navigationStart: window.performance.timing.navigationStart,
      loadEventEnd: window.performance.timing.loadEventEnd,
      domContentLoadedEventEnd: window.performance.timing.domContentLoadedEventEnd
    };
  }

  // Navigation type
  if (window.performance.navigation) {
    info.navigation = {
      type: window.performance.navigation.type,
      redirectCount: window.performance.navigation.redirectCount
    };
  }

  return info;
}

export function isDevelopment(): boolean {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV === 'development';
  }
  
  if (typeof window !== 'undefined') {
    return window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1' ||
           window.location.hostname.includes('dev') ||
           window.location.port !== '';
  }
  
  return false;
}