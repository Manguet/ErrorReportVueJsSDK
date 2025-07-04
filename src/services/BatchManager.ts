import { ErrorData } from '../types';

export interface BatchConfig {
  enabled: boolean;
  maxSize: number; // Maximum number of errors in a batch
  maxWaitTime: number; // Maximum time to wait before sending batch (ms)
  maxPayloadSize: number; // Maximum payload size in bytes
}

export interface BatchedErrorData {
  errors: ErrorData[];
  batchId: string;
  timestamp: string;
  count: number;
}

export class BatchManager {
  private config: BatchConfig;
  private currentBatch: ErrorData[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private sendFunction: ((data: BatchedErrorData) => Promise<void>) | null = null;
  private batchCounter = 0;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = {
      enabled: true,
      maxSize: 10,
      maxWaitTime: 5000, // 5 seconds
      maxPayloadSize: 500 * 1024, // 500KB
      ...config
    };
  }

  setSendFunction(sendFn: (data: BatchedErrorData) => Promise<void>): void {
    this.sendFunction = sendFn;
  }

  async addError(errorData: ErrorData): Promise<void> {
    if (!this.config.enabled || !this.sendFunction) {
      // If batching disabled, send immediately
      if (this.sendFunction) {
        const batch: BatchedErrorData = {
          errors: [errorData],
          batchId: this.generateBatchId(),
          timestamp: new Date().toISOString(),
          count: 1
        };
        await this.sendFunction(batch);
      }
      return;
    }

    this.currentBatch.push(errorData);

    // Check if we should send the batch immediately
    if (this.shouldSendBatch()) {
      await this.sendCurrentBatch();
    } else if (!this.batchTimer) {
      // Start timer if not already running
      this.startBatchTimer();
    }
  }

  private shouldSendBatch(): boolean {
    if (this.currentBatch.length >= this.config.maxSize) {
      return true;
    }

    // Check payload size
    const estimatedSize = this.estimateBatchSize();
    return estimatedSize >= this.config.maxPayloadSize;
  }

  private estimateBatchSize(): number {
    const batchData: BatchedErrorData = {
      errors: this.currentBatch,
      batchId: 'estimate',
      timestamp: new Date().toISOString(),
      count: this.currentBatch.length
    };

    return new Blob([JSON.stringify(batchData)]).size;
  }

  private startBatchTimer(): void {
    this.batchTimer = setTimeout(async () => {
      await this.sendCurrentBatch();
    }, this.config.maxWaitTime);
  }

  private async sendCurrentBatch(): Promise<void> {
    if (this.currentBatch.length === 0 || !this.sendFunction) {
      return;
    }

    const batch: BatchedErrorData = {
      errors: [...this.currentBatch],
      batchId: this.generateBatchId(),
      timestamp: new Date().toISOString(),
      count: this.currentBatch.length
    };

    // Clear current batch
    this.currentBatch = [];
    
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      await this.sendFunction(batch);
    } catch (error) {
      // If batch fails, we could implement retry logic here
      // For now, we'll just log and continue
      if (typeof console !== 'undefined' && console.error) {
        console.error('[BatchManager] Failed to send batch:', error);
      }
    }
  }

  async flush(): Promise<void> {
    if (this.currentBatch.length > 0) {
      await this.sendCurrentBatch();
    }
  }

  private generateBatchId(): string {
    this.batchCounter++;
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `batch_${timestamp}_${this.batchCounter}_${random}`;
  }

  getStats(): {
    currentBatchSize: number;
    hasPendingBatch: boolean;
    timeUntilFlush: number;
    estimatedPayloadSize: number;
  } {
    const timeUntilFlush = this.batchTimer ? 
      this.config.maxWaitTime - (Date.now() % this.config.maxWaitTime) : 0;

    return {
      currentBatchSize: this.currentBatch.length,
      hasPendingBatch: this.currentBatch.length > 0,
      timeUntilFlush,
      estimatedPayloadSize: this.estimateBatchSize()
    };
  }

  updateConfig(updates: Partial<BatchConfig>): void {
    const oldEnabled = this.config.enabled;
    this.config = { ...this.config, ...updates };

    // If batching was disabled, flush current batch
    if (oldEnabled && !this.config.enabled) {
      this.flush();
    }
  }

  getConfig(): BatchConfig {
    return { ...this.config };
  }

  destroy(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Try to flush any remaining errors
    if (this.currentBatch.length > 0) {
      this.flush().catch(() => {
        // Ignore errors during cleanup
      });
    }
  }
}