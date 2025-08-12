import { App } from 'vue';

interface ErrorExplorerConfig {
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
    debug?: boolean;
    version?: string;
    commitHash?: string;
    customData?: Record<string, any>;
    maxRequestsPerMinute?: number;
    duplicateErrorWindow?: number;
    maxRetries?: number;
    initialRetryDelay?: number;
    maxRetryDelay?: number;
    enableOfflineSupport?: boolean;
    maxOfflineQueueSize?: number;
    offlineQueueMaxAge?: number;
    requireHttps?: boolean;
    maxPayloadSize?: number;
    dailyLimit?: number;
    monthlyLimit?: number;
    burstLimit?: number;
    burstWindowMs?: number;
    enableCompression?: boolean;
    compressionThreshold?: number;
    compressionLevel?: number;
    enableBatching?: boolean;
    batchSize?: number;
    batchTimeout?: number;
    maxBatchPayloadSize?: number;
}
interface ErrorData {
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
interface RequestData {
    url?: string;
    referrer?: string;
    user_agent?: string;
    viewport?: {
        width: number;
        height: number;
    };
}
interface BrowserData {
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
interface UserContext {
    id?: string | number;
    email?: string;
    username?: string;
    ip?: string;
    [key: string]: any;
}
interface Breadcrumb {
    message: string;
    category: string;
    level: 'debug' | 'info' | 'warning' | 'error';
    timestamp: string;
    data?: Record<string, any>;
}
interface VueErrorInfo {
    componentName?: string;
    propsData?: Record<string, any>;
    lifecycle?: string;
    errorBoundary?: string;
}
type ErrorLevel = 'debug' | 'info' | 'warning' | 'error';
interface SDKStats {
    queueSize: number;
    isOnline: boolean;
    rateLimitRemaining: number;
    rateLimitReset: number;
    quotaStats: QuotaStats$1;
    circuitBreakerState: string;
    sdkHealth: SDKHealth;
    performanceMetrics: PerformanceMetrics$1;
}
interface QuotaStats$1 {
    dailyUsage: number;
    monthlyUsage: number;
    dailyRemaining: number;
    monthlyRemaining: number;
    burstUsage: number;
    burstRemaining: number;
    isOverQuota: boolean;
    nextResetTime: number;
}
interface SDKHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    score: number;
    issues: string[];
    recommendations: string[];
}
interface PerformanceMetrics$1 {
    errorsReported: number;
    errorsSuppressed: number;
    retryAttempts: number;
    offlineQueueSize: number;
    averageResponseTime: number;
    lastErrorTime?: number;
    uptime: number;
    memoryUsage?: number;
}
interface UseErrorExplorerResult {
    captureException: (error: Error, context?: Record<string, any>) => Promise<void>;
    captureMessage: (message: string, level?: ErrorLevel, context?: Record<string, any>) => Promise<void>;
    addBreadcrumb: (message: string, category?: string, level?: ErrorLevel, data?: Record<string, any>) => void;
    setUser: (user: Record<string, any>) => void;
    getStats: () => SDKStats;
    flushQueue: () => Promise<void>;
    updateConfig: (updates: Partial<ErrorExplorerConfig>) => void;
    clearBreadcrumbs: () => void;
    isEnabled: () => boolean;
    setContext: (key: string, value: any) => void;
    removeContext: (key: string) => void;
    getSDKHealth: () => SDKHealth;
}

declare class BreadcrumbManager {
    private breadcrumbs;
    private maxBreadcrumbs;
    constructor(maxBreadcrumbs?: number);
    addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>): void;
    getBreadcrumbs(): Breadcrumb[];
    clear(): void;
    addNavigation(from: string, to: string): void;
    addUserInteraction(event: string, target: string, data?: Record<string, any>): void;
    addHttpRequest(method: string, url: string, statusCode?: number): void;
    addComponentLifecycle(componentName: string, lifecycle: string): void;
    addVueEvent(componentName: string, eventName: string, data?: any): void;
    addConsoleLog(level: string, message: string, data?: any): void;
    addCustom(message: string, data?: Record<string, any>): void;
    clearBreadcrumbs(): void;
}

