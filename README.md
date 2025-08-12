# error-explorer-vuejs-reporter

Vue.js SDK for Error Explorer - Capture and report errors automatically from your Vue.js applications.

## Installation

```bash
npm install error-explorer-vuejs-reporter
# or
yarn add error-explorer-vuejs-reporter
```

## Quick Start

### Vue 3 Plugin Installation

```javascript
import { createApp } from 'vue';
import ErrorExplorerPlugin from 'error-explorer-vuejs-reporter';
import App from './App.vue';

const app = createApp(App);

app.use(ErrorExplorerPlugin, {
  webhookUrl: 'https://error-explorer.com/webhook/project-token',
  projectName: 'my-vue-app',
  environment: 'production'
});

app.mount('#app');
```

### Composition API Usage

```vue
<template>
  <div>
    <button @click="triggerError">Trigger Error</button>
    <button @click="captureMsg">Capture Message</button>
  </div>
</template>

<script setup>
import { useErrorExplorer } from 'error-explorer-vuejs-reporter';

const { captureException, captureMessage, addBreadcrumb, setUser } = useErrorExplorer();

// Set user context
setUser({
  id: 123,
  email: 'user@example.com',
  username: 'john_doe'
});

function triggerError() {
  try {
    throw new Error('This is a test error');
  } catch (error) {
    captureException(error, { context: 'button_click' });
  }
}

function captureMsg() {
  addBreadcrumb('User clicked capture message button', 'user');
  captureMessage('User performed an action', 'info', {
    action: 'capture_message'
  });
}
</script>
```

### Options API Usage

```vue
<template>
  <div>
    <button @click="triggerError">Trigger Error</button>
  </div>
</template>

<script>
export default {
  mounted() {
    // Set user context
    this.$errorExplorer.setUser({
      id: 123,
      email: 'user@example.com'
    });
  },
  methods: {
    triggerError() {
      try {
        throw new Error('Options API error');
      } catch (error) {
        this.$errorExplorer.captureException(error, {
          component: this.$options.name,
          route: this.$route?.path
        });
      }
    }
  }
}
</script>
```

### Standalone Usage (without plugin)

```javascript
import { createErrorExplorer, captureException } from 'error-explorer-vuejs-reporter';

// Initialize
const errorReporter = createErrorExplorer({
  webhookUrl: 'https://error-explorer.com/webhook/project-token',
  projectName: 'my-vue-app',
  environment: 'production'
});

// Use anywhere in your app
try {
  riskyOperation();
} catch (error) {
  captureException(error);
}
```

## Configuration

### Required Options

- `webhookUrl`: Your Error Explorer webhook URL
- `projectName`: Name of your project

### Optional Options

```javascript
app.use(ErrorExplorerPlugin, {
  webhookUrl: 'https://error-explorer.com/webhook/project-token',
  projectName: 'my-vue-app',
  environment: 'production',                    // Default: 'production'
  enabled: true,                                // Default: true
  userId: 'user123',                           // Optional: Default user ID
  userEmail: 'user@example.com',               // Optional: Default user email
  maxBreadcrumbs: 50,                          // Default: 50
  timeout: 5000,                               // Default: 5000ms
  retries: 3,                                  // Default: 3
  captureUnhandledRejections: true,            // Default: true
  captureConsoleErrors: false,                 // Default: false
  commitHash: null,                            // Optional: Git commit hash
  
  // Compression and batching (automatically disabled in development)
  enableCompression: true,                     // Default: true in production, false in development
  enableBatching: true,                        // Default: true in production, false in development
  
  beforeSend: (data) => {                      // Optional: Filter/modify data
    // Filter sensitive data
    if (data.context?.password) {
      data.context.password = '[FILTERED]';
    }
    return data;
  }
});
```

### Providing the Commit Hash

To link errors with your source code, you should provide the git commit hash of the current build. You can do this by setting an environment variable during your build process.

**1. Get the commit hash:**
```bash
export VUE_APP_COMMIT_HASH=$(git rev-parse HEAD)
```

**2. Use it in your configuration:**
```javascript
app.use(ErrorExplorerPlugin, {
  // ... other config
  commitHash: process.env.VUE_APP_COMMIT_HASH,
});
```

## API Reference

### useErrorExplorer() (Composition API)

Returns an object with error reporting methods:

```javascript
const {
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser
} = useErrorExplorer();
```

### $errorExplorer (Options API)

Available as a global property in all components:

```javascript
this.$errorExplorer.captureException(error);
this.$errorExplorer.captureMessage('Message');
this.$errorExplorer.addBreadcrumb('Breadcrumb');
this.$errorExplorer.setUser({ id: 123 });
```

### Global Functions

```javascript
import {
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser
} from 'error-explorer-vuejs-reporter';

captureException(new Error('Global error'));
captureMessage('Global message', 'info');
addBreadcrumb('Global breadcrumb', 'custom');
setUser({ id: 123, email: 'user@example.com' });
```

## Vue Router Integration

The plugin automatically tracks navigation when Vue Router is available:

```javascript
// Navigation breadcrumbs are automatically added
// From: /home
// To: /profile
```

