export interface QuotaConfig {
  dailyLimit: number;
  monthlyLimit: number;
  payloadSizeLimit: number;
  burstLimit: number;
  burstWindowMs: number;
}

export interface QuotaStats {
  dailyUsage: number;
  monthlyUsage: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  burstUsage: number;
  burstRemaining: number;
  isOverQuota: boolean;
  nextResetTime: number;
}

export interface QuotaResult {
  allowed: boolean;
  reason?: string;
  quotaStats: QuotaStats;
}

export class QuotaManager {
  private config: QuotaConfig;
  private dailyCount: number = 0;
  private monthlyCount: number = 0;
  private burstCounts: number[] = [];
  private lastResetDate: string;
  private lastResetMonth: string;
  private storageKey: string = 'error-explorer-quota';

  constructor(config: QuotaConfig) {
    this.config = config;
    const now = new Date();
    this.lastResetDate = this.getDateKey(now);
    this.lastResetMonth = this.getMonthKey(now);
    this.loadFromStorage();
  }

  canSendError(payloadSize: number = 0): QuotaResult {
    this.cleanupOldData();
    const stats = this.getStats();

    // Check payload size limit
    if (payloadSize > this.config.payloadSizeLimit) {
      return {
        allowed: false,
        reason: `Payload size (${payloadSize}) exceeds limit (${this.config.payloadSizeLimit})`,
        quotaStats: stats
      };
    }

    // Check burst limit
    this.cleanupBurstCounts();
    if (this.burstCounts.length >= this.config.burstLimit) {
      return {
        allowed: false,
        reason: 'Burst limit exceeded',
        quotaStats: stats
      };
    }

    // Check daily limit
    if (this.dailyCount >= this.config.dailyLimit) {
      return {
        allowed: false,
        reason: 'Daily quota exceeded',
        quotaStats: stats
      };
    }

    // Check monthly limit
    if (this.monthlyCount >= this.config.monthlyLimit) {
      return {
        allowed: false,
        reason: 'Monthly quota exceeded',
        quotaStats: stats
      };
    }

    return {
      allowed: true,
      quotaStats: stats
    };
  }

  recordUsage(payloadSize: number = 0): void {
    this.cleanupOldData();
    
    const now = Date.now();
    this.dailyCount++;
    this.monthlyCount++;
    this.burstCounts.push(now);
    
    this.saveToStorage();
  }

  private cleanupOldData(): void {
    const now = new Date();
    const currentDate = this.getDateKey(now);
    const currentMonth = this.getMonthKey(now);

    // Reset daily count if date changed
    if (currentDate !== this.lastResetDate) {
      this.dailyCount = 0;
      this.lastResetDate = currentDate;
    }

    // Reset monthly count if month changed
    if (currentMonth !== this.lastResetMonth) {
      this.monthlyCount = 0;
      this.lastResetMonth = currentMonth;
    }

    this.cleanupBurstCounts();
  }

  private cleanupBurstCounts(): void {
    const now = Date.now();
    const cutoff = now - this.config.burstWindowMs;
    this.burstCounts = this.burstCounts.filter(timestamp => timestamp > cutoff);
  }

  private getDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private getMonthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  getStats(): QuotaStats {
    this.cleanupOldData();
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    return {
      dailyUsage: this.dailyCount,
      monthlyUsage: this.monthlyCount,
      dailyRemaining: Math.max(0, this.config.dailyLimit - this.dailyCount),
      monthlyRemaining: Math.max(0, this.config.monthlyLimit - this.monthlyCount),
      burstUsage: this.burstCounts.length,
      burstRemaining: Math.max(0, this.config.burstLimit - this.burstCounts.length),
      isOverQuota: this.dailyCount >= this.config.dailyLimit || 
                   this.monthlyCount >= this.config.monthlyLimit ||
                   this.burstCounts.length >= this.config.burstLimit,
      nextResetTime: tomorrow.getTime()
    };
  }

  resetQuotas(): void {
    this.dailyCount = 0;
    this.monthlyCount = 0;
    this.burstCounts = [];
    this.saveToStorage();
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const data = {
        dailyCount: this.dailyCount,
        monthlyCount: this.monthlyCount,
        burstCounts: this.burstCounts,
        lastResetDate: this.lastResetDate,
        lastResetMonth: this.lastResetMonth
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save quota data to localStorage:', error);
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        this.dailyCount = parsed.dailyCount || 0;
        this.monthlyCount = parsed.monthlyCount || 0;
        this.burstCounts = parsed.burstCounts || [];
        this.lastResetDate = parsed.lastResetDate || this.lastResetDate;
        this.lastResetMonth = parsed.lastResetMonth || this.lastResetMonth;
      }
    } catch (error) {
      console.warn('Failed to load quota data from localStorage:', error);
    }
  }

  updateConfig(updates: Partial<QuotaConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getConfig(): QuotaConfig {
    return { ...this.config };
  }

  destroy(): void {
    this.resetQuotas();
  }
}