import { Breadcrumb } from '../types';

export class BreadcrumbManager {
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs: number;

  constructor(maxBreadcrumbs: number = 50) {
    this.maxBreadcrumbs = maxBreadcrumbs;
  }

  addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>): void {
    const fullBreadcrumb: Breadcrumb = {
      ...breadcrumb,
      timestamp: new Date().toISOString()
    };

    this.breadcrumbs.push(fullBreadcrumb);

    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  getBreadcrumbs(): Breadcrumb[] {
    return [...this.breadcrumbs];
  }

  clear(): void {
    this.breadcrumbs = [];
  }

  addNavigation(from: string, to: string): void {
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

  addUserInteraction(event: string, target: string, data?: Record<string, any>): void {
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

  addHttpRequest(method: string, url: string, statusCode?: number): void {
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

  addComponentLifecycle(componentName: string, lifecycle: string): void {
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

  addVueEvent(componentName: string, eventName: string, data?: any): void {
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

  addConsoleLog(level: string, message: string, data?: any): void {
    this.addBreadcrumb({
      message,
      category: 'console',
      level: level as any,
      data: data ? { data } : undefined
    });
  }

  addCustom(message: string, data?: Record<string, any>): void {
    this.addBreadcrumb({
      message,
      category: 'custom',
      level: 'info',
      data
    });
  }

  clearBreadcrumbs(): void {
    this.clear();
  }
}