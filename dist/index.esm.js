import axios from 'axios';
import { inject, getCurrentInstance } from 'vue';

class BreadcrumbManager {
    constructor(maxBreadcrumbs = 50) {
        this.breadcrumbs = [];
        this.maxBreadcrumbs = maxBreadcrumbs;
    }
    addBreadcrumb(breadcrumb) {
        const fullBreadcrumb = {
            ...breadcrumb,
            timestamp: new Date().toISOString()
        };
        this.breadcrumbs.push(fullBreadcrumb);
        if (this.breadcrumbs.length > this.maxBreadcrumbs) {
            this.breadcrumbs.shift();
        }
    }
    getBreadcrumbs() {
        return [...this.breadcrumbs];
    }
    clear() {
        this.breadcrumbs = [];
    }
    addNavigation(from, to) {
        this.addBreadcrumb({
            message: `Navigation: ${from} → ${to}`,
            category: 'navigation',
            level: 'info',
            data: {
                from,
                to
            }
        });
    }
    addUserInteraction(event, target, data) {
        this.addBreadcrumb({
            message: `User ${event} on ${target}`,
            category: 'user',
            level: 'info',
            data: {
                event,
                target,
                ...data
            }
        });
    }
    addHttpRequest(method, url, statusCode) {
        this.addBreadcrumb({
            message: `${method} ${url}${statusCode ? ` → ${statusCode}` : ''}`,
            category: 'http',
            level: statusCode && statusCode >= 400 ? 'error' : 'info',
            data: {
                method,
                url,
                status_code: statusCode
            }
        });
    }
    addComponentLifecycle(componentName, lifecycle) {
        this.addBreadcrumb({
            message: `${componentName}: ${lifecycle}`,
            category: 'vue.lifecycle',
            level: 'debug',
            data: {
                component: componentName,
                lifecycle
            }
        });
    }
    addVueEvent(componentName, eventName, data) {
        this.addBreadcrumb({
            message: `${componentName} emitted ${eventName}`,
            category: 'vue.event',
            level: 'info',
            data: {
                component: componentName,
                event: eventName,
                event_data: data
            }
        });
    }
    addConsoleLog(level, message, data) {
        this.addBreadcrumb({
            message,
            category: 'console',
            level: level,
            data: data ? { data } : undefined
        });
    }
    addCustom(message, data) {
        this.addBreadcrumb({
            message,
            category: 'custom',
            level: 'info',
            data
        });
    }
    clearBreadcrumbs() {
        this.clear();
    }
}

class RateLimiter {
    constructor(config) {
        this.requests = [];
        this.errorHashes = new Map();
        this.cleanupInterval = null;
        this.config = config;
        this.setupCleanupInterval();
    }
    setupCleanupInterval() {
        if (typeof window !== 'undefined') {
            this.cleanupInterval = window.setInterval(() => {
                this.cleanup();
            }, this.config.windowMs);
        }
    }
    canSendError(errorData) {
        const now = Date.now();
        this.removeExpiredRequests(now);
        if (this.requests.length >= this.config.maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetTime: this.getNextResetTime(now),
                reason: 'Rate limit exceeded'
            };
        }
        const errorHash = this.generateErrorHash(errorData);
        const lastSeen = this.errorHashes.get(errorHash);
        if (lastSeen && (now - lastSeen) < this.config.duplicateErrorWindow) {
            return {
                allowed: false,
                remaining: this.config.maxRequests - this.requests.length,
                resetTime: this.getNextResetTime(now),
                reason: 'Duplicate error'
            };
        }
        return {
            allowed: true,
            remaining: this.config.maxRequests - this.requests.length - 1,
            resetTime: this.getNextResetTime(now)
        };
    }
    markErrorSent(errorData) {
        const now = Date.now();
        this.requests.push(now);
        const errorHash = this.generateErrorHash(errorData);
        this.errorHashes.set(errorHash, now);
    }
    generateErrorHash(errorData) {
        const key = `${errorData.message}-${errorData.file}-${errorData.line}`;
        return btoa(key).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
    }
    removeExpiredRequests(now) {
        const cutoff = now - this.config.windowMs;
        this.requests = this.requests.filter(timestamp => timestamp > cutoff);
    }
    getNextResetTime(now) {
        if (this.requests.length === 0) {
            return now + this.config.windowMs;
        }
        const oldestRequest = Math.min(...this.requests);
        return oldestRequest + this.config.windowMs;
    }
    cleanup() {
        const now = Date.now();
        this.removeExpiredRequests(now);
        const cutoff = now - this.config.duplicateErrorWindow;
        for (const [hash, timestamp] of this.errorHashes.entries()) {
            if (timestamp < cutoff) {
                this.errorHashes.delete(hash);
            }
        }
    }
    getStats() {
        return {
            requestCount: this.requests.length,
            errorHashCount: this.errorHashes.size
        };
    }
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.requests = [];
        this.errorHashes.clear();
    }
}

