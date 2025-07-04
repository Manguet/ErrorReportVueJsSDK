import { App, ComponentInternalInstance } from 'vue';
import { ErrorReporter } from '../services/ErrorReporter';
import { ErrorExplorerConfig, VueErrorInfo, UseErrorExplorerResult, SDKStats, SDKHealth } from '../types';

let globalErrorReporter: ErrorReporter | null = null;

export interface ErrorExplorerPlugin {
  install(app: App, options: ErrorExplorerConfig): void;
}

export const ErrorExplorerPlugin: ErrorExplorerPlugin = {
  install(app: App, options: ErrorExplorerConfig) {
    // Initialize the error reporter
    globalErrorReporter = new ErrorReporter(options);
    
    // Set up Vue error handler
    const originalErrorHandler = app.config.errorHandler;
    
    app.config.errorHandler = (error: unknown, instance: ComponentInternalInstance | null, info: string) => {
      // Capture the error with Vue context
      if (error instanceof Error && globalErrorReporter) {
        const vueInfo: VueErrorInfo = {
          componentName: instance?.type?.name || instance?.type?.displayName || 'Unknown',
          propsData: instance?.props,
          lifecycle: info
        };
        
        globalErrorReporter.addBreadcrumb(
          `Vue Error in ${vueInfo.componentName}: ${info}`,
          'vue.error',
          'error',
          vueInfo
        );
        
        globalErrorReporter.captureException(error, {
          vue: vueInfo,
          error_info: info
        });
      }
      
      // Call original error handler if it exists
      if (originalErrorHandler) {
        originalErrorHandler(error, instance, info);
      }
    };
    
    // Set up navigation tracking for Vue Router if available
    app.mixin({
      beforeRouteEnter(to, from, next) {
        if (globalErrorReporter) {
          globalErrorReporter.getBreadcrumbManager().addNavigation(
            from.fullPath || 'initial',
            to.fullPath
          );
        }
        next();
      },
      beforeRouteUpdate(to, from, next) {
        if (globalErrorReporter) {
          globalErrorReporter.getBreadcrumbManager().addNavigation(
            from.fullPath,
            to.fullPath
          );
        }
        next();
      }
    });
    
    // Add global properties with all new methods
    const errorExplorerAPI: UseErrorExplorerResult = {
      captureException: (error: Error, context?: Record<string, any>) => {
        return globalErrorReporter?.captureException(error, context) || Promise.resolve();
      },
      captureMessage: (message: string, level: 'debug' | 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) => {
        return globalErrorReporter?.captureMessage(message, level, context) || Promise.resolve();
      },
      addBreadcrumb: (message: string, category?: string, level?: 'debug' | 'info' | 'warning' | 'error', data?: Record<string, any>) => {
        globalErrorReporter?.addBreadcrumb(message, category, level, data);
      },
      setUser: (user: Record<string, any>) => {
        globalErrorReporter?.setUser(user);
      },
      
      // New advanced methods
      getStats: () => {
        return globalErrorReporter?.getStats() || {
          queueSize: 0,
          isOnline: true,
          rateLimitRemaining: 0,
          rateLimitReset: Date.now(),
          quotaStats: {
            dailyUsage: 0,
            monthlyUsage: 0,
            dailyRemaining: 0,
            monthlyRemaining: 0,
            burstUsage: 0,
            burstRemaining: 0,
            isOverQuota: false,
            nextResetTime: Date.now()
          },
          circuitBreakerState: 'CLOSED',
          sdkHealth: {
            status: 'unhealthy' as const,
            score: 0,
            issues: ['SDK not initialized'],
            recommendations: ['Initialize ErrorExplorer plugin']
          },
          performanceMetrics: {
            errorsReported: 0,
            errorsSuppressed: 0,
            retryAttempts: 0,
            offlineQueueSize: 0,
            averageResponseTime: 0,
            uptime: 0
          }
        };
      },
      flushQueue: async () => {
        return globalErrorReporter?.flushQueue() || Promise.resolve();
      },
      updateConfig: (updates: Partial<ErrorExplorerConfig>) => {
        globalErrorReporter?.updateConfig(updates);
      },
      clearBreadcrumbs: () => {
        globalErrorReporter?.clearBreadcrumbs();
      },
      isEnabled: () => {
        return globalErrorReporter?.isEnabled() || false;
      },
      setContext: (key: string, value: any) => {
        globalErrorReporter?.setContext(key, value);
      },
      removeContext: (key: string) => {
        globalErrorReporter?.removeContext(key);
      },
      getSDKHealth: () => {
        return globalErrorReporter?.getSDKHealth() || {
          status: 'unhealthy' as const,
          score: 0,
          issues: ['SDK not initialized'],
          recommendations: ['Initialize ErrorExplorer plugin']
        };
      }
    };

    app.config.globalProperties.$errorExplorer = errorExplorerAPI;
    
    // Provide for composition API with the same complete API
    app.provide('errorExplorer', errorExplorerAPI);
  }
};

