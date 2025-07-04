import { inject, getCurrentInstance } from 'vue';
import { UseErrorExplorerResult, SDKStats, SDKHealth, ErrorExplorerConfig } from '../types';

interface ErrorExplorerComposable extends UseErrorExplorerResult {}

export function useErrorExplorer(): ErrorExplorerComposable {
  // Try to get from injection first (Composition API)
  const injectedErrorExplorer = inject<ErrorExplorerComposable>('errorExplorer', null);
  
  if (injectedErrorExplorer) {
    return injectedErrorExplorer;
  }
  
  // Fallback to global properties (Options API)
  const instance = getCurrentInstance();
  if (instance?.appContext.app.config.globalProperties.$errorExplorer) {
    return instance.appContext.app.config.globalProperties.$errorExplorer;
  }
  
  // Fallback to global functions with all new methods
  return {
    // Core methods
    captureException: async (error: Error, context?: Record<string, any>) => {
      const { captureException } = await import('../plugin');
      return captureException(error, context);
    },
    captureMessage: async (message: string, level: 'debug' | 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) => {
      const { captureMessage } = await import('../plugin');
      return captureMessage(message, level, context);
    },
    addBreadcrumb: (message: string, category?: string, level?: 'debug' | 'info' | 'warning' | 'error', data?: Record<string, any>) => {
      import('../plugin').then(({ addBreadcrumb }) => {
        addBreadcrumb(message, category, level, data);
      });
    },
    setUser: (user: Record<string, any>) => {
      import('../plugin').then(({ setUser }) => {
        setUser(user);
      });
    },
    
    // New advanced methods
    getStats: (): SDKStats => {
      const { getStats } = require('../plugin');
      return getStats();
    },
    flushQueue: async (): Promise<void> => {
      const { flushQueue } = await import('../plugin');
      return flushQueue();
    },
    updateConfig: (updates: Partial<ErrorExplorerConfig>): void => {
      import('../plugin').then(({ updateConfig }) => {
        updateConfig(updates);
      });
    },
    clearBreadcrumbs: (): void => {
      import('../plugin').then(({ clearBreadcrumbs }) => {
        clearBreadcrumbs();
      });
    },
    isEnabled: (): boolean => {
      const { isEnabled } = require('../plugin');
      return isEnabled();
    },
    setContext: (key: string, value: any): void => {
      import('../plugin').then(({ setContext }) => {
        setContext(key, value);
      });
    },
    removeContext: (key: string): void => {
      import('../plugin').then(({ removeContext }) => {
        removeContext(key);
      });
    },
    getSDKHealth: (): SDKHealth => {
      const { getSDKHealth } = require('../plugin');
      return getSDKHealth();
    }
  };
}