class OfflineManager {
    constructor(maxQueueSize = 50, maxAge = 24 * 60 * 60 * 1000) {
        this.queue = [];
        this.isOnline = true;
        this.sendFunction = null;
        this.processingQueue = false;
        this.onlineListener = null;
        this.offlineListener = null;
        this.maxQueueSize = maxQueueSize;
        this.maxAge = maxAge;
        this.setupNetworkListeners();
        this.loadQueueFromStorage();
    }
    setupNetworkListeners() {
        if (typeof window === 'undefined')
            return;
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
    setSendFunction(sendFunction) {
        this.sendFunction = sendFunction;
    }
    async handleError(errorData) {
        if (this.isOnline && this.sendFunction) {
            try {
                await this.sendFunction(errorData);
                return;
            }
            catch (error) {
                this.queueError(errorData);
            }
        }
        else {
            this.queueError(errorData);
        }
    }
    queueError(errorData) {
        const queueItem = {
            id: this.generateId(),
            errorData,
            timestamp: Date.now(),
            attempts: 0
        };
        this.cleanupQueue();
        this.queue.push(queueItem);
        if (this.queue.length > this.maxQueueSize) {
            this.queue.sort((a, b) => a.timestamp - b.timestamp);
            this.queue = this.queue.slice(-this.maxQueueSize);
        }
        this.saveQueueToStorage();
    }
    async processQueue() {
        if (this.processingQueue || !this.isOnline || !this.sendFunction) {
            return;
        }
        this.processingQueue = true;
        try {
            const itemsToProcess = [...this.queue];
            const processedItems = [];
            for (const item of itemsToProcess) {
                try {
                    await this.sendFunction(item.errorData);
                    processedItems.push(item.id);
                }
                catch (error) {
                    item.attempts++;
                    if (item.attempts >= 3) {
                        processedItems.push(item.id);
                    }
                }
            }
            this.queue = this.queue.filter(item => !processedItems.includes(item.id));
            this.saveQueueToStorage();
        }
        finally {
            this.processingQueue = false;
        }
    }
    cleanupQueue() {
        const now = Date.now();
        const cutoff = now - this.maxAge;
        this.queue = this.queue.filter(item => item.timestamp > cutoff);
    }
    generateId() {
        return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }
    getStorageKey() {
        return 'error-explorer-offline-queue';
    }
    saveQueueToStorage() {
        if (typeof window === 'undefined' || !window.localStorage)
            return;
        try {
            const data = JSON.stringify(this.queue);
            localStorage.setItem(this.getStorageKey(), data);
        }
        catch (error) {
            console.warn('Failed to save offline queue to localStorage:', error);
        }
    }
    loadQueueFromStorage() {
        if (typeof window === 'undefined' || !window.localStorage)
            return;
        try {
            const data = localStorage.getItem(this.getStorageKey());
            if (data) {
                const parsedQueue = JSON.parse(data);
                if (Array.isArray(parsedQueue)) {
                    this.queue = parsedQueue;
                    this.cleanupQueue();
                }
            }
        }
        catch (error) {
            console.warn('Failed to load offline queue from localStorage:', error);
            this.queue = [];
        }
    }
    async flushQueue() {
        if (this.isOnline) {
            await this.processQueue();
        }
    }
    getQueueStats() {
        return {
            size: this.queue.length,
            oldestTimestamp: this.queue.length > 0 ? Math.min(...this.queue.map(item => item.timestamp)) : null,
            isOnline: this.isOnline,
            isProcessing: this.processingQueue
        };
    }
    clearQueue() {
        this.queue = [];
        this.saveQueueToStorage();
    }
    destroy() {
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

class RetryManager {
    constructor(config = {}) {
        this.config = {
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2,
            jitter: true,
            ...config
        };
    }
    async executeWithRetry(operation, customConfig) {
        const config = { ...this.config, ...customConfig };
        const startTime = Date.now();
        let lastError = null;
        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            try {
                const result = await operation();
                return {
                    success: true,
                    result,
                    attempts: attempt + 1,
                    totalTime: Date.now() - startTime
                };
            }
            catch (error) {
                lastError = error;
                if (attempt === config.maxRetries) {
                    break;
                }
                if (this.shouldNotRetry(error)) {
                    break;
                }
                const delay = this.calculateDelay(attempt, config);
                await this.sleep(delay);
            }
        }
        return {
            success: false,
            error: lastError || new Error('Unknown error'),
            attempts: config.maxRetries + 1,
            totalTime: Date.now() - startTime
        };
    }
    shouldNotRetry(error) {
        if (error.message.includes('400') || error.message.includes('401') ||
            error.message.includes('403') || error.message.includes('404')) {
            return true;
        }
        if (error.name === 'ValidationError' || error.name === 'TypeError') {
            return true;
        }
        return false;
    }
    calculateDelay(attempt, config) {
        let delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
        delay = Math.min(delay, config.maxDelay);
        if (config.jitter) {
            const jitterAmount = delay * 0.1;
            const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
            delay += jitter;
        }
        return Math.max(0, Math.round(delay));
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async retry(operation) {
        const result = await this.executeWithRetry(operation);
        if (result.success && result.result !== undefined) {
            return result.result;
        }
        throw result.error || new Error('Retry failed');
    }
    makeRetryable(fn, customConfig) {
        return async (...args) => {
            const result = await this.executeWithRetry(() => fn(...args), customConfig);
            if (result.success && result.result !== undefined) {
                return result.result;
            }
            throw result.error || new Error('Retry failed');
        };
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
}

class SecurityValidator {
    constructor(config = {}) {
        this.defaultSensitivePatterns = [
            /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
            /\b\d{3}-\d{2}-\d{4}\b/g,
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
            /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
            /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g,
            /\b[Aa]pi[_-]?[Kk]ey[:\s]*[A-Za-z0-9_-]{20,}\b/g,
            /["\']?password["\']?\s*[:\s=]\s*["\'][^"']*["\']?/gi,
            /\b[Aa]ccess[_-]?[Tt]oken[:\s]*[A-Za-z0-9_-]{20,}\b/g,
        ];
        this.config = {
            requireHttps: true,
            validateToken: true,
            maxPayloadSize: 1024 * 1024,
            sensitiveDataPatterns: this.defaultSensitivePatterns,
            ...config
        };
    }
    validateConfiguration(config) {
        const errors = [];
        const warnings = [];
        if (!config.webhookUrl) {
            errors.push('Webhook URL is required');
        }
        else {
            try {
                const url = new URL(config.webhookUrl);
                if (this.config.requireHttps && url.protocol !== 'https:') {
                    errors.push('HTTPS is required for webhook URL in production');
                }
                if (this.config.allowedDomains && this.config.allowedDomains.length > 0) {
                    if (!this.config.allowedDomains.includes(url.hostname)) {
                        errors.push(`Domain ${url.hostname} is not in allowed domains list`);
                    }
                }
            }
            catch (error) {
                errors.push('Invalid webhook URL format');
            }
        }
        if (!config.projectName || config.projectName.trim().length === 0) {
            errors.push('Project name is required');
        }
        if (config.environment && !['development', 'staging', 'production'].includes(config.environment)) {
            warnings.push('Environment should be one of: development, staging, production');
        }
        if (config.retries !== undefined && (config.retries < 0 || config.retries > 10)) {
            warnings.push('Retry count should be between 0 and 10');
        }
        if (config.timeout !== undefined && (config.timeout < 1000 || config.timeout > 30000)) {
            warnings.push('Timeout should be between 1000ms and 30000ms');
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    validatePayload(errorData) {
        const errors = [];
        const warnings = [];
        const payloadSize = this.calculatePayloadSize(errorData);
        if (payloadSize > this.config.maxPayloadSize) {
            errors.push(`Payload size (${payloadSize} bytes) exceeds maximum allowed size (${this.config.maxPayloadSize} bytes)`);
        }
        const sensitiveDataFound = this.detectSensitiveData(errorData);
        if (sensitiveDataFound.length > 0) {
            warnings.push(`Potential sensitive data detected: ${sensitiveDataFound.join(', ')}`);
        }
        if (!errorData.message) {
            errors.push('Error message is required');
        }
        if (!errorData.project) {
            errors.push('Project name is required');
        }
        if (!errorData.timestamp) {
            errors.push('Timestamp is required');
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    sanitizeErrorData(errorData) {
        const sanitized = { ...errorData };
        if (sanitized.message) {
            sanitized.message = this.sanitizeText(sanitized.message);
        }
        if (sanitized.stack_trace) {
            sanitized.stack_trace = this.sanitizeText(sanitized.stack_trace);
        }
        if (sanitized.context) {
            sanitized.context = this.sanitizeObject(sanitized.context);
        }
        if (sanitized.breadcrumbs) {
            sanitized.breadcrumbs = sanitized.breadcrumbs.map(breadcrumb => ({
                ...breadcrumb,
                message: this.sanitizeText(breadcrumb.message),
                data: breadcrumb.data ? this.sanitizeObject(breadcrumb.data) : undefined
            }));
        }
        if (sanitized.user) {
            sanitized.user = this.sanitizeObject(sanitized.user);
        }
        return sanitized;
    }
    calculatePayloadSize(data) {
        return new Blob([JSON.stringify(data)]).size;
    }
    detectSensitiveData(errorData) {
        const sensitiveDataTypes = [];
        const textToCheck = [
            errorData.message,
            errorData.stack_trace,
            JSON.stringify(errorData.context || {}),
            JSON.stringify(errorData.user || {}),
            JSON.stringify(errorData.breadcrumbs || [])
        ].join(' ');
        for (const pattern of this.config.sensitiveDataPatterns) {
            if (pattern.test(textToCheck)) {
                if (pattern.source.includes('\\d{4}[-\\s]?\\d{4}')) {
                    sensitiveDataTypes.push('Credit Card');
                }
                else if (pattern.source.includes('\\d{3}-\\d{2}-\\d{4}')) {
                    sensitiveDataTypes.push('SSN');
                }
                else if (pattern.source.includes('@')) {
                    sensitiveDataTypes.push('Email');
                }
                else if (pattern.source.includes('eyJ')) {
                    sensitiveDataTypes.push('JWT Token');
                }
                else if (pattern.source.includes('[Aa]pi')) {
                    sensitiveDataTypes.push('API Key');
                }
                else if (pattern.source.includes('password')) {
                    sensitiveDataTypes.push('Password');
                }
                else {
                    sensitiveDataTypes.push('PII');
                }
            }
        }
        return [...new Set(sensitiveDataTypes)];
    }
    sanitizeText(text) {
        let sanitized = text;
        for (const pattern of this.config.sensitiveDataPatterns) {
            sanitized = sanitized.replace(pattern, '[REDACTED]');
        }
        return sanitized;
    }
    sanitizeObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.sanitizeObject(item));
        }
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];
            if (sensitiveKeys.some(sensitiveKey => key.toLowerCase().includes(sensitiveKey))) {
                sanitized[key] = '[REDACTED]';
            }
            else if (typeof value === 'string') {
                sanitized[key] = this.sanitizeText(value);
            }
            else if (typeof value === 'object') {
                sanitized[key] = this.sanitizeObject(value);
            }
            else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }
    addSensitivePattern(pattern) {
        this.config.sensitiveDataPatterns.push(pattern);
    }
    removeSensitivePattern(pattern) {
        const index = this.config.sensitiveDataPatterns.findIndex(p => p.source === pattern.source);
        if (index > -1) {
            this.config.sensitiveDataPatterns.splice(index, 1);
        }
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
    getConfig() {
        return { ...this.config };
    }
}

class QuotaManager {
    constructor(config) {
        this.dailyCount = 0;
        this.monthlyCount = 0;
        this.burstCounts = [];
        this.storageKey = 'error-explorer-quota';
        this.config = config;
        const now = new Date();
        this.lastResetDate = this.getDateKey(now);
        this.lastResetMonth = this.getMonthKey(now);
        this.loadFromStorage();
    }
    canSendError(payloadSize = 0) {
        this.cleanupOldData();
        const stats = this.getStats();
        if (payloadSize > this.config.payloadSizeLimit) {
            return {
                allowed: false,
                reason: `Payload size (${payloadSize}) exceeds limit (${this.config.payloadSizeLimit})`,
                quotaStats: stats
            };
        }
        this.cleanupBurstCounts();
        if (this.burstCounts.length >= this.config.burstLimit) {
            return {
                allowed: false,
                reason: 'Burst limit exceeded',
                quotaStats: stats
            };
        }
        if (this.dailyCount >= this.config.dailyLimit) {
            return {
                allowed: false,
                reason: 'Daily quota exceeded',
                quotaStats: stats
            };
        }
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
    recordUsage(payloadSize = 0) {
        this.cleanupOldData();
        const now = Date.now();
        this.dailyCount++;
        this.monthlyCount++;
        this.burstCounts.push(now);
        this.saveToStorage();
    }
    cleanupOldData() {
        const now = new Date();
        const currentDate = this.getDateKey(now);
        const currentMonth = this.getMonthKey(now);
        if (currentDate !== this.lastResetDate) {
            this.dailyCount = 0;
            this.lastResetDate = currentDate;
        }
        if (currentMonth !== this.lastResetMonth) {
            this.monthlyCount = 0;
            this.lastResetMonth = currentMonth;
        }
        this.cleanupBurstCounts();
    }
    cleanupBurstCounts() {
        const now = Date.now();
        const cutoff = now - this.config.burstWindowMs;
        this.burstCounts = this.burstCounts.filter(timestamp => timestamp > cutoff);
    }
    getDateKey(date) {
        return date.toISOString().split('T')[0];
    }
    getMonthKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    getStats() {
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
    resetQuotas() {
        this.dailyCount = 0;
        this.monthlyCount = 0;
        this.burstCounts = [];
        this.saveToStorage();
    }
    saveToStorage() {
        if (typeof window === 'undefined' || !window.localStorage)
            return;
        try {
            const data = {
                dailyCount: this.dailyCount,
                monthlyCount: this.monthlyCount,
                burstCounts: this.burstCounts,
                lastResetDate: this.lastResetDate,
                lastResetMonth: this.lastResetMonth
            };
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        }
        catch (error) {
            console.warn('Failed to save quota data to localStorage:', error);
        }
    }
    loadFromStorage() {
        if (typeof window === 'undefined' || !window.localStorage)
            return;
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
        }
        catch (error) {
            console.warn('Failed to load quota data from localStorage:', error);
        }
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
    getConfig() {
        return { ...this.config };
    }
    destroy() {
        this.resetQuotas();
    }
}

class SDKMonitor {
    constructor() {
        this.performanceEntries = [];
        this.healthCheckInterval = null;
        this.maxPerformanceEntries = 100;
        this.startTime = Date.now();
        this.metrics = this.initializeMetrics();
        this.setupHealthCheck();
    }
    initializeMetrics() {
        return {
            errorsReported: 0,
            errorsSuppressed: 0,
            retryAttempts: 0,
            offlineQueueSize: 0,
            averageResponseTime: 0,
            uptime: 0
        };
    }
    setupHealthCheck() {
        if (typeof setInterval !== 'undefined') {
            this.healthCheckInterval = setInterval(() => {
                this.updateMemoryUsage();
                this.cleanupOldPerformanceEntries();
            }, 30000);
        }
    }
    trackError(error, context) {
        this.metrics.errorsReported++;
        this.metrics.lastErrorTime = Date.now();
        if (context?.suppressed) {
            this.metrics.errorsSuppressed++;
        }
    }
    trackSuppressedError(reason) {
        this.metrics.errorsSuppressed++;
    }
    trackRetryAttempt() {
        this.metrics.retryAttempts++;
    }
    trackPerformance(operation, duration, success = true) {
        const entry = {
            operation,
            duration,
            timestamp: Date.now(),
            success
        };
        this.performanceEntries.push(entry);
        this.updateAverageResponseTime();
        if (this.performanceEntries.length > this.maxPerformanceEntries) {
            this.performanceEntries = this.performanceEntries.slice(-this.maxPerformanceEntries);
        }
    }
    updateOfflineQueueSize(size) {
        this.metrics.offlineQueueSize = size;
    }
    updateAverageResponseTime() {
        if (this.performanceEntries.length === 0) {
            this.metrics.averageResponseTime = 0;
            return;
        }
        const recentEntries = this.performanceEntries.slice(-20);
        const total = recentEntries.reduce((sum, entry) => sum + entry.duration, 0);
        this.metrics.averageResponseTime = total / recentEntries.length;
    }
    updateUptimeMetric() {
        this.metrics.uptime = Date.now() - this.startTime;
    }
    updateMemoryUsage() {
        if (typeof window !== 'undefined' && 'performance' in window) {
            const memory = window.performance.memory;
            if (memory) {
                this.metrics.memoryUsage = memory.usedJSHeapSize;
            }
        }
    }
    cleanupOldPerformanceEntries() {
        const cutoff = Date.now() - (60 * 60 * 1000);
        this.performanceEntries = this.performanceEntries.filter(entry => entry.timestamp > cutoff);
    }
    getMetrics() {
        this.updateUptimeMetric();
        return { ...this.metrics };
    }
    assessHealth() {
        const metrics = this.getMetrics();
        const issues = [];
        const recommendations = [];
        let score = 100;
        const errorRate = metrics.errorsReported > 0 ?
            (metrics.errorsSuppressed / metrics.errorsReported) * 100 : 0;
        if (errorRate > 50) {
            issues.push('High error suppression rate');
            recommendations.push('Review error filtering configuration');
            score -= 20;
        }
        if (metrics.averageResponseTime > 5000) {
            issues.push('Slow average response time');
            recommendations.push('Check network connectivity and server performance');
            score -= 15;
        }
        if (metrics.offlineQueueSize > 10) {
            issues.push('Large offline queue');
            recommendations.push('Check network connectivity');
            score -= 10;
        }
        if (metrics.memoryUsage && metrics.memoryUsage > 50 * 1024 * 1024) {
            issues.push('High memory usage');
            recommendations.push('Consider reducing breadcrumb retention or queue sizes');
            score -= 10;
        }
        let status;
        if (score >= 80) {
            status = 'healthy';
        }
        else if (score >= 60) {
            status = 'degraded';
        }
        else {
            status = 'unhealthy';
        }
        return {
            status,
            score: Math.max(0, score),
            issues,
            recommendations
        };
    }
    reset() {
        this.metrics = this.initializeMetrics();
        this.performanceEntries = [];
        this.startTime = Date.now();
    }
    destroy() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        this.performanceEntries = [];
    }
}

class CircuitBreaker {
    constructor(config) {
        this.config = config;
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
        this.requests = [];
        this.stateChangeTime = Date.now();
    }
    async execute(operation) {
        if (this.state === 'OPEN') {
            if (this.shouldAttemptReset()) {
                this.state = 'HALF_OPEN';
                this.stateChangeTime = Date.now();
            }
            else {
                throw new Error('Circuit breaker is OPEN');
            }
        }
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    onSuccess() {
        this.successCount++;
        this.requests.push({ timestamp: Date.now(), success: true });
        if (this.state === 'HALF_OPEN') {
            this.state = 'CLOSED';
            this.failureCount = 0;
            this.stateChangeTime = Date.now();
        }
        this.cleanupRequests();
    }
    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        this.requests.push({ timestamp: Date.now(), success: false });
        if (this.shouldOpenCircuit()) {
            this.state = 'OPEN';
            this.stateChangeTime = Date.now();
        }
        this.cleanupRequests();
    }
    cleanupRequests() {
        const cutoff = Date.now() - this.config.monitoringPeriod;
        this.requests = this.requests.filter(req => req.timestamp > cutoff);
    }
    shouldOpenCircuit() {
        this.cleanupRequests();
        if (this.requests.length < this.config.minimumRequests) {
            return false;
        }
        const failures = this.requests.filter(req => !req.success).length;
        const failureRate = failures / this.requests.length;
        return failureRate >= (this.config.failureThreshold / 10);
    }
    shouldAttemptReset() {
        return Date.now() - this.stateChangeTime >= this.config.resetTimeout;
    }
    canExecute() {
        if (this.state === 'CLOSED') {
            return true;
        }
        if (this.state === 'OPEN' && this.shouldAttemptReset()) {
            this.state = 'HALF_OPEN';
            this.stateChangeTime = Date.now();
            return true;
        }
        return this.state === 'HALF_OPEN';
    }
    getStats() {
        this.cleanupRequests();
        const totalRequests = this.requests.length;
        const failures = this.requests.filter(req => !req.success).length;
        const failureRate = totalRequests > 0 ? failures / totalRequests : 0;
        const stats = {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            totalRequests,
            failureRate,
            timeInCurrentState: Date.now() - this.stateChangeTime
        };
        if (this.state === 'OPEN') {
            stats.nextRetryTime = this.stateChangeTime + this.config.resetTimeout;
        }
        return stats;
    }
    reset() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
        this.stateChangeTime = Date.now();
        this.requests = [];
    }
    forceOpen() {
        this.state = 'OPEN';
        this.stateChangeTime = Date.now();
    }
    forceClose() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.stateChangeTime = Date.now();
    }
    getState() {
        return this.state;
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
    getConfig() {
        return { ...this.config };
    }
}

class CompressionService {
    constructor(config = {}) {
        this.config = {
            enabled: true,
            threshold: 1024,
            level: 6,
            ...config
        };
    }
    async compress(data) {
        if (!this.config.enabled || data.length < this.config.threshold) {
            return data;
        }
        if (typeof window !== 'undefined' && 'CompressionStream' in window) {
            return this.compressWithCompressionStream(data);
        }
        return this.compressWithPako(data);
    }
    async compressWithCompressionStream(data) {
        const stream = new CompressionStream('gzip');
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();
        writer.write(new TextEncoder().encode(data));
        writer.close();
        const chunks = [];
        let done = false;
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
                chunks.push(value);
            }
        }
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result.buffer;
    }
    compressWithPako(data) {
        if (typeof btoa !== 'undefined') {
            return btoa(data);
        }
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(data).toString('base64');
        }
        return data;
    }
    getCompressionHeaders(isCompressed) {
        if (!isCompressed) {
            return {};
        }
        return {
            'Content-Encoding': 'gzip',
            'Content-Type': 'application/json'
        };
    }
    estimateCompressionRatio(data) {
        const uniqueChars = new Set(data).size;
        const totalChars = data.length;
        if (totalChars === 0)
            return 1;
        const repetitionFactor = 1 - (uniqueChars / totalChars);
        const baseRatio = 0.3;
        const adjustedRatio = baseRatio * (1 - repetitionFactor * 0.5);
        return Math.min(1, Math.max(0.1, adjustedRatio));
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
    getConfig() {
        return { ...this.config };
    }
}

class BatchManager {
    constructor(config = {}) {
        this.currentBatch = [];
        this.batchTimer = null;
        this.sendFunction = null;
        this.batchCounter = 0;
        this.config = {
            enabled: true,
            maxSize: 10,
            maxWaitTime: 5000,
            maxPayloadSize: 500 * 1024,
            ...config
        };
    }
    setSendFunction(sendFn) {
        this.sendFunction = sendFn;
    }
    async addError(errorData) {
        if (!this.config.enabled || !this.sendFunction) {
            if (this.sendFunction) {
                const batch = {
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
        if (this.shouldSendBatch()) {
            await this.sendCurrentBatch();
        }
        else if (!this.batchTimer) {
            this.startBatchTimer();
        }
    }
    shouldSendBatch() {
        if (this.currentBatch.length >= this.config.maxSize) {
            return true;
        }
        const estimatedSize = this.estimateBatchSize();
        return estimatedSize >= this.config.maxPayloadSize;
    }
    estimateBatchSize() {
        const batchData = {
            errors: this.currentBatch,
            batchId: 'estimate',
            timestamp: new Date().toISOString(),
            count: this.currentBatch.length
        };
        return new Blob([JSON.stringify(batchData)]).size;
    }
    startBatchTimer() {
        this.batchTimer = setTimeout(async () => {
            await this.sendCurrentBatch();
        }, this.config.maxWaitTime);
    }
    async sendCurrentBatch() {
        if (this.currentBatch.length === 0 || !this.sendFunction) {
            return;
        }
        const batch = {
            errors: [...this.currentBatch],
            batchId: this.generateBatchId(),
            timestamp: new Date().toISOString(),
            count: this.currentBatch.length
        };
        this.currentBatch = [];
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        try {
            await this.sendFunction(batch);
        }
        catch (error) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('[BatchManager] Failed to send batch:', error);
            }
        }
    }
    async flush() {
        if (this.currentBatch.length > 0) {
            await this.sendCurrentBatch();
        }
    }
    generateBatchId() {
        this.batchCounter++;
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `batch_${timestamp}_${this.batchCounter}_${random}`;
    }
    getStats() {
        const timeUntilFlush = this.batchTimer ?
            this.config.maxWaitTime - (Date.now() % this.config.maxWaitTime) : 0;
        return {
            currentBatchSize: this.currentBatch.length,
            hasPendingBatch: this.currentBatch.length > 0,
            timeUntilFlush,
            estimatedPayloadSize: this.estimateBatchSize()
        };
    }
    updateConfig(updates) {
        const oldEnabled = this.config.enabled;
        this.config = { ...this.config, ...updates };
        if (oldEnabled && !this.config.enabled) {
            this.flush();
        }
    }
    getConfig() {
        return { ...this.config };
    }
    destroy() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        if (this.currentBatch.length > 0) {
            this.flush().catch(() => {
            });
        }
    }
}

class PerformanceMeasurement {
    constructor() {
        this.measurements = new Map();
    }
    start(operation, metadata) {
        const id = this.generateId(operation);
        const startTime = this.getHighResolutionTime();
        this.measurements.set(id, {
            startTime,
            operation,
            metadata
        });
        return id;
    }
    end(id) {
        const measurement = this.measurements.get(id);
        if (!measurement) {
            return null;
        }
        const endTime = this.getHighResolutionTime();
        const duration = endTime - measurement.startTime;
        const completed = {
            ...measurement,
            endTime,
            duration
        };
        this.measurements.delete(id);
        return completed;
    }
    measure(operation, fn, metadata) {
        return new Promise(async (resolve, reject) => {
            const id = this.start(operation, metadata);
            try {
                const result = await fn();
                const performance = this.end(id);
                if (performance) {
                    resolve({ result, performance });
                }
                else {
                    resolve({ result, performance: { startTime: 0, operation, duration: 0 } });
                }
            }
            catch (error) {
                const performance = this.end(id);
                reject({ error, performance });
            }
        });
    }
    generateId(operation) {
        return `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    getHighResolutionTime() {
        if (typeof performance !== 'undefined' && performance.now) {
            return performance.now();
        }
        return Date.now();
    }
    cleanup() {
        const cutoff = this.getHighResolutionTime() - (5 * 60 * 1000);
        for (const [id, measurement] of this.measurements.entries()) {
            if (measurement.startTime < cutoff) {
                this.measurements.delete(id);
            }
        }
    }
    getPendingMeasurements() {
        return Array.from(this.measurements.values());
    }
}
function debounce(func, wait, immediate = false) {
    let timeout = null;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate)
                func(...args);
        };
        const callNow = immediate && !timeout;
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = window.setTimeout(later, wait);
        if (callNow) {
            func(...args);
        }
    };
}
function throttle(func, limit) {
    let inThrottle = false;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
function safeStringify(obj, maxDepth = 10, maxLength = 10000) {
    const seen = new WeakSet();
    let depth = 0;
    const replacer = (key, value) => {
        if (depth >= maxDepth) {
            return '[Max Depth Reached]';
        }
        if (value === null)
            return null;
        if (typeof value === 'object') {
            if (seen.has(value)) {
                return '[Circular Reference]';
            }
            seen.add(value);
            depth++;
        }
        if (typeof value === 'function') {
            return '[Function]';
        }
        if (typeof value === 'undefined') {
            return '[Undefined]';
        }
        if (typeof value === 'bigint') {
            return `[BigInt: ${value.toString()}]`;
        }
        if (value instanceof Error) {
            return {
                name: value.name,
                message: value.message,
                stack: value.stack
            };
        }
        return value;
    };
    try {
        const result = JSON.stringify(obj, replacer);
        return result.length > maxLength ? result.substring(0, maxLength) + '...[Truncated]' : result;
    }
    catch (error) {
        return '[Unstringifiable Object]';
    }
}
function generateSessionId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `${timestamp}-${randomPart}`;
}
function extractErrorInfo(error) {
    const info = {
        name: error.name || 'Error',
        message: error.message || 'Unknown error',
        stack: error.stack
    };
    if (error.stack) {
        const stackLines = error.stack.split('\n');
        const relevantLine = stackLines.find(line => line.includes('.js:') || line.includes('.ts:') || line.includes('.vue:'));
        if (relevantLine) {
            const match = relevantLine.match(/(?:at\s+.*\()?([^()]+):(\d+):(\d+)/) ||
                relevantLine.match(/([^@]+)@([^:]+):(\d+):(\d+)/) ||
                relevantLine.match(/([^:]+):(\d+):(\d+)/);
            if (match) {
                return {
                    ...info,
                    file: match[1] || match[2],
                    line: parseInt(match[2] || match[3], 10),
                    column: parseInt(match[3] || match[4], 10)
                };
            }
        }
    }
    return info;
}
function getBrowserInfo() {
    if (typeof window === 'undefined' || !navigator) {
        return {
            name: 'Unknown',
            version: 'Unknown',
            platform: 'Unknown',
            mobile: false
        };
    }
    const userAgent = navigator.userAgent;
    let name = 'Unknown';
    let version = 'Unknown';
    const platform = navigator.platform || 'Unknown';
    const mobile = /Mobi|Android/i.test(userAgent);
    if (userAgent.includes('Chrome')) {
        name = 'Chrome';
        const match = userAgent.match(/Chrome\/(\d+)/);
        version = match ? match[1] : 'Unknown';
    }
    else if (userAgent.includes('Firefox')) {
        name = 'Firefox';
        const match = userAgent.match(/Firefox\/(\d+)/);
        version = match ? match[1] : 'Unknown';
    }
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        name = 'Safari';
        const match = userAgent.match(/Version\/(\d+)/);
        version = match ? match[1] : 'Unknown';
    }
    else if (userAgent.includes('Edg')) {
        name = 'Edge';
        const match = userAgent.match(/Edg\/(\d+)/);
        version = match ? match[1] : 'Unknown';
    }
    return { name, version, platform, mobile };
}
function getPerformanceInfo() {
    if (typeof window === 'undefined' || !window.performance) {
        return {};
    }
    const info = {};
    if ('memory' in window.performance) {
        const memory = window.performance.memory;
        if (memory) {
            info.memory = memory.usedJSHeapSize;
        }
    }
    if (window.performance.timing) {
        info.timing = {
            navigationStart: window.performance.timing.navigationStart,
            loadEventEnd: window.performance.timing.loadEventEnd,
            domContentLoadedEventEnd: window.performance.timing.domContentLoadedEventEnd
        };
    }
    if (window.performance.navigation) {
        info.navigation = {
            type: window.performance.navigation.type,
            redirectCount: window.performance.navigation.redirectCount
        };
    }
    return info;
}
function isDevelopment() {
    if (typeof process !== 'undefined' && process.env) {
        return process.env.NODE_ENV === 'development';
    }
    if (typeof window !== 'undefined') {
        return window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('dev') ||
            window.location.port !== '';
    }
    return false;
}

class ErrorReporter {
    constructor(config) {
        this.userContext = {};
        this.globalContext = {};
        this.isInitialized = false;
        this.sessionId = generateSessionId();
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
            maxRequestsPerMinute: 10,
            duplicateErrorWindow: 5000,
            maxRetries: 3,
            initialRetryDelay: 1000,
            maxRetryDelay: 30000,
            enableOfflineSupport: true,
            maxOfflineQueueSize: 50,
            offlineQueueMaxAge: 24 * 60 * 60 * 1000,
            requireHttps: config.environment === 'production',
            maxPayloadSize: 1024 * 1024,
            dailyLimit: 1000,
            monthlyLimit: 10000,
            burstLimit: 50,
            burstWindowMs: 60000,
            enableCompression: true,
            compressionThreshold: 1024,
            compressionLevel: 6,
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
    initializeServices() {
        this.breadcrumbManager = new BreadcrumbManager(this.config.maxBreadcrumbs);
        this.rateLimiter = new RateLimiter({
            maxRequests: this.config.maxRequestsPerMinute,
            windowMs: 60000,
            duplicateErrorWindow: this.config.duplicateErrorWindow
        });
        this.offlineManager = new OfflineManager(this.config.maxOfflineQueueSize, this.config.offlineQueueMaxAge);
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
        this.offlineManager.setSendFunction((errorData) => this.sendErrorDirectly(errorData));
        this.batchManager.setSendFunction((batchData) => this.sendBatchDirectly(batchData));
    }
    setupHttpClient() {
        this.httpClient = axios.create({
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': `ErrorExplorer-Vue/${this.config.version || '1.0.0'}`
            }
        });
    }
    initialize() {
        if (!this.config.enabled) {
            return;
        }
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
        this.setupGlobalHandlers();
        if (this.config.userId || this.config.userEmail) {
            this.setUser({
                id: this.config.userId,
                email: this.config.userEmail
            });
        }
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
    setupGlobalHandlers() {
        if (typeof window === 'undefined')
            return;
        if (this.config.captureUnhandledRejections) {
            window.addEventListener('unhandledrejection', (event) => {
                const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
                this.captureException(error, { type: 'unhandledRejection' });
            });
        }
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
        if (this.config.captureConsoleErrors) {
            this.setupConsoleCapture();
        }
    }
    setupConsoleCapture() {
        const originalError = console.error;
        console.error = (...args) => {
            this.breadcrumbManager.addConsoleLog('error', args.join(' '), args);
            originalError.apply(console, args);
        };
        const originalWarn = console.warn;
        console.warn = (...args) => {
            this.breadcrumbManager.addConsoleLog('warning', args.join(' '), args);
            originalWarn.apply(console, args);
        };
    }
    setUser(user) {
        this.userContext = { ...this.userContext, ...user };
        if (this.config.debug) {
            console.log('[ErrorExplorer] User context updated:', this.userContext);
        }
    }
    setContext(key, value) {
        this.globalContext[key] = value;
    }
    removeContext(key) {
        delete this.globalContext[key];
    }
    addBreadcrumb(message, category = 'custom', level = 'info', data) {
        this.breadcrumbManager.addBreadcrumb({
            message,
            category,
            level,
            data
        });
    }
    async captureException(error, context) {
        if (!this.config.enabled || !this.isInitialized) {
            return;
        }
        const performanceStart = performance.now();
        try {
            this.sdkMonitor.trackError(error, context);
            const errorData = this.formatError(error, context);
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
            const sanitizedData = this.securityValidator.sanitizeErrorData(errorData);
            let finalData = sanitizedData;
            if (this.config.beforeSend) {
                const processedData = this.config.beforeSend(sanitizedData);
                if (!processedData) {
                    this.sdkMonitor.trackSuppressedError('Filtered by beforeSend');
                    return;
                }
                finalData = processedData;
            }
            const rateLimitResult = this.rateLimiter.canSendError(finalData);
            if (!rateLimitResult.allowed) {
                this.sdkMonitor.trackSuppressedError(rateLimitResult.reason || 'Rate limited');
                if (this.config.debug) {
                    console.warn('[ErrorExplorer] Error suppressed:', rateLimitResult.reason);
                }
                return;
            }
            const payloadSize = new Blob([JSON.stringify(finalData)]).size;
            const quotaResult = this.quotaManager.canSendError(payloadSize);
            if (!quotaResult.allowed) {
                this.sdkMonitor.trackSuppressedError(quotaResult.reason || 'Quota exceeded');
                if (this.config.debug) {
                    console.warn('[ErrorExplorer] Error suppressed:', quotaResult.reason);
                }
                return;
            }
            this.rateLimiter.markErrorSent(finalData);
            this.quotaManager.recordUsage(payloadSize);
            await this.sendError(finalData);
            const performanceEnd = performance.now();
            this.sdkMonitor.trackPerformance('captureException', performanceEnd - performanceStart, true);
        }
        catch (sendError) {
            const performanceEnd = performance.now();
            this.sdkMonitor.trackPerformance('captureException', performanceEnd - performanceStart, false);
            if (this.config.debug) {
                console.error('[ErrorExplorer] Failed to capture exception:', sendError);
            }
        }
    }
    async captureMessage(message, level = 'info', context) {
        const error = new Error(message);
        error.name = 'CapturedMessage';
        return this.captureException(error, { ...context, level, messageLevel: level });
    }
    formatError(error, context) {
        const errorInfo = extractErrorInfo(error);
        getBrowserInfo();
        const performanceInfo = getPerformanceInfo();
        const errorData = {
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
        if (typeof window !== 'undefined') {
            errorData.request = this.getRequestData();
        }
        return errorData;
    }
    async sendError(errorData) {
        if (this.config.enableBatching) {
            await this.batchManager.addError(errorData);
            return;
        }
        if (!this.circuitBreaker.canExecute()) {
            await this.offlineManager.handleError(errorData);
            return;
        }
        try {
            await this.circuitBreaker.execute(async () => {
                if (this.config.enableOfflineSupport) {
                    await this.offlineManager.handleError(errorData);
                }
                else {
                    await this.sendErrorDirectly(errorData);
                }
            });
        }
        catch (error) {
            this.sdkMonitor.trackRetryAttempt();
            if (this.config.debug) {
                console.error('[ErrorExplorer] Failed to send error:', error);
            }
            if (!this.config.enableOfflineSupport) {
                try {
                    await this.retryManager.retry(() => this.sendErrorDirectly(errorData));
                }
                catch (retryError) {
                    if (this.config.debug) {
                        console.error('[ErrorExplorer] All retry attempts failed:', retryError);
                    }
                }
            }
        }
    }
    async sendErrorDirectly(errorData) {
        const result = await this.retryManager.executeWithRetry(async () => {
            return await this.sendWithCompression(errorData);
        });
        if (!result.success) {
            throw result.error;
        }
    }
    async sendBatchDirectly(batchData) {
        const result = await this.retryManager.executeWithRetry(async () => {
            return await this.sendWithCompression(batchData);
        });
        if (!result.success) {
            throw result.error;
        }
    }
    async sendWithCompression(data) {
        const jsonData = JSON.stringify(data);
        const compressed = await this.compressionService.compress(jsonData);
        const isCompressed = compressed !== jsonData;
        const headers = {
            ...this.compressionService.getCompressionHeaders(isCompressed),
            ...this.httpClient.defaults.headers
        };
        if (isCompressed && compressed instanceof ArrayBuffer) {
            return await this.httpClient.post(this.config.webhookUrl, compressed, {
                headers: {
                    ...headers,
                    'Content-Type': 'application/octet-stream'
                }
            });
        }
        else {
            return await this.httpClient.post(this.config.webhookUrl, compressed, {
                headers
            });
        }
    }
    getRequestData() {
        if (typeof window === 'undefined')
            return {};
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
    getBrowserData() {
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
    getStats() {
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
            rateLimitRemaining: 10 - rateLimitStats.requestCount,
            rateLimitReset: Date.now() + 60000,
            quotaStats,
            circuitBreakerState: circuitBreakerStats.state,
            sdkHealth,
            performanceMetrics: sdkMetrics
        };
    }
    async flushQueue() {
        await this.offlineManager.flushQueue();
        await this.batchManager.flush();
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
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
    clearBreadcrumbs() {
        this.breadcrumbManager.clearBreadcrumbs();
    }
    isEnabled() {
        return this.config.enabled && this.isInitialized;
    }
    getSDKHealth() {
        return this.sdkMonitor.assessHealth();
    }
    getBreadcrumbManager() {
        return this.breadcrumbManager;
    }
    getConfig() {
        return this.getPublicConfig();
    }
    getPublicConfig() {
        const { webhookUrl, ...publicConfig } = this.config;
        return {
            ...publicConfig,
            webhookUrl: webhookUrl ? '[CONFIGURED]' : '[NOT SET]'
        };
    }
    destroy() {
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

let globalErrorReporter = null;
const ErrorExplorerPlugin$2 = {
    install(app, options) {
        globalErrorReporter = new ErrorReporter(options);
        const originalErrorHandler = app.config.errorHandler;
        app.config.errorHandler = (error, instance, info) => {
            if (error instanceof Error && globalErrorReporter) {
                const vueInfo = {
                    componentName: instance?.type?.name || instance?.type?.displayName || 'Unknown',
                    propsData: instance?.props,
                    lifecycle: info
                };
                globalErrorReporter.addBreadcrumb(`Vue Error in ${vueInfo.componentName}: ${info}`, 'vue.error', 'error', vueInfo);
                globalErrorReporter.captureException(error, {
                    vue: vueInfo,
                    error_info: info
                });
            }
            if (originalErrorHandler) {
                originalErrorHandler(error, instance, info);
            }
        };
        app.mixin({
            beforeRouteEnter(to, from, next) {
                if (globalErrorReporter) {
                    globalErrorReporter.getBreadcrumbManager().addNavigation(from.fullPath || 'initial', to.fullPath);
                }
                next();
            },
            beforeRouteUpdate(to, from, next) {
                if (globalErrorReporter) {
                    globalErrorReporter.getBreadcrumbManager().addNavigation(from.fullPath, to.fullPath);
                }
                next();
            }
        });
        const errorExplorerAPI = {
            captureException: (error, context) => {
                return globalErrorReporter?.captureException(error, context) || Promise.resolve();
            },
            captureMessage: (message, level = 'info', context) => {
                return globalErrorReporter?.captureMessage(message, level, context) || Promise.resolve();
            },
            addBreadcrumb: (message, category, level, data) => {
                globalErrorReporter?.addBreadcrumb(message, category, level, data);
            },
            setUser: (user) => {
                globalErrorReporter?.setUser(user);
            },
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
            },
            flushQueue: async () => {
                return globalErrorReporter?.flushQueue() || Promise.resolve();
            },
            updateConfig: (updates) => {
                globalErrorReporter?.updateConfig(updates);
            },
            clearBreadcrumbs: () => {
                globalErrorReporter?.clearBreadcrumbs();
            },
            isEnabled: () => {
                return globalErrorReporter?.isEnabled() || false;
            },
            setContext: (key, value) => {
                globalErrorReporter?.setContext(key, value);
            },
            removeContext: (key) => {
                globalErrorReporter?.removeContext(key);
            },
            getSDKHealth: () => {
                return globalErrorReporter?.getSDKHealth() || {
                    status: 'unhealthy',
                    score: 0,
                    issues: ['SDK not initialized'],
                    recommendations: ['Initialize ErrorExplorer plugin']
                };
            }
        };
        app.config.globalProperties.$errorExplorer = errorExplorerAPI;
        app.provide('errorExplorer', errorExplorerAPI);
    }
};
function createErrorExplorer(config) {
    globalErrorReporter = new ErrorReporter(config);
    return globalErrorReporter;
}
function getErrorExplorer() {
    return globalErrorReporter;
}
function captureException(error, context) {
    if (!globalErrorReporter) {
        console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
        return Promise.resolve();
    }
    return globalErrorReporter.captureException(error, context);
}
function captureMessage(message, level = 'info', context) {
    if (!globalErrorReporter) {
        console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
        return Promise.resolve();
    }
    return globalErrorReporter.captureMessage(message, level, context);
}
function addBreadcrumb(message, category = 'custom', level = 'info', data) {
    if (!globalErrorReporter) {
        console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
        return;
    }
    globalErrorReporter.addBreadcrumb(message, category, level, data);
}
function setUser(user) {
    if (!globalErrorReporter) {
        console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
        return;
    }
    globalErrorReporter.setUser(user);
}
function getStats() {
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
async function flushQueue() {
    if (!globalErrorReporter) {
        console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
        return;
    }
    return globalErrorReporter.flushQueue();
}
function updateConfig(updates) {
    if (!globalErrorReporter) {
        console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
        return;
    }
    globalErrorReporter.updateConfig(updates);
}
function clearBreadcrumbs() {
    if (!globalErrorReporter) {
        console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
        return;
    }
    globalErrorReporter.clearBreadcrumbs();
}
function isEnabled() {
    if (!globalErrorReporter) {
        return false;
    }
    return globalErrorReporter.isEnabled();
}
function setContext(key, value) {
    if (!globalErrorReporter) {
        console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
        return;
    }
    globalErrorReporter.setContext(key, value);
}
function removeContext(key) {
    if (!globalErrorReporter) {
        console.warn('ErrorExplorer: Not initialized. Install the plugin or call createErrorExplorer first.');
        return;
    }
    globalErrorReporter.removeContext(key);
}
function getSDKHealth() {
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

var index = /*#__PURE__*/Object.freeze({
    __proto__: null,
    ErrorExplorerPlugin: ErrorExplorerPlugin$2,
    addBreadcrumb: addBreadcrumb,
    captureException: captureException,
    captureMessage: captureMessage,
    clearBreadcrumbs: clearBreadcrumbs,
    createErrorExplorer: createErrorExplorer,
    flushQueue: flushQueue,
    getErrorExplorer: getErrorExplorer,
    getSDKHealth: getSDKHealth,
    getStats: getStats,
    isEnabled: isEnabled,
    removeContext: removeContext,
    setContext: setContext,
    setUser: setUser,
    updateConfig: updateConfig
});

function useErrorExplorer() {
    const injectedErrorExplorer = inject('errorExplorer', null);
    if (injectedErrorExplorer) {
        return injectedErrorExplorer;
    }
    const instance = getCurrentInstance();
    if (instance?.appContext.app.config.globalProperties.$errorExplorer) {
        return instance.appContext.app.config.globalProperties.$errorExplorer;
    }
    return {
        captureException: async (error, context) => {
            const { captureException } = await Promise.resolve().then(function () { return index; });
            return captureException(error, context);
        },
        captureMessage: async (message, level = 'info', context) => {
            const { captureMessage } = await Promise.resolve().then(function () { return index; });
            return captureMessage(message, level, context);
        },
        addBreadcrumb: (message, category, level, data) => {
            Promise.resolve().then(function () { return index; }).then(({ addBreadcrumb }) => {
                addBreadcrumb(message, category, level, data);
            });
        },
        setUser: (user) => {
            Promise.resolve().then(function () { return index; }).then(({ setUser }) => {
                setUser(user);
            });
        },
        getStats: () => {
            const { getStats } = require('../plugin');
            return getStats();
        },
        flushQueue: async () => {
            const { flushQueue } = await Promise.resolve().then(function () { return index; });
            return flushQueue();
        },
        updateConfig: (updates) => {
            Promise.resolve().then(function () { return index; }).then(({ updateConfig }) => {
                updateConfig(updates);
            });
        },
        clearBreadcrumbs: () => {
            Promise.resolve().then(function () { return index; }).then(({ clearBreadcrumbs }) => {
                clearBreadcrumbs();
            });
        },
        isEnabled: () => {
            const { isEnabled } = require('../plugin');
            return isEnabled();
        },
        setContext: (key, value) => {
            Promise.resolve().then(function () { return index; }).then(({ setContext }) => {
                setContext(key, value);
            });
        },
        removeContext: (key) => {
            Promise.resolve().then(function () { return index; }).then(({ removeContext }) => {
                removeContext(key);
            });
        },
        getSDKHealth: () => {
            const { getSDKHealth } = require('../plugin');
            return getSDKHealth();
        }
    };
}

var ErrorExplorerPlugin$1 = ErrorExplorerPlugin;
const install = ErrorExplorerPlugin.install;

export { BatchManager, BreadcrumbManager, CircuitBreaker, CompressionService, ErrorExplorerPlugin$2 as ErrorExplorerPlugin, ErrorReporter, OfflineManager, PerformanceMeasurement, QuotaManager, RateLimiter, RetryManager, SDKMonitor, SecurityValidator, addBreadcrumb, captureException, captureMessage, clearBreadcrumbs, createErrorExplorer, debounce, ErrorExplorerPlugin$1 as default, extractErrorInfo, flushQueue, generateSessionId, getBrowserInfo, getErrorExplorer, getPerformanceInfo, getSDKHealth, getStats, install, isDevelopment, isEnabled, removeContext, safeStringify, setContext, setUser, throttle, updateConfig, useErrorExplorer };
//# sourceMappingURL=index.esm.js.map