declare class ErrorReporter {
    private config;
    private breadcrumbManager;
    private rateLimiter;
    private offlineManager;
    private retryManager;
    private securityValidator;
    private quotaManager;
    private sdkMonitor;
    private circuitBreaker;
    private compressionService;
    private batchManager;
    private userContext;
    private globalContext;
    private sessionId;
    private isInitialized;
    constructor(config: ErrorExplorerConfig);
    private initializeServices;
    private initialize;
    private setupGlobalHandlers;
    private setupConsoleCapture;
    setUser(user: UserContext): void;
    setContext(key: string, value: any): void;
    removeContext(key: string): void;
    addBreadcrumb(message: string, category?: string, level?: 'debug' | 'info' | 'warning' | 'error', data?: Record<string, any>): void;
    captureException(error: Error, context?: Record<string, any>): Promise<void>;
    captureMessage(message: string, level?: 'debug' | 'info' | 'warning' | 'error', context?: Record<string, any>): Promise<void>;
    private formatError;
    private sendError;
    private sendErrorDirectly;
    private sendBatchDirectly;
    private sendWithCompression;
    private getRequestData;
    private getBrowserData;
    getStats(): SDKStats;
    flushQueue(): Promise<void>;
    updateConfig(updates: Partial<ErrorExplorerConfig>): void;
    clearBreadcrumbs(): void;
    isEnabled(): boolean;
    getSDKHealth(): SDKHealth;
    getBreadcrumbManager(): BreadcrumbManager;
    getConfig(): {
        webhookUrl: string;
        projectName: string;
        environment: string;
        enabled: boolean;
        maxBreadcrumbs: number;
        timeout: number;
        retries: number;
        captureUnhandledRejections: boolean;
        captureConsoleErrors: boolean;
        debug: boolean;
        version: string;
        maxRequestsPerMinute: number;
        duplicateErrorWindow: number;
        maxRetries: number;
        initialRetryDelay: number;
        maxRetryDelay: number;
        enableOfflineSupport: boolean;
        maxOfflineQueueSize: number;
        offlineQueueMaxAge: number;
        requireHttps: boolean;
        maxPayloadSize: number;
        dailyLimit: number;
        monthlyLimit: number;
        burstLimit: number;
        burstWindowMs: number;
        enableCompression: boolean;
        compressionThreshold: number;
        compressionLevel: number;
        enableBatching: boolean;
        batchSize: number;
        batchTimeout: number;
        maxBatchPayloadSize: number;
        userId?: string | number | undefined;
        userEmail?: string | undefined;
        beforeSend?: ((data: ErrorData) => ErrorData | null) | undefined;
        customData?: Record<string, any> | undefined;
        commitHash?: string | undefined;
    };
    private getPublicConfig;
    destroy(): void;
}

interface RateLimiterConfig {
    maxRequests: number;
    windowMs: number;
    duplicateErrorWindow: number;
}
interface RateLimitInfo {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    reason?: string;
}
declare class RateLimiter {
    private config;
    private requests;
    private errorHashes;
    private cleanupInterval;
    constructor(config: RateLimiterConfig);
    private setupCleanupInterval;
    canSendError(errorData: ErrorData): RateLimitInfo;
    markErrorSent(errorData: ErrorData): void;
    private generateErrorHash;
    private extractStackSignature;
    private removeExpiredRequests;
    private getNextResetTime;
    cleanup(): void;
    getStats(): {
        requestCount: number;
        errorHashCount: number;
    };
    destroy(): void;
}

declare class OfflineManager {
    private maxQueueSize;
    private maxAge;
    private queue;
    private isOnline;
    private sendFunction;
    private processingQueue;
    private onlineListener;
    private offlineListener;
    constructor(maxQueueSize?: number, maxAge?: number);
    private setupNetworkListeners;
    setSendFunction(sendFunction: (errorData: ErrorData) => Promise<void>): void;
    handleError(errorData: ErrorData): Promise<void>;
    private queueError;
    private processQueue;
    private cleanupQueue;
    private generateId;
    private getStorageKey;
    private saveQueueToStorage;
    private loadQueueFromStorage;
    flushQueue(): Promise<void>;
    getQueueStats(): {
        size: number;
        oldestTimestamp: number | null;
        isOnline: boolean;
        isProcessing: boolean;
    };
    clearQueue(): void;
    destroy(): void;
}

interface RetryConfig {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitter: boolean;
}
interface RetryResult<T> {
    success: boolean;
    result?: T;
    error?: Error;
    attempts: number;
    totalTime: number;
}
declare class RetryManager {
    private config;
    constructor(config?: Partial<RetryConfig>);
    executeWithRetry<T>(operation: () => Promise<T>, customConfig?: Partial<RetryConfig>): Promise<RetryResult<T>>;
    private shouldNotRetry;
    private calculateDelay;
    private sleep;
    retry<T>(operation: () => Promise<T>): Promise<T>;
    makeRetryable<T extends any[], R>(fn: (...args: T) => Promise<R>, customConfig?: Partial<RetryConfig>): (...args: T) => Promise<R>;
    getConfig(): RetryConfig;
    updateConfig(updates: Partial<RetryConfig>): void;
}

