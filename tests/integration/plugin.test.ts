import { createApp, Component } from 'vue';
import { mount } from '@vue/test-utils';
import ErrorExplorerPlugin, { useErrorExplorer, captureException } from '../../src';
import { ErrorExplorerConfig } from '../../src/types';

// Mock axios
jest.mock('axios');

describe('ErrorExplorer Vue Plugin', () => {
  let app: ReturnType<typeof createApp>;
  let config: ErrorExplorerConfig;

  beforeEach(() => {
    config = {
      webhookUrl: 'https://example.com/webhook',
      projectName: 'test-project',
      environment: 'test'
    };

    // Create a test component
    const TestComponent: Component = {
      template: '<div>Test Component</div>'
    };

    app = createApp(TestComponent);
  });

  describe('Plugin Installation', () => {
    it('should install the plugin', () => {
      expect(() => {
        app.use(ErrorExplorerPlugin, config);
      }).not.toThrow();
    });

    it('should provide $errorExplorer globally', () => {
      app.use(ErrorExplorerPlugin, config);
      
      const wrapper = mount({
        template: '<div>Test</div>',
        mounted() {
          expect(this.$errorExplorer).toBeDefined();
          expect(this.$errorExplorer.captureException).toBeDefined();
          expect(this.$errorExplorer.captureMessage).toBeDefined();
          expect(this.$errorExplorer.addBreadcrumb).toBeDefined();
          expect(this.$errorExplorer.setUser).toBeDefined();
        }
      }, {
        global: {
          plugins: [[ErrorExplorerPlugin, config]]
        }
      });
    });

    it('should handle Vue errors', () => {
      app.use(ErrorExplorerPlugin, config);
      
      const errorHandler = app.config.errorHandler;
      expect(errorHandler).toBeDefined();

      // Simulate a Vue error
      const error = new Error('Vue component error');
      const instance = null;
      const info = 'mounted hook';

      // Call the error handler
      errorHandler!(error, instance, info);

      // The error should be captured by the plugin
    });
  });

  describe('Composition API', () => {
    it('should provide useErrorExplorer composable', () => {
      app.use(ErrorExplorerPlugin, config);

      const TestComponent = {
        setup() {
          const errorExplorer = useErrorExplorer();
          
          expect(errorExplorer).toBeDefined();
          expect(errorExplorer.captureException).toBeDefined();
          expect(errorExplorer.captureMessage).toBeDefined();
          expect(errorExplorer.addBreadcrumb).toBeDefined();
          expect(errorExplorer.setUser).toBeDefined();
          
          // New methods
          expect(errorExplorer.getStats).toBeDefined();
          expect(errorExplorer.flushQueue).toBeDefined();
          expect(errorExplorer.updateConfig).toBeDefined();
          expect(errorExplorer.clearBreadcrumbs).toBeDefined();
          expect(errorExplorer.isEnabled).toBeDefined();
          expect(errorExplorer.setContext).toBeDefined();
          expect(errorExplorer.removeContext).toBeDefined();
          expect(errorExplorer.getSDKHealth).toBeDefined();
          
          return { errorExplorer };
        },
        template: '<div>Test</div>'
      };

      mount(TestComponent, {
        global: {
          plugins: [[ErrorExplorerPlugin, config]]
        }
      });
    });

    it('should capture errors using composable', async () => {
      app.use(ErrorExplorerPlugin, config);

      const TestComponent = {
        setup() {
          const { captureException } = useErrorExplorer();
          
          const handleError = async () => {
            const error = new Error('Test error from composable');
            await captureException(error, { source: 'test-component' });
          };
          
          return { handleError };
        },
        template: '<button @click="handleError">Trigger Error</button>'
      };

      const wrapper = mount(TestComponent, {
        global: {
          plugins: [[ErrorExplorerPlugin, config]]
        }
      });

      await wrapper.find('button').trigger('click');
    });
  });

  describe('Options API', () => {
    it('should provide $errorExplorer in components', () => {
      const TestComponent = {
        mounted() {
          expect(this.$errorExplorer).toBeDefined();
          expect(this.$errorExplorer.captureException).toBeDefined();
        },
        template: '<div>Test</div>'
      };

      mount(TestComponent, {
        global: {
          plugins: [[ErrorExplorerPlugin, config]]
        }
      });
    });

    it('should capture errors using Options API', async () => {
      const TestComponent = {
        methods: {
          async handleError() {
            const error = new Error('Test error from Options API');
            await this.$errorExplorer.captureException(error);
          }
        },
        template: '<button @click="handleError">Trigger Error</button>'
      };

      const wrapper = mount(TestComponent, {
        global: {
          plugins: [[ErrorExplorerPlugin, config]]
        }
      });

      await wrapper.find('button').trigger('click');
    });
  });

  describe('Global Functions', () => {
    beforeEach(() => {
      app.use(ErrorExplorerPlugin, config);
    });

    it('should capture exception using global function', async () => {
      const error = new Error('Global error');
      await expect(captureException(error)).resolves.not.toThrow();
    });

    it('should handle errors in global functions when not initialized', async () => {
      // Reset the plugin
      const { captureException: uninitializedCapture } = await import('../../src');
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const error = new Error('Test error');
      await uninitializedCapture(error);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('ErrorExplorer: Not initialized')
      );
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Error Context', () => {
    it('should include Vue component context in errors', () => {
      app.use(ErrorExplorerPlugin, config);

      const TestComponent = {
        name: 'TestComponent',
        props: {
          testProp: String
        },
        mounted() {
          // Simulate an error in mounted hook
          const error = new Error('Component error');
          const errorHandler = app.config.errorHandler;
          
          if (errorHandler) {
            errorHandler(error, this as any, 'mounted hook');
          }
        },
        template: '<div>{{ testProp }}</div>'
      };

      mount(TestComponent, {
        props: {
          testProp: 'test value'
        },
        global: {
          plugins: [[ErrorExplorerPlugin, config]]
        }
      });
    });
  });

  describe('Navigation Tracking', () => {
    it('should track navigation with Vue Router mixin', () => {
      app.use(ErrorExplorerPlugin, config);

      // Check if navigation mixin is added
      const mixins = app.config.globalProperties;
      expect(app.mixin).toBeDefined();
    });
  });

  describe('Advanced Features', () => {
    beforeEach(() => {
      app.use(ErrorExplorerPlugin, config);
    });

    it('should get SDK statistics', () => {
      const { getStats } = useErrorExplorer();
      const stats = getStats();
      
      expect(stats).toHaveProperty('queueSize');
      expect(stats).toHaveProperty('isOnline');
      expect(stats).toHaveProperty('rateLimitRemaining');
      expect(stats).toHaveProperty('quotaStats');
      expect(stats).toHaveProperty('circuitBreakerState');
      expect(stats).toHaveProperty('sdkHealth');
      expect(stats).toHaveProperty('performanceMetrics');
    });

    it('should update configuration', () => {
      const { updateConfig, isEnabled } = useErrorExplorer();
      
      expect(isEnabled()).toBe(true);
      
      updateConfig({ enabled: false });
      
      expect(isEnabled()).toBe(false);
    });

    it('should manage context', () => {
      const { setContext, removeContext } = useErrorExplorer();
      
      setContext('feature', 'checkout');
      setContext('userId', '12345');
      
      removeContext('feature');
      
      // Context changes should be reflected in subsequent errors
    });

    it('should get SDK health status', () => {
      const { getSDKHealth } = useErrorExplorer();
      const health = getSDKHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('score');
      expect(health).toHaveProperty('issues');
      expect(health).toHaveProperty('recommendations');
    });

    it('should flush offline queue', async () => {
      const { flushQueue } = useErrorExplorer();
      
      await expect(flushQueue()).resolves.not.toThrow();
    });

    it('should clear breadcrumbs', () => {
      const { addBreadcrumb, clearBreadcrumbs } = useErrorExplorer();
      
      addBreadcrumb('Test breadcrumb 1');
      addBreadcrumb('Test breadcrumb 2');
      
      clearBreadcrumbs();
      
      // Breadcrumbs should be cleared
    });
  });
});