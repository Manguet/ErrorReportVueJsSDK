// Main exports
export { ErrorReporter } from './services/ErrorReporter';
export { BreadcrumbManager } from './services/BreadcrumbManager';

// New advanced services
export { RateLimiter } from './services/RateLimiter';
export { OfflineManager } from './services/OfflineManager';
export { RetryManager } from './services/RetryManager';
export { SecurityValidator } from './services/SecurityValidator';
export { QuotaManager } from './services/QuotaManager';
export { SDKMonitor } from './services/SDKMonitor';
export { CircuitBreaker } from './services/CircuitBreaker';
export { CompressionService } from './services/CompressionService';
export { BatchManager } from './services/BatchManager';

// Plugin and composables
export {
  ErrorExplorerPlugin,
  createErrorExplorer,
  getErrorExplorer,
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  // New advanced functions
  getStats,
  flushQueue,
  updateConfig,
  clearBreadcrumbs,
  isEnabled,
  setContext,
  removeContext,
  getSDKHealth
} from './plugin';
export { useErrorExplorer } from './composables/useErrorExplorer';

// Utilities
export {
  safeStringify,
  extractErrorInfo,
  getBrowserInfo,
  getPerformanceInfo,
  debounce,
  throttle,
  generateSessionId,
  isDevelopment,
  PerformanceMeasurement
} from './utils/performance';

// Types
export type {
  ErrorExplorerConfig,
  ErrorData,
  RequestData,
  BrowserData,
  UserContext,
  Breadcrumb,
  VueErrorInfo,
  ErrorLevel,
  // New advanced types
  SDKStats,
  QuotaStats,
  SDKHealth,
  PerformanceMetrics,
  UseErrorExplorerResult
} from './types';

// Default export for convenience
export default ErrorExplorerPlugin;

// Vue 3 plugin for app.use()
export const install = ErrorExplorerPlugin.install;