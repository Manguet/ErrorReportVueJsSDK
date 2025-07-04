export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTime: number;
}

export class RetryManager {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      ...config
    };
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    customConfig?: Partial<RetryConfig>
  ): Promise<RetryResult<T>> {
    const config = { ...this.config, ...customConfig };
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await operation();
        return {
          success: true,
          result,
          attempts: attempt + 1,
          totalTime: Date.now() - startTime
        };
      } catch (error) {
        lastError = error as Error;

        // Don't retry on the last attempt
        if (attempt === config.maxRetries) {
          break;
        }

        // Don't retry on certain types of errors
        if (this.shouldNotRetry(error as Error)) {
          break;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, config);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError || new Error('Unknown error'),
      attempts: config.maxRetries + 1,
      totalTime: Date.now() - startTime
    };
  }

  private shouldNotRetry(error: Error): boolean {
    // Don't retry on certain HTTP status codes (if it's a network error)
    if (error.message.includes('400') || error.message.includes('401') || 
        error.message.includes('403') || error.message.includes('404')) {
      return true;
    }

    // Don't retry on validation errors
    if (error.name === 'ValidationError' || error.name === 'TypeError') {
      return true;
    }

    return false;
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    // Calculate exponential backoff
    let delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
    
    // Apply max delay cap
    delay = Math.min(delay, config.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (config.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
      delay += jitter;
    }
    
    return Math.max(0, Math.round(delay));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper method for simple operations with default config
  async retry<T>(operation: () => Promise<T>): Promise<T> {
    const result = await this.executeWithRetry(operation);
    if (result.success && result.result !== undefined) {
      return result.result;
    }
    throw result.error || new Error('Retry failed');
  }

  // Helper method to create a retryable version of a function
  makeRetryable<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    customConfig?: Partial<RetryConfig>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const result = await this.executeWithRetry(() => fn(...args), customConfig);
      if (result.success && result.result !== undefined) {
        return result.result;
      }
      throw result.error || new Error('Retry failed');
    };
  }

  getConfig(): RetryConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}