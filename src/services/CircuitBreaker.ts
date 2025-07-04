export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  minimumRequests: number;
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  failureRate: number;
  timeInCurrentState: number;
  nextRetryTime?: number;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface RequestRecord {
  timestamp: number;
  success: boolean;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private stateChangeTime: number;
  private requests: RequestRecord[] = [];

  constructor(private config: CircuitBreakerConfig) {
    this.stateChangeTime = Date.now();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        this.stateChangeTime = Date.now();
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.requests.push({ timestamp: Date.now(), success: true });
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
      this.stateChangeTime = Date.now();
    }
    
    this.cleanupRequests();
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.requests.push({ timestamp: Date.now(), success: false });
    
    if (this.shouldOpenCircuit()) {
      this.state = 'OPEN';
      this.stateChangeTime = Date.now();
    }
    
    this.cleanupRequests();
  }

  private cleanupRequests(): void {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    this.requests = this.requests.filter(req => req.timestamp > cutoff);
  }

  private shouldOpenCircuit(): boolean {
    this.cleanupRequests();

    if (this.requests.length < this.config.minimumRequests) {
      return false;
    }

    const failures = this.requests.filter(req => !req.success).length;
    const failureRate = failures / this.requests.length;

    return failureRate >= (this.config.failureThreshold / 10);
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.stateChangeTime >= this.config.resetTimeout;
  }

  canExecute(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN' && this.shouldAttemptReset()) {
      this.state = 'HALF_OPEN';
      this.stateChangeTime = Date.now();
      return true;
    }

    return this.state === 'HALF_OPEN';
  }

  getStats(): CircuitBreakerStats {
    this.cleanupRequests();
    
    const totalRequests = this.requests.length;
    const failures = this.requests.filter(req => !req.success).length;
    const failureRate = totalRequests > 0 ? failures / totalRequests : 0;
    
    const stats: CircuitBreakerStats = {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests,
      failureRate,
      timeInCurrentState: Date.now() - this.stateChangeTime
    };

    if (this.state === 'OPEN') {
      stats.nextRetryTime = this.stateChangeTime + this.config.resetTimeout;
    }

    return stats;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.stateChangeTime = Date.now();
    this.requests = [];
  }

  forceOpen(): void {
    this.state = 'OPEN';
    this.stateChangeTime = Date.now();
  }

  forceClose(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.stateChangeTime = Date.now();
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  updateConfig(updates: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }
}