// Standalone functions
export function createErrorExplorer(config: ErrorExplorerConfig): ErrorReporter {
  globalErrorReporter = new ErrorReporter(config);
  return globalErrorReporter;
}

export function getErrorExplorer(): ErrorReporter | null {
  return globalErrorReporter;
}

export function captureException(error: Error, context?: Record<string, any>): Promise<void> {
  if (!globalErrorReporter) {
    console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
    return Promise.resolve();
  }
  return globalErrorReporter.captureException(error, context);
}

export function captureMessage(
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, any>
): Promise<void> {
  if (!globalErrorReporter) {
    console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
    return Promise.resolve();
  }
  return globalErrorReporter.captureMessage(message, level, context);
}

export function addBreadcrumb(
  message: string,
  category: string = 'custom',
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
  data?: Record<string, any>
): void {
  if (!globalErrorReporter) {
    console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
    return;
  }
  globalErrorReporter.addBreadcrumb(message, category, level, data);
}

export function setUser(user: Record<string, any>): void {
  if (!globalErrorReporter) {
    console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
    return;
  }
  globalErrorReporter.setUser(user);
}

// New advanced global functions

export function getStats(): SDKStats {
  if (!globalErrorReporter) {
    console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
    return {
      queueSize: 0,
      isOnline: true,
      rateLimitRemaining: 0,
      rateLimitReset: Date.now(),
      quotaStats: {
        dailyUsage: 0,
        monthlyUsage: 0,
        dailyRemaining: 0,
        monthlyRemaining: 0,
        burstUsage: 0,
        burstRemaining: 0,
        isOverQuota: false,
        nextResetTime: Date.now()
      },
      circuitBreakerState: 'CLOSED',
      sdkHealth: {
        status: 'unhealthy',
        score: 0,
        issues: ['SDK not initialized'],
        recommendations: ['Initialize ErrorExplorer plugin']
      },
      performanceMetrics: {
        errorsReported: 0,
        errorsSuppressed: 0,
        retryAttempts: 0,
        offlineQueueSize: 0,
        averageResponseTime: 0,
        uptime: 0
      }
    };
  }
  return globalErrorReporter.getStats();
}

export async function flushQueue(): Promise<void> {
  if (!globalErrorReporter) {
    console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
    return;
  }
  return globalErrorReporter.flushQueue();
}

export function updateConfig(updates: Partial<ErrorExplorerConfig>): void {
  if (!globalErrorReporter) {
    console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
    return;
  }
  globalErrorReporter.updateConfig(updates);
}

export function clearBreadcrumbs(): void {
  if (!globalErrorReporter) {
    console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
    return;
  }
  globalErrorReporter.clearBreadcrumbs();
}

export function isEnabled(): boolean {
  if (!globalErrorReporter) {
    return false;
  }
  return globalErrorReporter.isEnabled();
}

export function setContext(key: string, value: any): void {
  if (!globalErrorReporter) {
    console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
    return;
  }
  globalErrorReporter.setContext(key, value);
}

export function removeContext(key: string): void {
  if (!globalErrorReporter) {
    console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
    return;
  }
  globalErrorReporter.removeContext(key);
}

export function getSDKHealth(): SDKHealth {
  if (!globalErrorReporter) {
    return {
      status: 'unhealthy',
      score: 0,
      issues: ['SDK not initialized'],
      recommendations: ['Initialize ErrorExplorer plugin']
    };
  }
  return globalErrorReporter.getSDKHealth();
}