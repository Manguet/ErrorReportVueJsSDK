import { ErrorData } from '../types';

export interface OfflineQueueItem {
  id: string;
  errorData: ErrorData;
  timestamp: number;
  attempts: number;
}

export class OfflineManager {
  private maxQueueSize: number;
  private maxAge: number;
  private queue: OfflineQueueItem[] = [];
  private isOnline: boolean = true;
  private sendFunction: ((errorData: ErrorData) => Promise<void>) | null = null;
  private processingQueue: boolean = false;
  private onlineListener: (() => void) | null = null;
  private offlineListener: (() => void) | null = null;

  constructor(maxQueueSize: number = 50, maxAge: number = 24 * 60 * 60 * 1000) {
    this.maxQueueSize = maxQueueSize;
    this.maxAge = maxAge;
    this.setupNetworkListeners();
    this.loadQueueFromStorage();
  }

  private setupNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    this.isOnline = navigator.onLine;

    this.onlineListener = () => {
      this.isOnline = true;
      this.processQueue();
    };

    this.offlineListener = () => {
      this.isOnline = false;
    };

    window.addEventListener('online', this.onlineListener);
    window.addEventListener('offline', this.offlineListener);
  }

  setSendFunction(sendFunction: (errorData: ErrorData) => Promise<void>): void {
    this.sendFunction = sendFunction;
  }

  async handleError(errorData: ErrorData): Promise<void> {
    if (this.isOnline && this.sendFunction) {
      try {
        await this.sendFunction(errorData);
        return;
      } catch (error) {
        // If sending fails, queue the error
        this.queueError(errorData);
      }
    } else {
      // Offline, queue the error
      this.queueError(errorData);
    }
  }

  private queueError(errorData: ErrorData): void {
    const queueItem: OfflineQueueItem = {
      id: this.generateId(),
      errorData,
      timestamp: Date.now(),
      attempts: 0
    };

    // Remove expired items
    this.cleanupQueue();

    // Add to queue
    this.queue.push(queueItem);

    // Enforce max queue size
    if (this.queue.length > this.maxQueueSize) {
      // Remove oldest items
      this.queue.sort((a, b) => a.timestamp - b.timestamp);
      this.queue = this.queue.slice(-this.maxQueueSize);
    }

    // Persist to storage
    this.saveQueueToStorage();
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue || !this.isOnline || !this.sendFunction) {
      return;
    }

    this.processingQueue = true;

    try {
      const itemsToProcess = [...this.queue];
      const processedItems: string[] = [];

      for (const item of itemsToProcess) {
        try {
          await this.sendFunction(item.errorData);
          processedItems.push(item.id);
        } catch (error) {
          // Increment attempts
          item.attempts++;
          
          // Remove items that have failed too many times
          if (item.attempts >= 3) {
            processedItems.push(item.id);
          }
        }
      }

      // Remove processed items
      this.queue = this.queue.filter(item => !processedItems.includes(item.id));
      this.saveQueueToStorage();

    } finally {
      this.processingQueue = false;
    }
  }

  private cleanupQueue(): void {
    const now = Date.now();
    const cutoff = now - this.maxAge;
    
    this.queue = this.queue.filter(item => item.timestamp > cutoff);
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  private getStorageKey(): string {
    return 'error-explorer-offline-queue';
  }

  private saveQueueToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const data = JSON.stringify(this.queue);
      localStorage.setItem(this.getStorageKey(), data);
    } catch (error) {
      // Storage might be full or unavailable
      console.warn('Failed to save offline queue to localStorage:', error);
    }
  }

  private loadQueueFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const data = localStorage.getItem(this.getStorageKey());
      if (data) {
        const parsedQueue = JSON.parse(data);
        if (Array.isArray(parsedQueue)) {
          this.queue = parsedQueue;
          this.cleanupQueue();
        }
      }
    } catch (error) {
      console.warn('Failed to load offline queue from localStorage:', error);
      this.queue = [];
    }
  }

  async flushQueue(): Promise<void> {
    if (this.isOnline) {
      await this.processQueue();
    }
  }

  getQueueStats(): {
    size: number;
    oldestTimestamp: number | null;
    isOnline: boolean;
    isProcessing: boolean;
  } {
    return {
      size: this.queue.length,
      oldestTimestamp: this.queue.length > 0 ? Math.min(...this.queue.map(item => item.timestamp)) : null,
      isOnline: this.isOnline,
      isProcessing: this.processingQueue
    };
  }

  clearQueue(): void {
    this.queue = [];
    this.saveQueueToStorage();
  }

  destroy(): void {
    if (this.onlineListener) {
      window.removeEventListener('online', this.onlineListener);
    }
    if (this.offlineListener) {
      window.removeEventListener('offline', this.offlineListener);
    }
    
    this.clearQueue();
    this.sendFunction = null;
  }
}