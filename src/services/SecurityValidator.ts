import { ErrorData, ErrorExplorerConfig } from '../types';

export interface SecurityConfig {
  requireHttps: boolean;
  validateToken: boolean;
  maxPayloadSize: number;
  allowedDomains?: string[];
  sensitiveDataPatterns: RegExp[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class SecurityValidator {
  private config: SecurityConfig;
  private defaultSensitivePatterns: RegExp[] = [
    // Credit card numbers
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    // Social Security Numbers
    /\b\d{3}-\d{2}-\d{4}\b/g,
    // Email addresses (in some contexts might be sensitive)
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Phone numbers
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    // IP addresses
    /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
    // JWT tokens
    /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g,
    // API keys (common patterns)
    /\b[Aa]pi[_-]?[Kk]ey[:\s]*[A-Za-z0-9_-]{20,}\b/g,
    // Passwords (in URLs or JSON)
    /["\']?password["\']?\s*[:\s=]\s*["\'][^"']*["\']?/gi,
    // Access tokens
    /\b[Aa]ccess[_-]?[Tt]oken[:\s]*[A-Za-z0-9_-]{20,}\b/g,
  ];

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = {
      requireHttps: true,
      validateToken: true,
      maxPayloadSize: 1024 * 1024, // 1MB
      sensitiveDataPatterns: this.defaultSensitivePatterns,
      ...config
    };
  }

  validateConfiguration(config: ErrorExplorerConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate webhook URL
    if (!config.webhookUrl) {
      errors.push('Webhook URL is required');
    } else {
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
      } catch (error) {
        errors.push('Invalid webhook URL format');
      }
    }

    // Validate project name
    if (!config.projectName || config.projectName.trim().length === 0) {
      errors.push('Project name is required');
    }

    // Validate environment
    if (config.environment && !['development', 'staging', 'production'].includes(config.environment)) {
      warnings.push('Environment should be one of: development, staging, production');
    }

    // Validate retry configuration
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

  validatePayload(errorData: ErrorData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check payload size
    const payloadSize = this.calculatePayloadSize(errorData);
    if (payloadSize > this.config.maxPayloadSize) {
      errors.push(`Payload size (${payloadSize} bytes) exceeds maximum allowed size (${this.config.maxPayloadSize} bytes)`);
    }

    // Check for sensitive data
    const sensitiveDataFound = this.detectSensitiveData(errorData);
    if (sensitiveDataFound.length > 0) {
      warnings.push(`Potential sensitive data detected: ${sensitiveDataFound.join(', ')}`);
    }

    // Validate required fields
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

  sanitizeErrorData(errorData: ErrorData): ErrorData {
    const sanitized = { ...errorData };

    // Sanitize message
    if (sanitized.message) {
      sanitized.message = this.sanitizeText(sanitized.message);
    }

    // Sanitize stack trace
    if (sanitized.stack_trace) {
      sanitized.stack_trace = this.sanitizeText(sanitized.stack_trace);
    }

    // Sanitize context data
    if (sanitized.context) {
      sanitized.context = this.sanitizeObject(sanitized.context);
    }

    // Sanitize breadcrumbs
    if (sanitized.breadcrumbs) {
      sanitized.breadcrumbs = sanitized.breadcrumbs.map(breadcrumb => ({
        ...breadcrumb,
        message: this.sanitizeText(breadcrumb.message),
        data: breadcrumb.data ? this.sanitizeObject(breadcrumb.data) : undefined
      }));
    }

    // Sanitize user data
    if (sanitized.user) {
      sanitized.user = this.sanitizeObject(sanitized.user);
    }

    return sanitized;
  }

  private calculatePayloadSize(data: any): number {
    return new Blob([JSON.stringify(data)]).size;
  }

  private detectSensitiveData(errorData: ErrorData): string[] {
    const sensitiveDataTypes: string[] = [];
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
        } else if (pattern.source.includes('\\d{3}-\\d{2}-\\d{4}')) {
          sensitiveDataTypes.push('SSN');
        } else if (pattern.source.includes('@')) {
          sensitiveDataTypes.push('Email');
        } else if (pattern.source.includes('eyJ')) {
          sensitiveDataTypes.push('JWT Token');
        } else if (pattern.source.includes('[Aa]pi')) {
          sensitiveDataTypes.push('API Key');
        } else if (pattern.source.includes('password')) {
          sensitiveDataTypes.push('Password');
        } else {
          sensitiveDataTypes.push('PII');
        }
      }
    }

    return [...new Set(sensitiveDataTypes)];
  }

  private sanitizeText(text: string): string {
    let sanitized = text;
    
    for (const pattern of this.config.sensitiveDataPatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    
    return sanitized;
  }

  private sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if key might contain sensitive data
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];
      if (sensitiveKeys.some(sensitiveKey => key.toLowerCase().includes(sensitiveKey))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeText(value);
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  addSensitivePattern(pattern: RegExp): void {
    this.config.sensitiveDataPatterns.push(pattern);
  }

  removeSensitivePattern(pattern: RegExp): void {
    const index = this.config.sensitiveDataPatterns.findIndex(p => p.source === pattern.source);
    if (index > -1) {
      this.config.sensitiveDataPatterns.splice(index, 1);
    }
  }

  updateConfig(updates: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getConfig(): SecurityConfig {
    return { ...this.config };
  }
}