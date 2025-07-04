import axios, { AxiosInstance } from 'axios';
import { ErrorExplorerConfig, ErrorData, RequestData, BrowserData, UserContext, SDKStats, SDKHealth, QuotaStats } from '../types';
import { BreadcrumbManager } from './BreadcrumbManager';
import { RateLimiter } from './RateLimiter';
import { OfflineManager } from './OfflineManager';
import { RetryManager } from './RetryManager';
import { SecurityValidator } from './SecurityValidator';
import { QuotaManager } from './QuotaManager';
import { SDKMonitor } from './SDKMonitor';
import { CircuitBreaker } from './CircuitBreaker';
import { CompressionService, CompressionConfig } from './CompressionService';
import { BatchManager, BatchConfig, BatchedErrorData } from './BatchManager';
import { generateSessionId, extractErrorInfo, getBrowserInfo, getPerformanceInfo, safeStringify } from '../utils/performance';

export class ErrorReporter {
  private config: Required<Omit<ErrorExplorerConfig, 'userId' | 'userEmail' | 'beforeSend' | 'customData' | 'commitHash'>> & 
    Pick<ErrorExplorerConfig, 'userId' | 'userEmail' | 'beforeSend' | 'customData' | 'commitHash'>;
  
  private breadcrumbManager: BreadcrumbManager;
  private rateLimiter: RateLimiter;
  private offlineManager: OfflineManager;
  private retryManager: RetryManager;
  private securityValidator: SecurityValidator;
  private quotaManager: QuotaManager;
  private sdkMonitor: SDKMonitor;
  private circuitBreaker: CircuitBreaker;
  private compressionService: CompressionService;
  private batchManager: BatchManager;
  
  private httpClient: AxiosInstance;
  private userContext: UserContext = {};
  private globalContext: Record<string, any> = {};
  private sessionId: string;
  private isInitialized: boolean = false;

  constructor(config: ErrorExplorerConfig) {
    this.sessionId = generateSessionId();
    
    // Set up configuration with defaults
    this.config = {
      environment: 'production',
      enabled: true,
      maxBreadcrumbs: 50,
      timeout: 5000,
      retries: 3,
      captureUnhandledRejections: true,
      captureConsoleErrors: false,
      debug: false,
      version: '1.0.0',
      
      // Rate limiting defaults
      maxRequestsPerMinute: 10,
      duplicateErrorWindow: 5000,
      
      // Retry defaults
      maxRetries: 3,
      initialRetryDelay: 1000,
      maxRetryDelay: 30000,
      
      // Offline support defaults
      enableOfflineSupport: true,
      maxOfflineQueueSize: 50,
      offlineQueueMaxAge: 24 * 60 * 60 * 1000,
      
      // Security defaults
      requireHttps: config.environment === 'production',
      maxPayloadSize: 1024 * 1024, // 1MB
      
      // Quota defaults
      dailyLimit: 1000,
      monthlyLimit: 10000,
      burstLimit: 50,
      burstWindowMs: 60000,
      
      // Compression defaults
      enableCompression: true,
      compressionThreshold: 1024,
      compressionLevel: 6,
      
      // Batching defaults
      enableBatching: true,
      batchSize: 5,
      batchTimeout: 5000,
      maxBatchPayloadSize: 100 * 1024,
      
      ...config
    };

    this.initializeServices();
    this.setupHttpClient();
    this.initialize();
  }