interface SecurityConfig {
    requireHttps: boolean;
    validateToken: boolean;
    maxPayloadSize: number;
    allowedDomains?: string[];
    sensitiveDataPatterns: RegExp[];
}
interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
declare class SecurityValidator {
    private config;
    private defaultSensitivePatterns;
    constructor(config?: Partial<SecurityConfig>);
    validateConfiguration(config: ErrorExplorerConfig): ValidationResult;
    validatePayload(errorData: ErrorData): ValidationResult;
    sanitizeErrorData(errorData: ErrorData): ErrorData;
    private calculatePayloadSize;
    private detectSensitiveData;
    private sanitizeText;
    private sanitizeObject;
    addSensitivePattern(pattern: RegExp): void;
    removeSensitivePattern(pattern: RegExp): void;
    updateConfig(updates: Partial<SecurityConfig>): void;
    getConfig(): SecurityConfig;
}

interface QuotaConfig {
    dailyLimit: number;
    monthlyLimit: number;
    payloadSizeLimit: number;
    burstLimit: number;
    burstWindowMs: number;
}
interface QuotaStats {
    dailyUsage: number;
    monthlyUsage: number;
    dailyRemaining: number;
    monthlyRemaining: number;
    burstUsage: number;
    burstRemaining: number;
    isOverQuota: boolean;
    nextResetTime: number;
}
interface QuotaResult {
    allowed: boolean;
    reason?: string;
    quotaStats: QuotaStats;
}
declare class QuotaManager {
    private config;
    private dailyCount;
    private monthlyCount;
    private burstCounts;
    private lastResetDate;
    private lastResetMonth;
    private storageKey;
    constructor(config: QuotaConfig);
    canSendError(payloadSize?: number): QuotaResult;
    recordUsage(payloadSize?: number): void;
    private cleanupOldData;
    private cleanupBurstCounts;
    private getDateKey;
    private getMonthKey;
    getStats(): QuotaStats;
    resetQuotas(): void;
    private saveToStorage;
    private loadFromStorage;
    updateConfig(updates: Partial<QuotaConfig>): void;
    getConfig(): QuotaConfig;
    destroy(): void;
}

interface SDKMetrics extends PerformanceMetrics$1 {
    memoryUsage?: number;
}
declare class SDKMonitor {
    private metrics;
    private performanceEntries;
    private startTime;
    private healthCheckInterval;
    private readonly maxPerformanceEntries;
    constructor();
    private initializeMetrics;
    private setupHealthCheck;
    trackError(error: Error, context?: any): void;
    trackSuppressedError(reason: string): void;
    trackRetryAttempt(): void;
    trackPerformance(operation: string, duration: number, success?: boolean): void;
    updateOfflineQueueSize(size: number): void;
    private updateAverageResponseTime;
    private updateUptimeMetric;
    private updateMemoryUsage;
    private cleanupOldPerformanceEntries;
    getMetrics(): SDKMetrics;
    assessHealth(): SDKHealth;
    reset(): void;
    destroy(): void;
}

interface CircuitBreakerConfig {
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
    minimumRequests: number;
}
interface CircuitBreakerStats {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    totalRequests: number;
    failureRate: number;
    timeInCurrentState: number;
    nextRetryTime?: number;
}
type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
declare class CircuitBreaker {
    private config;
    private state;
    private failureCount;
    private successCount;
    private lastFailureTime;
    private stateChangeTime;
    private requests;
    constructor(config: CircuitBreakerConfig);
    execute<T>(operation: () => Promise<T>): Promise<T>;
    private onSuccess;
    private onFailure;
    private cleanupRequests;
    private shouldOpenCircuit;
    private shouldAttemptReset;
    canExecute(): boolean;
    getStats(): CircuitBreakerStats;
    reset(): void;
    forceOpen(): void;
    forceClose(): void;
    getState(): CircuitBreakerState;
    updateConfig(updates: Partial<CircuitBreakerConfig>): void;
    getConfig(): CircuitBreakerConfig;
}

interface CompressionConfig {
    enabled: boolean;
    threshold: number;
    level: number;
}
declare class CompressionService {
    private config;
    constructor(config?: Partial<CompressionConfig>);
    compress(data: string): Promise<string | ArrayBuffer>;
    private compressWithCompressionStream;
    private compressWithPako;
    getCompressionHeaders(isCompressed: boolean): Record<string, string>;
    estimateCompressionRatio(data: string): number;
    updateConfig(updates: Partial<CompressionConfig>): void;
    getConfig(): CompressionConfig;
}

