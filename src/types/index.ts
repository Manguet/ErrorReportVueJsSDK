export interface ErrorExplorerConfig {
  webhookUrl: string;
  projectName: string;
  environment?: string;
  enabled?: boolean;
  userId?: string | number;
  userEmail?: string;
  maxBreadcrumbs?: number;
  timeout?: number;
  retries?: number;
  beforeSend?: (data: ErrorData) => ErrorData | null;
  captureUnhandledRejections?: boolean;
  captureConsoleErrors?: boolean;
  
  // New advanced configuration options
  debug?: boolean;
  version?: string;
  commitHash?: string;
  customData?: Record<string, any>;
  
  // Rate limiting options
  maxRequestsPerMinute?: number;
  duplicateErrorWindow?: number;
  
  // Retry configuration
  maxRetries?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
  
  // Offline support
  enableOfflineSupport?: boolean;
  maxOfflineQueueSize?: number;
  offlineQueueMaxAge?: number;
  
  // Security options
  requireHttps?: boolean;
  maxPayloadSize?: number;
  
  // Quota management
  dailyLimit?: number;
  monthlyLimit?: number;
  burstLimit?: number;
  burstWindowMs?: number;
  
  // Compression options
  enableCompression?: boolean;
  compressionThreshold?: number;
  compressionLevel?: number;
  
  // Batching options
  enableBatching?: boolean;
  batchSize?: number;
  batchTimeout?: number;
  maxBatchPayloadSize?: number;
}

export interface ErrorData {
  message: string;
  exception_class: string;
  stack_trace: string;
  file: string;
  line: number;
  project: string;
  environment: string;
  timestamp: string;
  http_status?: number;
  request?: RequestData;
  browser?: BrowserData;
  context?: Record<string, any>;
  breadcrumbs?: Breadcrumb[];
  user?: UserContext;
  commitHash?: string;
  version?: string;
  sessionId?: string;
  customData?: Record<string, any>;
}

export interface RequestData {
  url?: string;
  referrer?: string;
  user_agent?: string;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface BrowserData {
  name: string;
  version: string;
  platform: string;
  language: string;
  cookies_enabled: boolean;
  online: boolean;
  screen: {
    width: number;
    height: number;
    color_depth: number;
  };
}

export interface UserContext {
  id?: string | number;
  email?: string;
  username?: string;
  ip?: string;
  [key: string]: any;
}

export interface Breadcrumb {
  message: string;
  category: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  timestamp: string;
  data?: Record<string, any>;
}

export interface VueErrorInfo {
  componentName?: string;
  propsData?: Record<string, any>;
  lifecycle?: string;
  errorBoundary?: string;
}

export type ErrorLevel = 'debug' | 'info' | 'warning' | 'error';

// New advanced types for the enhanced SDK

export interface SDKStats {
  queueSize: number;
  isOnline: boolean;
  rateLimitRemaining: number;
  rateLimitReset: number;
  quotaStats: QuotaStats;
  circuitBreakerState: string;
  sdkHealth: SDKHealth;
  performanceMetrics: PerformanceMetrics;
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

export interface SDKHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number;
  issues: string[];
  recommendations: string[];
}

export interface PerformanceMetrics {
  errorsReported: number;
  errorsSuppressed: number;
  retryAttempts: number;
  offlineQueueSize: number;
  averageResponseTime: number;
  lastErrorTime?: number;
  uptime: number;
  memoryUsage?: number;
}

export interface UseErrorExplorerResult {
  captureException: (error: Error, context?: Record<string, any>) => Promise<void>;
  captureMessage: (message: string, level?: ErrorLevel, context?: Record<string, any>) => Promise<void>;
  addBreadcrumb: (message: string, category?: string, level?: ErrorLevel, data?: Record<string, any>) => void;
  setUser: (user: Record<string, any>) => void;
  
  // New advanced methods
  getStats: () => SDKStats;
  flushQueue: () => Promise<void>;
  updateConfig: (updates: Partial<ErrorExplorerConfig>) => void;
  clearBreadcrumbs: () => void;
  isEnabled: () => boolean;
  setContext: (key: string, value: any) => void;
  removeContext: (key: string) => void;
  getSDKHealth: () => SDKHealth;
}