  private initializeServices(): void {
    // Initialize all services
    this.breadcrumbManager = new BreadcrumbManager(this.config.maxBreadcrumbs);
    
    this.rateLimiter = new RateLimiter({
      maxRequests: this.config.maxRequestsPerMinute,
      windowMs: 60000,
      duplicateErrorWindow: this.config.duplicateErrorWindow
    });
    
    this.offlineManager = new OfflineManager(
      this.config.maxOfflineQueueSize,
      this.config.offlineQueueMaxAge
    );
    
    this.retryManager = new RetryManager({
      maxRetries: this.config.maxRetries,
      initialDelay: this.config.initialRetryDelay,
      maxDelay: this.config.maxRetryDelay,
      backoffMultiplier: 2,
      jitter: true
    });
    
    this.securityValidator = new SecurityValidator({
      requireHttps: this.config.requireHttps,
      validateToken: true,
      maxPayloadSize: this.config.maxPayloadSize
    });
    
    this.quotaManager = new QuotaManager({
      dailyLimit: this.config.dailyLimit,
      monthlyLimit: this.config.monthlyLimit,
      payloadSizeLimit: this.config.maxPayloadSize,
      burstLimit: this.config.burstLimit,
      burstWindowMs: this.config.burstWindowMs
    });
    
    this.sdkMonitor = new SDKMonitor();
    
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 60000,
      minimumRequests: 3
    });
    
    this.compressionService = new CompressionService({
      enabled: this.config.enableCompression,
      threshold: this.config.compressionThreshold,
      level: this.config.compressionLevel
    });
    
    this.batchManager = new BatchManager({
      enabled: this.config.enableBatching,
      maxSize: this.config.batchSize,
      maxWaitTime: this.config.batchTimeout,
      maxPayloadSize: this.config.maxBatchPayloadSize
    });
    
    // Set up offline manager's send function
    this.offlineManager.setSendFunction((errorData) => this.sendErrorDirectly(errorData));
    
    // Set up batch manager's send function
    this.batchManager.setSendFunction((batchData) => this.sendBatchDirectly(batchData));
  }

  private setupHttpClient(): void {
    this.httpClient = axios.create({
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `ErrorExplorer-Vue/${this.config.version || '1.0.0'}`
      }
    });
  }

  private initialize(): void {
    if (!this.config.enabled) {
      return;
    }

    // Validate configuration
    const configValidation = this.securityValidator.validateConfiguration(this.config);
    if (!configValidation.valid) {
      if (this.config.debug) {
        console.error('[ErrorExplorer] Configuration validation failed:', configValidation.errors);
      }
      return;
    }

    if (configValidation.warnings.length > 0 && this.config.debug) {
      console.warn('[ErrorExplorer] Configuration warnings:', configValidation.warnings);
    }

    // Set up global error handlers
    this.setupGlobalHandlers();
    
    // Set initial user context
    if (this.config.userId || this.config.userEmail) {
      this.setUser({
        id: this.config.userId,
        email: this.config.userEmail
      });
    }
    
    // Set initial custom data
    if (this.config.customData) {
      this.globalContext = { ...this.config.customData };
    }

    this.isInitialized = true;

    if (this.config.debug) {
      console.log('[ErrorExplorer] Initialized successfully', {
        config: this.getPublicConfig(),
        sessionId: this.sessionId
      });
    }
  }

  private setupGlobalHandlers(): void {
    if (typeof window === 'undefined') return;

    // Handle unhandled promise rejections
    if (this.config.captureUnhandledRejections) {
      window.addEventListener('unhandledrejection', (event) => {
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
        this.captureException(error, { type: 'unhandledRejection' });
      });
    }

    // Handle global errors
    window.addEventListener('error', (event) => {
      if (event.error) {
        this.captureException(event.error, {
          type: 'globalError',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      }
    });

    // Capture console errors if enabled
    if (this.config.captureConsoleErrors) {
      this.setupConsoleCapture();
    }
  }

  private setupConsoleCapture(): void {
    const originalError = console.error;
    console.error = (...args: any[]) => {
      this.breadcrumbManager.addConsoleLog('error', args.join(' '), args);
      originalError.apply(console, args);
    };

    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      this.breadcrumbManager.addConsoleLog('warning', args.join(' '), args);
      originalWarn.apply(console, args);
    };
  }

  setUser(user: UserContext): void {
    this.userContext = { ...this.userContext, ...user };
    
    if (this.config.debug) {
      console.log('[ErrorExplorer] User context updated:', this.userContext);
    }
  }

  setContext(key: string, value: any): void {
    this.globalContext[key] = value;
  }

  removeContext(key: string): void {
    delete this.globalContext[key];
  }

  addBreadcrumb(
    message: string,
    category: string = 'custom',
    level: 'debug' | 'info' | 'warning' | 'error' = 'info',
    data?: Record<string, any>
  ): void {
    this.breadcrumbManager.addBreadcrumb({
      message,
      category,
      level,
      data
    });
  }

  async captureException(error: Error, context?: Record<string, any>): Promise<void> {
    if (!this.config.enabled || !this.isInitialized) {
      return;
    }

    const performanceStart = performance.now();
    
    try {
      // Monitor the error
      this.sdkMonitor.trackError(error, context);
      
      // Format error data
      const errorData = this.formatError(error, context);
      
      // Validate payload
      const payloadValidation = this.securityValidator.validatePayload(errorData);
      if (!payloadValidation.valid) {
        this.sdkMonitor.trackSuppressedError('Payload validation failed');
        if (this.config.debug) {
          console.warn('[ErrorExplorer] Payload validation failed:', payloadValidation.errors);
        }
        return;
      }

      if (payloadValidation.warnings.length > 0 && this.config.debug) {
        console.warn('[ErrorExplorer] Payload warnings:', payloadValidation.warnings);
      }

      // Sanitize data
      const sanitizedData = this.securityValidator.sanitizeErrorData(errorData);
      
      // Apply beforeSend filter
      let finalData = sanitizedData;
      if (this.config.beforeSend) {
        const processedData = this.config.beforeSend(sanitizedData);
        if (!processedData) {
          this.sdkMonitor.trackSuppressedError('Filtered by beforeSend');
          return;
        }
        finalData = processedData;
      }

      // Check rate limits
      const rateLimitResult = this.rateLimiter.canSendError(finalData);
      if (!rateLimitResult.allowed) {
        this.sdkMonitor.trackSuppressedError(rateLimitResult.reason || 'Rate limited');
        if (this.config.debug) {
          console.warn('[ErrorExplorer] Error suppressed:', rateLimitResult.reason);
        }
        return;
      }

      // Check quota
      const payloadSize = new Blob([JSON.stringify(finalData)]).size;
      const quotaResult = this.quotaManager.canSendError(payloadSize);
      if (!quotaResult.allowed) {
        this.sdkMonitor.trackSuppressedError(quotaResult.reason || 'Quota exceeded');
        if (this.config.debug) {
          console.warn('[ErrorExplorer] Error suppressed:', quotaResult.reason);
        }
        return;
      }

      // Mark rate limit and quota usage
      this.rateLimiter.markErrorSent(finalData);
      this.quotaManager.recordUsage(payloadSize);

      // Send error (with batching, circuit breaker and offline support)
      await this.sendError(finalData);
      
      // Track performance
      const performanceEnd = performance.now();
      this.sdkMonitor.trackPerformance('captureException', performanceEnd - performanceStart, true);
      
    } catch (sendError) {
      const performanceEnd = performance.now();
      this.sdkMonitor.trackPerformance('captureException', performanceEnd - performanceStart, false);
      
      if (this.config.debug) {
        console.error('[ErrorExplorer] Failed to capture exception:', sendError);
      }
    }
  }

  async captureMessage(
    message: string,
    level: 'debug' | 'info' | 'warning' | 'error' = 'info',
    context?: Record<string, any>
  ): Promise<void> {
    const error = new Error(message);
    error.name = 'CapturedMessage';
    return this.captureException(error, { ...context, level, messageLevel: level });
  }

  private formatError(error: Error, context?: Record<string, any>): ErrorData {
    const errorInfo = extractErrorInfo(error);
    const browserInfo = getBrowserInfo();
    const performanceInfo = getPerformanceInfo();

    const errorData: ErrorData = {
      message: errorInfo.message,
      exception_class: errorInfo.name,
      stack_trace: errorInfo.stack || '',
      file: errorInfo.file || 'unknown',
      line: errorInfo.line || 0,
      project: this.config.projectName,
      environment: this.config.environment,
      timestamp: new Date().toISOString(),
      browser: this.getBrowserData(),
      breadcrumbs: this.breadcrumbManager.getBreadcrumbs(),
      user: Object.keys(this.userContext).length > 0 ? this.userContext : undefined,
      context: {
        ...this.globalContext,
        ...context,
        sessionId: this.sessionId,
        sdkVersion: this.config.version,
        performanceInfo
      },
      commitHash: this.config.commitHash,
      version: this.config.version,
      sessionId: this.sessionId,
      customData: this.config.customData
    };

    // Add request data
    if (typeof window !== 'undefined') {
      errorData.request = this.getRequestData();
    }

    return errorData;
  }

  private async sendError(errorData: ErrorData): Promise<void> {
    // If batching is enabled, add to batch
    if (this.config.enableBatching) {
      await this.batchManager.addError(errorData);
      return;
    }

    // Otherwise send immediately
    if (!this.circuitBreaker.canExecute()) {
      // Circuit breaker is open, queue for offline processing
      await this.offlineManager.handleError(errorData);
      return;
    }

    try {
      await this.circuitBreaker.execute(async () => {
        if (this.config.enableOfflineSupport) {
          await this.offlineManager.handleError(errorData);
        } else {
          await this.sendErrorDirectly(errorData);
        }
      });
    } catch (error) {
      this.sdkMonitor.trackRetryAttempt();
      
      if (this.config.debug) {
        console.error('[ErrorExplorer] Failed to send error:', error);
      }
      
      // If direct sending fails and offline is disabled, try retry logic
      if (!this.config.enableOfflineSupport) {
        try {
          await this.retryManager.retry(() => this.sendErrorDirectly(errorData));
        } catch (retryError) {
          if (this.config.debug) {
            console.error('[ErrorExplorer] All retry attempts failed:', retryError);
          }
        }
      }
    }
  }

  private async sendErrorDirectly(errorData: ErrorData): Promise<void> {
    const result = await this.retryManager.executeWithRetry(async () => {
      return await this.sendWithCompression(errorData);
    });

    if (!result.success) {
      throw result.error;
    }
  }

  private async sendBatchDirectly(batchData: BatchedErrorData): Promise<void> {
    const result = await this.retryManager.executeWithRetry(async () => {
      return await this.sendWithCompression(batchData);
    });

    if (!result.success) {
      throw result.error;
    }
  }

  private async sendWithCompression(data: ErrorData | BatchedErrorData): Promise<any> {
    const jsonData = JSON.stringify(data);
    const compressed = await this.compressionService.compress(jsonData);
    const isCompressed = compressed !== jsonData;
    
    const headers = {
      ...this.compressionService.getCompressionHeaders(isCompressed),
      ...this.httpClient.defaults.headers
    };

    if (isCompressed && compressed instanceof ArrayBuffer) {
      // Send binary data
      return await this.httpClient.post(this.config.webhookUrl, compressed, {
        headers: {
          ...headers,
          'Content-Type': 'application/octet-stream'
        }
      });
    } else {
      // Send as JSON (either uncompressed or base64 compressed)
      return await this.httpClient.post(this.config.webhookUrl, compressed, {
        headers
      });
    }
  }

  private getRequestData(): RequestData {
    if (typeof window === 'undefined') return {};

    return {
      url: window.location.href,
      referrer: document.referrer,
      user_agent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }

  private getBrowserData(): BrowserData {
    if (typeof window === 'undefined') {
      return {
        name: 'Unknown',
        version: 'Unknown',
        platform: 'Unknown',
        language: 'Unknown',
        cookies_enabled: false,
        online: false,
        screen: { width: 0, height: 0, color_depth: 0 }
      };
    }

    const browserInfo = getBrowserInfo();
    
    return {
      name: browserInfo.name,
      version: browserInfo.version,
      platform: browserInfo.platform,
      language: navigator.language,
      cookies_enabled: navigator.cookieEnabled,
      online: navigator.onLine,
      screen: {
        width: screen.width,
        height: screen.height,
        color_depth: screen.colorDepth
      }
    };
  }

  // New advanced API methods

  getStats(): SDKStats {
    const offlineStats = this.offlineManager.getQueueStats();
    const quotaStats = this.quotaManager.getStats();
    const circuitBreakerStats = this.circuitBreaker.getStats();
    const rateLimitStats = this.rateLimiter.getStats();
    const sdkMetrics = this.sdkMonitor.getMetrics();
    const sdkHealth = this.sdkMonitor.assessHealth();

    this.sdkMonitor.updateOfflineQueueSize(offlineStats.size);

    return {
      queueSize: offlineStats.size,
      isOnline: offlineStats.isOnline,
      rateLimitRemaining: 10 - rateLimitStats.requestCount, // Approximate
      rateLimitReset: Date.now() + 60000, // Next minute
      quotaStats,
      circuitBreakerState: circuitBreakerStats.state,
      sdkHealth,
      performanceMetrics: sdkMetrics
    };
  }

  async flushQueue(): Promise<void> {
    await this.offlineManager.flushQueue();
    await this.batchManager.flush();
  }

  updateConfig(updates: Partial<ErrorExplorerConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Update dependent services
    if (updates.maxBreadcrumbs) {
      this.breadcrumbManager = new BreadcrumbManager(updates.maxBreadcrumbs);
    }
    
    if (updates.maxRequestsPerMinute || updates.duplicateErrorWindow) {
      this.rateLimiter.destroy();
      this.rateLimiter = new RateLimiter({
        maxRequests: this.config.maxRequestsPerMinute,
        windowMs: 60000,
        duplicateErrorWindow: this.config.duplicateErrorWindow
      });
    }

    if (this.config.debug) {
      console.log('[ErrorExplorer] Configuration updated:', updates);
    }
  }

  clearBreadcrumbs(): void {
    this.breadcrumbManager.clearBreadcrumbs();
  }

  isEnabled(): boolean {
    return this.config.enabled && this.isInitialized;
  }

  getSDKHealth(): SDKHealth {
    return this.sdkMonitor.assessHealth();
  }

  getBreadcrumbManager(): BreadcrumbManager {
    return this.breadcrumbManager;
  }

  getConfig() {
    return this.getPublicConfig();
  }

  private getPublicConfig() {
    const { webhookUrl, ...publicConfig } = this.config;
    return {
      ...publicConfig,
      webhookUrl: webhookUrl ? '[CONFIGURED]' : '[NOT SET]'
    };
  }

  destroy(): void {
    this.rateLimiter.destroy();
    this.offlineManager.destroy();
    this.quotaManager.destroy();
    this.sdkMonitor.destroy();
    this.batchManager.destroy();
    this.breadcrumbManager.clearBreadcrumbs();
    this.isInitialized = false;

    if (this.config.debug) {
      console.log('[ErrorExplorer] SDK destroyed');
    }
  }
}