interface BatchConfig {
    enabled: boolean;
    maxSize: number;
    maxWaitTime: number;
    maxPayloadSize: number;
}
interface BatchedErrorData {
    errors: ErrorData[];
    batchId: string;
    timestamp: string;
    count: number;
}
declare class BatchManager {
    private config;
    private currentBatch;
    private batchTimer;
    private sendFunction;
    private batchCounter;
    constructor(config?: Partial<BatchConfig>);
    setSendFunction(sendFn: (data: BatchedErrorData) => Promise<void>): void;
    addError(errorData: ErrorData): Promise<void>;
    private shouldSendBatch;
    private estimateBatchSize;
    private startBatchTimer;
    private sendCurrentBatch;
    flush(): Promise<void>;
    private generateBatchId;
    getStats(): {
        currentBatchSize: number;
        hasPendingBatch: boolean;
        timeUntilFlush: number;
        estimatedPayloadSize: number;
    };
    updateConfig(updates: Partial<BatchConfig>): void;
    getConfig(): BatchConfig;
    destroy(): void;
}

interface ErrorExplorerPlugin$2 {
    install(app: App, options: ErrorExplorerConfig): void;
}
declare const ErrorExplorerPlugin$2: ErrorExplorerPlugin$2;
declare function createErrorExplorer(config: ErrorExplorerConfig): ErrorReporter;
declare function getErrorExplorer(): ErrorReporter | null;
declare function captureException(error: Error, context?: Record<string, any>): Promise<void>;
declare function captureMessage(message: string, level?: 'debug' | 'info' | 'warning' | 'error', context?: Record<string, any>): Promise<void>;
declare function addBreadcrumb(message: string, category?: string, level?: 'debug' | 'info' | 'warning' | 'error', data?: Record<string, any>): void;
declare function setUser(user: Record<string, any>): void;
declare function getStats(): SDKStats;
declare function flushQueue(): Promise<void>;
declare function updateConfig(updates: Partial<ErrorExplorerConfig>): void;
declare function clearBreadcrumbs(): void;
declare function isEnabled(): boolean;
declare function setContext(key: string, value: any): void;
declare function removeContext(key: string): void;
declare function getSDKHealth(): SDKHealth;

interface ErrorExplorerComposable extends UseErrorExplorerResult {
}
declare function useErrorExplorer(): ErrorExplorerComposable;

interface PerformanceMetrics {
    startTime: number;
    endTime?: number;
    duration?: number;
    operation: string;
    metadata?: Record<string, any>;
}
declare class PerformanceMeasurement {
    private measurements;
    start(operation: string, metadata?: Record<string, any>): string;
    end(id: string): PerformanceMetrics | null;
    measure<T>(operation: string, fn: () => T | Promise<T>, metadata?: Record<string, any>): Promise<{
        result: T;
        performance: PerformanceMetrics;
    }>;
    private generateId;
    private getHighResolutionTime;
    cleanup(): void;
    getPendingMeasurements(): PerformanceMetrics[];
}
declare function debounce<T extends (...args: any[]) => any>(func: T, wait: number, immediate?: boolean): (...args: Parameters<T>) => void;
declare function throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void;
declare function safeStringify(obj: any, maxDepth?: number, maxLength?: number): string;
declare function generateSessionId(): string;
declare function extractErrorInfo(error: Error): {
    name: string;
    message: string;
    stack?: string;
    file?: string;
    line?: number;
    column?: number;
};
declare function getBrowserInfo(): {
    name: string;
    version: string;
    platform: string;
    mobile: boolean;
};
declare function getPerformanceInfo(): {
    memory?: number;
    timing?: any;
    navigation?: any;
};
declare function isDevelopment(): boolean;

var ErrorExplorerPlugin$1 = ErrorExplorerPlugin;
declare const install: any;

export { BatchManager, BreadcrumbManager, CircuitBreaker, CompressionService, ErrorExplorerPlugin$2 as ErrorExplorerPlugin, ErrorReporter, OfflineManager, PerformanceMeasurement, QuotaManager, RateLimiter, RetryManager, SDKMonitor, SecurityValidator, addBreadcrumb, captureException, captureMessage, clearBreadcrumbs, createErrorExplorer, debounce, ErrorExplorerPlugin$1 as default, extractErrorInfo, flushQueue, generateSessionId, getBrowserInfo, getErrorExplorer, getPerformanceInfo, getSDKHealth, getStats, install, isDevelopment, isEnabled, removeContext, safeStringify, setContext, setUser, throttle, updateConfig, useErrorExplorer };
export type { Breadcrumb, BrowserData, ErrorData, ErrorExplorerConfig, ErrorLevel, PerformanceMetrics$1 as PerformanceMetrics, QuotaStats$1 as QuotaStats, RequestData, SDKHealth, SDKStats, UseErrorExplorerResult, UserContext, VueErrorInfo };