## Error Boundary Component

Create a reusable error boundary component:

```vue
<template>
  <div>
    <div v-if="hasError" class="error-boundary">
      <h2>Something went wrong</h2>
      <p>{{ errorMessage }}</p>
      <button @click="retry">Try again</button>
    </div>
    <slot v-else />
  </div>
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue';
import { useErrorExplorer } from 'error-explorer-vuejs-reporter';

const { captureException } = useErrorExplorer();

const hasError = ref(false);
const errorMessage = ref('');

onErrorCaptured((error, instance, info) => {
  hasError.value = true;
  errorMessage.value = error.message;
  
  // Capture the error
  captureException(error, {
    component: instance?.type?.name,
    errorInfo: info,
    errorBoundary: true
  });
  
  // Prevent the error from propagating
  return false;
});

function retry() {
  hasError.value = false;
  errorMessage.value = '';
}
</script>
```

## Advanced Usage

### Custom Breadcrumbs

```javascript
// Track user interactions
addBreadcrumb('User clicked submit button', 'user', 'info', {
  buttonId: 'submit-form',
  formData: { /* form data */ }
});

// Track component lifecycle
addBreadcrumb('ProfileComponent mounted', 'vue.lifecycle', 'debug');

// Track API calls
addBreadcrumb('Fetching user profile', 'http', 'info', {
  url: '/api/user/profile',
  method: 'GET'
});
```

### Context and User Data

```javascript
// Set user context globally
setUser({
  id: 123,
  email: 'user@example.com',
  username: 'john_doe',
  subscription: 'premium'
});

// Capture with specific context
captureException(error, {
  feature: 'checkout',
  step: 'payment',
  amount: 99.99,
  paymentMethod: 'credit_card'
});
```

### Async Error Handling

```javascript
// Handle async operations
async function fetchUserData() {
  try {
    addBreadcrumb('Starting user data fetch', 'api');
    const response = await api.get('/user');
    addBreadcrumb('User data fetched successfully', 'api', 'info');
    return response.data;
  } catch (error) {
    captureException(error, {
      operation: 'fetchUserData',
      endpoint: '/user'
    });
    throw error;
  }
}
```

### Performance Monitoring

```javascript
// Track component performance
const startTime = Date.now();

// ... component logic ...

const endTime = Date.now();
const duration = endTime - startTime;

if (duration > 1000) {
  captureMessage(`Slow component render: ${duration}ms`, 'warning', {
    component: 'SlowComponent',
    duration,
    threshold: 1000
  });
}
```

## Local Development & CORS Issues

### Development Configuration

For local development, the SDK automatically disables compression and batching to avoid CORS issues. However, you can explicitly configure it:

```javascript
app.use(ErrorExplorerPlugin, {
  webhookUrl: 'http://error-explorer.localhost/webhook/error/your-token',
  projectName: 'my-vue-app',
  environment: 'development',
  debug: true,
  enableCompression: false,        // Avoid CORS issues
  enableBatching: false           // Send errors immediately
});
```

### Common CORS Issues

If you encounter CORS errors like:
- `Request header field content-encoding is not allowed by Access-Control-Allow-Headers`
- `Request header field x-sdk-version is not allowed by Access-Control-Allow-Headers`

**Solution**: The SDK has been updated to avoid these issues by:
1. Using only standard headers (`Content-Type: application/json`)
2. Automatically disabling compression in development mode
3. Using native fetch API instead of axios

### Troubleshooting

**Problem**: Errors are not appearing in Error Explorer dashboard
**Solution**: 
1. Check browser console for network errors
2. Ensure your webhook URL is correct
3. Verify CORS is properly configured on your Error Explorer server
4. Try disabling compression and batching for testing

**Problem**: "Failed to fetch" errors
**Solution**:
1. Check that your Error Explorer server is accessible
2. Verify the webhook URL format: `http://error-explorer/webhook/error/your-token`
3. Test the webhook URL directly with curl

```bash
curl -X POST http://error-explorer.localhost/webhook/error/your-token \
  -H "Content-Type: application/json" \
  -d '{"message":"test","project":"test"}'
```

## TypeScript Support

This package includes full TypeScript definitions:

```typescript
import { ErrorExplorerConfig } from 'error-explorer-vuejs-reporter';

const config: ErrorExplorerConfig = {
  webhookUrl: 'https://error-explorer.com/webhook/project-token',
  projectName: 'my-vue-app',
  environment: 'production'
};
```

## Environment Variables

```bash
VUE_APP_ERROR_EXPLORER_WEBHOOK_URL=https://error-explorer.com/webhook/project-token
VUE_APP_ERROR_EXPLORER_PROJECT_NAME=my-vue-app
VUE_APP_ERROR_EXPLORER_ENVIRONMENT=production
```

```javascript
app.use(ErrorExplorerPlugin, {
  webhookUrl: process.env.VUE_APP_ERROR_EXPLORER_WEBHOOK_URL,
  projectName: process.env.VUE_APP_ERROR_EXPLORER_PROJECT_NAME,
  environment: process.env.VUE_APP_ERROR_EXPLORER_ENVIRONMENT
});
```

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## License

MIT