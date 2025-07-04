import { OfflineManager } from '../../../src/services/OfflineManager';
import { ErrorData } from '../../../src/types';

describe('OfflineManager', () => {
  let offlineManager: OfflineManager;
  let mockErrorData: ErrorData;
  let onlineGetter: jest.SpyInstance;
  let localStorageMock: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    
    // Mock localStorage
    localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    });

    // Mock navigator.onLine
    onlineGetter = jest.spyOn(navigator, 'onLine', 'get');
    onlineGetter.mockReturnValue(true);

    offlineManager = new OfflineManager(5, 24 * 60 * 60 * 1000); // 5 items, 24 hours

    mockErrorData = {
      message: 'Test error',
      exception_class: 'Error',
      stack_trace: 'Error: Test error\n    at test.js:1:1',
      file: 'test.js',
      line: 1,
      project: 'test-project',
      environment: 'test',
      timestamp: new Date().toISOString()
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    onlineGetter.mockRestore();
    offlineManager.destroy();
  });

  describe('handleError', () => {
    it('should send error immediately when online', async () => {
      const sendFunction = jest.fn().mockResolvedValue(undefined);
      offlineManager.setSendFunction(sendFunction);
      
      await offlineManager.handleError(mockErrorData);
      
      expect(sendFunction).toHaveBeenCalledWith(mockErrorData);
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should queue error when offline', async () => {
      onlineGetter.mockReturnValue(false);
      
      await offlineManager.handleError(mockErrorData);
      
      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(savedData.length).toBe(1);
      expect(savedData[0].error).toEqual(mockErrorData);
    });

    it('should handle send function errors gracefully', async () => {
      const sendFunction = jest.fn().mockRejectedValue(new Error('Network error'));
      offlineManager.setSendFunction(sendFunction);
      
      await offlineManager.handleError(mockErrorData);
      
      expect(sendFunction).toHaveBeenCalledWith(mockErrorData);
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should respect queue size limit', async () => {
      onlineGetter.mockReturnValue(false);
      
      // Fill queue beyond limit
      for (let i = 0; i < 7; i++) {
        await offlineManager.handleError({
          ...mockErrorData,
          message: `Error ${i}`
        });
      }
      
      const savedData = JSON.parse(localStorageMock.setItem.mock.calls[6][1]);
      expect(savedData.length).toBe(5); // Max queue size
      
      // Should keep newest errors
      expect(savedData[0].error.message).toBe('Error 2');
      expect(savedData[4].error.message).toBe('Error 6');
    });
  });

  describe('flushQueue', () => {
    beforeEach(() => {
      const sendFunction = jest.fn().mockResolvedValue(undefined);
      offlineManager.setSendFunction(sendFunction);
    });

    it('should send all queued errors', async () => {
      const queuedData = [
        { error: { ...mockErrorData, message: 'Error 1' }, timestamp: Date.now() },
        { error: { ...mockErrorData, message: 'Error 2' }, timestamp: Date.now() }
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(queuedData));
      
      await offlineManager.flushQueue();
      
      const sendFunction = (offlineManager as any).sendFunction;
      expect(sendFunction).toHaveBeenCalledTimes(2);
      expect(sendFunction).toHaveBeenCalledWith(queuedData[0].error);
      expect(sendFunction).toHaveBeenCalledWith(queuedData[1].error);
      expect(localStorageMock.removeItem).toHaveBeenCalled();
    });

    it('should handle empty queue', async () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      await offlineManager.flushQueue();
      
      const sendFunction = (offlineManager as any).sendFunction;
      expect(sendFunction).not.toHaveBeenCalled();
    });

    it('should handle send failures gracefully', async () => {
      const sendFunction = jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);
      offlineManager.setSendFunction(sendFunction);
      
      const queuedData = [
        { error: { ...mockErrorData, message: 'Error 1' }, timestamp: Date.now() },
        { error: { ...mockErrorData, message: 'Error 2' }, timestamp: Date.now() },
        { error: { ...mockErrorData, message: 'Error 3' }, timestamp: Date.now() }
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(queuedData));
      
      await offlineManager.flushQueue();
      
      expect(sendFunction).toHaveBeenCalledTimes(3);
      // Queue should still be cleared even with failures
      expect(localStorageMock.removeItem).toHaveBeenCalled();
    });

    it('should filter out expired errors', async () => {
      const now = Date.now();
      const queuedData = [
        { error: { ...mockErrorData, message: 'Old error' }, timestamp: now - (25 * 60 * 60 * 1000) }, // 25 hours old
        { error: { ...mockErrorData, message: 'Recent error' }, timestamp: now - (1 * 60 * 60 * 1000) } // 1 hour old
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(queuedData));
      
      await offlineManager.flushQueue();
      
      const sendFunction = (offlineManager as any).sendFunction;
      expect(sendFunction).toHaveBeenCalledTimes(1);
      expect(sendFunction).toHaveBeenCalledWith(queuedData[1].error);
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', () => {
      const queuedData = [
        { error: mockErrorData, timestamp: Date.now() },
        { error: mockErrorData, timestamp: Date.now() }
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(queuedData));
      
      const stats = offlineManager.getQueueStats();
      
      expect(stats).toEqual({
        size: 2,
        oldestTimestamp: queuedData[0].timestamp,
        newestTimestamp: queuedData[1].timestamp,
        isOnline: true
      });
    });

    it('should handle empty queue', () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      const stats = offlineManager.getQueueStats();
      
      expect(stats).toEqual({
        size: 0,
        oldestTimestamp: undefined,
        newestTimestamp: undefined,
        isOnline: true
      });
    });

    it('should reflect offline status', () => {
      onlineGetter.mockReturnValue(false);
      localStorageMock.getItem.mockReturnValue(null);
      
      const stats = offlineManager.getQueueStats();
      
      expect(stats.isOnline).toBe(false);
    });
  });

  describe('online/offline events', () => {
    it('should listen for online event and flush queue', async () => {
      const sendFunction = jest.fn().mockResolvedValue(undefined);
      offlineManager.setSendFunction(sendFunction);
      
      const queuedData = [
        { error: mockErrorData, timestamp: Date.now() }
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(queuedData));
      
      // Trigger online event
      window.dispatchEvent(new Event('online'));
      
      // Wait for async flush
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(sendFunction).toHaveBeenCalledWith(mockErrorData);
    });
  });

  describe('loadQueue and saveQueue', () => {
    it('should handle localStorage errors gracefully', async () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage error');
      });
      
      // Should not throw
      const stats = offlineManager.getQueueStats();
      expect(stats.size).toBe(0);
    });

    it('should handle invalid JSON in localStorage', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');
      
      const stats = offlineManager.getQueueStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should clean up event listeners', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      
      offlineManager.destroy();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    });
  });
});