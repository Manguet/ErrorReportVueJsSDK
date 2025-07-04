import { BreadcrumbManager } from '../../../src/services/BreadcrumbManager';
import { Breadcrumb } from '../../../src/types';

describe('BreadcrumbManager', () => {
  let breadcrumbManager: BreadcrumbManager;
  const maxBreadcrumbs = 10;

  beforeEach(() => {
    breadcrumbManager = new BreadcrumbManager(maxBreadcrumbs);
  });

  describe('addBreadcrumb', () => {
    it('should add a breadcrumb with all properties', () => {
      const breadcrumb = {
        message: 'Test breadcrumb',
        category: 'test',
        level: 'info' as const,
        data: { key: 'value' }
      };

      breadcrumbManager.addBreadcrumb(breadcrumb);
      const breadcrumbs = breadcrumbManager.getBreadcrumbs();

      expect(breadcrumbs).toHaveLength(1);
      expect(breadcrumbs[0]).toMatchObject({
        message: 'Test breadcrumb',
        category: 'test',
        level: 'info',
        data: { key: 'value' }
      });
      expect(breadcrumbs[0].timestamp).toBeDefined();
    });

    it('should respect max breadcrumbs limit', () => {
      // Add more breadcrumbs than the limit
      for (let i = 0; i < maxBreadcrumbs + 5; i++) {
        breadcrumbManager.addBreadcrumb({
          message: `Breadcrumb ${i}`,
          category: 'test',
          level: 'info'
        });
      }

      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs).toHaveLength(maxBreadcrumbs);
      
      // Should keep the most recent breadcrumbs
      expect(breadcrumbs[0].message).toBe('Breadcrumb 5');
      expect(breadcrumbs[breadcrumbs.length - 1].message).toBe(`Breadcrumb ${maxBreadcrumbs + 4}`);
    });

    it('should handle empty data', () => {
      breadcrumbManager.addBreadcrumb({
        message: 'No data breadcrumb',
        category: 'test',
        level: 'info'
      });

      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs[0].data).toBeUndefined();
    });
  });

  describe('addNavigation', () => {
    it('should add navigation breadcrumb', () => {
      breadcrumbManager.addNavigation('/home', '/profile');
      
      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs).toHaveLength(1);
      expect(breadcrumbs[0]).toMatchObject({
        message: 'Navigation from /home to /profile',
        category: 'navigation',
        level: 'info',
        data: {
          from: '/home',
          to: '/profile'
        }
      });
    });

    it('should handle missing from path', () => {
      breadcrumbManager.addNavigation('', '/profile');
      
      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs[0].message).toBe('Navigation from [unknown] to /profile');
    });
  });

  describe('addUserAction', () => {
    it('should add user action breadcrumb', () => {
      breadcrumbManager.addUserAction('click', 'button', { id: 'submit-btn' });
      
      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs).toHaveLength(1);
      expect(breadcrumbs[0]).toMatchObject({
        message: 'User click on button',
        category: 'ui.click',
        level: 'info',
        data: { id: 'submit-btn' }
      });
    });

    it('should handle different action types', () => {
      breadcrumbManager.addUserAction('input', 'form', { name: 'email' });
      
      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs[0]).toMatchObject({
        message: 'User input on form',
        category: 'ui.input',
        level: 'info',
        data: { name: 'email' }
      });
    });
  });

  describe('addHttpRequest', () => {
    it('should add HTTP request breadcrumb', () => {
      breadcrumbManager.addHttpRequest('GET', '/api/users', 200);
      
      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs).toHaveLength(1);
      expect(breadcrumbs[0]).toMatchObject({
        message: 'GET /api/users',
        category: 'http',
        level: 'info',
        data: {
          method: 'GET',
          url: '/api/users',
          status_code: 200
        }
      });
    });

    it('should set error level for error status codes', () => {
      breadcrumbManager.addHttpRequest('POST', '/api/login', 401);
      
      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs[0].level).toBe('error');
    });

    it('should set warning level for 3xx status codes', () => {
      breadcrumbManager.addHttpRequest('GET', '/api/resource', 301);
      
      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs[0].level).toBe('warning');
    });
  });

  describe('addConsoleLog', () => {
    it('should add console log breadcrumb', () => {
      breadcrumbManager.addConsoleLog('error', 'Error message', ['arg1', 'arg2']);
      
      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs).toHaveLength(1);
      expect(breadcrumbs[0]).toMatchObject({
        message: 'Error message',
        category: 'console',
        level: 'error',
        data: {
          arguments: ['arg1', 'arg2']
        }
      });
    });

    it('should map warning level correctly', () => {
      breadcrumbManager.addConsoleLog('warning', 'Warning message');
      
      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs[0].level).toBe('warning');
    });

    it('should default to info level for other types', () => {
      breadcrumbManager.addConsoleLog('log', 'Log message');
      
      const breadcrumbs = breadcrumbManager.getBreadcrumbs();
      expect(breadcrumbs[0].level).toBe('info');
    });
  });

  describe('clearBreadcrumbs', () => {
    it('should clear all breadcrumbs', () => {
      breadcrumbManager.addBreadcrumb({
        message: 'Test 1',
        category: 'test',
        level: 'info'
      });
      breadcrumbManager.addBreadcrumb({
        message: 'Test 2',
        category: 'test',
        level: 'info'
      });

      expect(breadcrumbManager.getBreadcrumbs()).toHaveLength(2);
      
      breadcrumbManager.clearBreadcrumbs();
      
      expect(breadcrumbManager.getBreadcrumbs()).toHaveLength(0);
    });
  });

  describe('getBreadcrumbs', () => {
    it('should return a copy of breadcrumbs array', () => {
      breadcrumbManager.addBreadcrumb({
        message: 'Test',
        category: 'test',
        level: 'info'
      });

      const breadcrumbs1 = breadcrumbManager.getBreadcrumbs();
      const breadcrumbs2 = breadcrumbManager.getBreadcrumbs();
      
      expect(breadcrumbs1).not.toBe(breadcrumbs2);
      expect(breadcrumbs1).toEqual(breadcrumbs2);
    });

    it('should return breadcrumbs in chronological order', () => {
      breadcrumbManager.addBreadcrumb({
        message: 'First',
        category: 'test',
        level: 'info'
      });
      
      // Add small delay to ensure different timestamps
      setTimeout(() => {
        breadcrumbManager.addBreadcrumb({
          message: 'Second',
          category: 'test',
          level: 'info'
        });
      }, 10);

      setTimeout(() => {
        const breadcrumbs = breadcrumbManager.getBreadcrumbs();
        expect(breadcrumbs[0].message).toBe('First');
        expect(breadcrumbs[1].message).toBe('Second');
      }, 20);
    });
  });
});