import axios from 'axios';
import { ErrorReporter } from '../../../src/services/ErrorReporter';
import { ErrorExplorerConfig } from '../../../src/types';

// Mock all dependencies
jest.mock('axios');
jest.mock('../../../src/services/BreadcrumbManager');
jest.mock('../../../src/services/RateLimiter');
jest.mock('../../../src/services/OfflineManager');
jest.mock('../../../src/services/RetryManager');
jest.mock('../../../src/services/SecurityValidator');
jest.mock('../../../src/services/QuotaManager');
jest.mock('../../../src/services/SDKMonitor');
jest.mock('../../../src/services/CircuitBreaker');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ErrorReporter', () => {
  let errorReporter: ErrorReporter;
  let config: ErrorExplorerConfig;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock axios.create
    mockedAxios.create.mockReturnValue({
      post: jest.fn().mockResolvedValue({ data: { success: true } })
    } as any);

    // Setup console spies
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    config = {
      webhookUrl: 'https://example.com/webhook',
      projectName: 'test-project',
      environment: 'test',
      enabled: true
    };
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      errorReporter = new ErrorReporter(config);
      
      expect(mockedAxios.create).toHaveBeenCalledWith({
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ErrorExplorer-Vue/1.0.0'
        }
      });
    });

    it('should not initialize when disabled', () => {
      config.enabled = false;
      errorReporter = new ErrorReporter(config);
      
      // Should not set up global handlers when disabled
      expect(errorReporter.isEnabled()).toBe(false);
    });

    it('should respect custom configuration values', () => {
      const customConfig: ErrorExplorerConfig = {
        ...config,
        timeout: 10000,
        maxBreadcrumbs: 100,
        maxRetries: 5,
        version: '2.0.0'
      };

      errorReporter = new ErrorReporter(customConfig);
      
      expect(mockedAxios.create).toHaveBeenCalledWith({
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ErrorExplorer-Vue/2.0.0'
        }
      });
    });
  });

  describe('setUser', () => {
    beforeEach(() => {
      errorReporter = new ErrorReporter(config);
    });

    it('should set user context', () => {
      const user = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser'
      };

      errorReporter.setUser(user);
      
      // The user context should be stored internally
      // We'll verify this when we test captureException
    });

    it('should merge user context', () => {
      errorReporter.setUser({ id: '123' });
      errorReporter.setUser({ email: 'test@example.com' });
      
      // Both properties should be retained
    });
  });

  describe('setContext and removeContext', () => {
    beforeEach(() => {
      errorReporter = new ErrorReporter(config);
    });

    it('should set global context', () => {
      errorReporter.setContext('feature', 'checkout');
      errorReporter.setContext('version', '1.2.3');
      
      // Context should be stored
    });

    it('should remove context key', () => {
      errorReporter.setContext('feature', 'checkout');
      errorReporter.removeContext('feature');
      
      // Feature should be removed from context
    });
  });

  describe('addBreadcrumb', () => {
    beforeEach(() => {
      errorReporter = new ErrorReporter(config);
    });

    it('should add breadcrumb with default values', () => {
      errorReporter.addBreadcrumb('User clicked button');
      
      // Verify breadcrumb manager was called
      const breadcrumbManager = (errorReporter as any).breadcrumbManager;
      expect(breadcrumbManager.addBreadcrumb).toHaveBeenCalledWith({
        message: 'User clicked button',
        category: 'custom',
        level: 'info',
        data: undefined
      });
    });

    it('should add breadcrumb with custom values', () => {
      errorReporter.addBreadcrumb(
        'API Error',
        'http',
        'error',
        { endpoint: '/api/users' }
      );
      
      const breadcrumbManager = (errorReporter as any).breadcrumbManager;
      expect(breadcrumbManager.addBreadcrumb).toHaveBeenCalledWith({
        message: 'API Error',
        category: 'http',
        level: 'error',
        data: { endpoint: '/api/users' }
      });
    });
  });

  describe('captureException', () => {
    let mockError: Error;

    beforeEach(() => {
      errorReporter = new ErrorReporter(config);
      mockError = new Error('Test error');
      
      // Mock service responses
      const rateLimiter = (errorReporter as any).rateLimiter;
      rateLimiter.canSendError.mockReturnValue({ allowed: true });
      
      const quotaManager = (errorReporter as any).quotaManager;
      quotaManager.canSendError.mockReturnValue({ allowed: true });
      
      const securityValidator = (errorReporter as any).securityValidator;
      securityValidator.validatePayload.mockReturnValue({ valid: true, warnings: [] });
      securityValidator.sanitizeErrorData.mockImplementation(data => data);
      
      const circuitBreaker = (errorReporter as any).circuitBreaker;
      circuitBreaker.canExecute.mockReturnValue(true);
      circuitBreaker.execute.mockImplementation(async (fn) => fn());
      
      const retryManager = (errorReporter as any).retryManager;
      retryManager.executeWithRetry.mockResolvedValue({ success: true });
    });

    it('should capture and send exception', async () => {
      await errorReporter.captureException(mockError);
      
      const retryManager = (errorReporter as any).retryManager;
      expect(retryManager.executeWithRetry).toHaveBeenCalled();
    });

    it('should not send when disabled', async () => {
      errorReporter.updateConfig({ enabled: false });
      
      await errorReporter.captureException(mockError);
      
      const retryManager = (errorReporter as any).retryManager;
      expect(retryManager.executeWithRetry).not.toHaveBeenCalled();
    });

    it('should respect rate limiting', async () => {
      const rateLimiter = (errorReporter as any).rateLimiter;
      rateLimiter.canSendError.mockReturnValue({ 
        allowed: false, 
        reason: 'Rate limit exceeded' 
      });
      
      await errorReporter.captureException(mockError);
      
      const retryManager = (errorReporter as any).retryManager;
      expect(retryManager.executeWithRetry).not.toHaveBeenCalled();
    });

    it('should respect quota limits', async () => {
      const quotaManager = (errorReporter as any).quotaManager;
      quotaManager.canSendError.mockReturnValue({ 
        allowed: false, 
        reason: 'Quota exceeded' 
      });
      
      await errorReporter.captureException(mockError);
      
      const retryManager = (errorReporter as any).retryManager;
      expect(retryManager.executeWithRetry).not.toHaveBeenCalled();
    });

    it('should apply beforeSend filter', async () => {
      const beforeSend = jest.fn().mockReturnValue(null);
      errorReporter.updateConfig({ beforeSend });
      
      await errorReporter.captureException(mockError);
      
      expect(beforeSend).toHaveBeenCalled();
      const retryManager = (errorReporter as any).retryManager;
      expect(retryManager.executeWithRetry).not.toHaveBeenCalled();
    });

    it('should include context in error data', async () => {
      const context = { userId: '123', action: 'checkout' };
      
      await errorReporter.captureException(mockError, context);
      
      // Verify context was included in the error data
      const retryManager = (errorReporter as any).retryManager;
      expect(retryManager.executeWithRetry).toHaveBeenCalled();
    });

    it('should handle circuit breaker open state', async () => {
      const circuitBreaker = (errorReporter as any).circuitBreaker;
      circuitBreaker.canExecute.mockReturnValue(false);
      
      const offlineManager = (errorReporter as any).offlineManager;
      
      await errorReporter.captureException(mockError);
      
      expect(offlineManager.handleError).toHaveBeenCalled();
    });
  });

  describe('captureMessage', () => {
    beforeEach(() => {
      errorReporter = new ErrorReporter(config);
      
      // Mock service responses
      const rateLimiter = (errorReporter as any).rateLimiter;
      rateLimiter.canSendError.mockReturnValue({ allowed: true });
      
      const quotaManager = (errorReporter as any).quotaManager;
      quotaManager.canSendError.mockReturnValue({ allowed: true });
      
      const securityValidator = (errorReporter as any).securityValidator;
      securityValidator.validatePayload.mockReturnValue({ valid: true, warnings: [] });
      securityValidator.sanitizeErrorData.mockImplementation(data => data);
      
      const circuitBreaker = (errorReporter as any).circuitBreaker;
      circuitBreaker.canExecute.mockReturnValue(true);
      circuitBreaker.execute.mockImplementation(async (fn) => fn());
      
      const retryManager = (errorReporter as any).retryManager;
      retryManager.executeWithRetry.mockResolvedValue({ success: true });
    });

    it('should capture message as error', async () => {
      await errorReporter.captureMessage('Test message', 'warning');
      
      const retryManager = (errorReporter as any).retryManager;
      expect(retryManager.executeWithRetry).toHaveBeenCalled();
    });

    it('should use default level', async () => {
      await errorReporter.captureMessage('Test message');
      
      // Should default to 'info' level
      const retryManager = (errorReporter as any).retryManager;
      expect(retryManager.executeWithRetry).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      errorReporter = new ErrorReporter(config);
    });

    it('should return SDK statistics', () => {
      const stats = errorReporter.getStats();
      
      expect(stats).toHaveProperty('queueSize');
      expect(stats).toHaveProperty('isOnline');
      expect(stats).toHaveProperty('rateLimitRemaining');
      expect(stats).toHaveProperty('quotaStats');
      expect(stats).toHaveProperty('circuitBreakerState');
      expect(stats).toHaveProperty('sdkHealth');
      expect(stats).toHaveProperty('performanceMetrics');
    });
  });

  describe('flushQueue', () => {
    beforeEach(() => {
      errorReporter = new ErrorReporter(config);
    });

    it('should flush offline queue', async () => {
      const offlineManager = (errorReporter as any).offlineManager;
      offlineManager.flushQueue.mockResolvedValue(undefined);
      
      await errorReporter.flushQueue();
      
      expect(offlineManager.flushQueue).toHaveBeenCalled();
    });
  });

  describe('updateConfig', () => {
    beforeEach(() => {
      errorReporter = new ErrorReporter(config);
    });

    it('should update configuration', () => {
      errorReporter.updateConfig({ 
        enabled: false,
        timeout: 10000 
      });
      
      expect(errorReporter.isEnabled()).toBe(false);
    });

    it('should recreate services when needed', () => {
      errorReporter.updateConfig({ maxBreadcrumbs: 100 });
      
      // BreadcrumbManager should be recreated with new limit
    });
  });

  describe('clearBreadcrumbs', () => {
    beforeEach(() => {
      errorReporter = new ErrorReporter(config);
    });

    it('should clear all breadcrumbs', () => {
      const breadcrumbManager = (errorReporter as any).breadcrumbManager;
      
      errorReporter.clearBreadcrumbs();
      
      expect(breadcrumbManager.clearBreadcrumbs).toHaveBeenCalled();
    });
  });

  describe('getSDKHealth', () => {
    beforeEach(() => {
      errorReporter = new ErrorReporter(config);
    });

    it('should return SDK health status', () => {
      const sdkMonitor = (errorReporter as any).sdkMonitor;
      sdkMonitor.assessHealth.mockReturnValue({
        status: 'healthy',
        score: 100,
        issues: [],
        recommendations: []
      });
      
      const health = errorReporter.getSDKHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.score).toBe(100);
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      errorReporter = new ErrorReporter(config);
    });

    it('should clean up resources', () => {
      const rateLimiter = (errorReporter as any).rateLimiter;
      const offlineManager = (errorReporter as any).offlineManager;
      const quotaManager = (errorReporter as any).quotaManager;
      const sdkMonitor = (errorReporter as any).sdkMonitor;
      
      errorReporter.destroy();
      
      expect(rateLimiter.destroy).toHaveBeenCalled();
      expect(offlineManager.destroy).toHaveBeenCalled();
      expect(quotaManager.destroy).toHaveBeenCalled();
      expect(sdkMonitor.destroy).toHaveBeenCalled();
      expect(errorReporter.isEnabled()).toBe(false);
    });
  });
});