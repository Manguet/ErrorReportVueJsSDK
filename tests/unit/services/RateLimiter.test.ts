import { RateLimiter } from '../../../src/services/RateLimiter';
import { ErrorData } from '../../../src/types';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  let mockErrorData: ErrorData;

  beforeEach(() => {
    jest.useFakeTimers();
    
    rateLimiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60000, // 1 minute
      duplicateErrorWindow: 5000 // 5 seconds
    });

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
    rateLimiter.destroy();
  });

  describe('canSendError', () => {
    it('should allow error within rate limit', () => {
      const result = rateLimiter.canSendError(mockErrorData);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block duplicate errors', () => {
      rateLimiter.markErrorSent(mockErrorData);
      
      const result = rateLimiter.canSendError(mockErrorData);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Duplicate error within 5 seconds');
    });

    it('should allow duplicate after window expires', () => {
      rateLimiter.markErrorSent(mockErrorData);
      
      // Advance time past duplicate window
      jest.advanceTimersByTime(6000);
      
      const result = rateLimiter.canSendError(mockErrorData);
      
      expect(result.allowed).toBe(true);
    });

    it('should block when rate limit exceeded', () => {
      // Send max requests
      for (let i = 0; i < 5; i++) {
        const error = { ...mockErrorData, message: `Error ${i}` };
        rateLimiter.markErrorSent(error);
      }
      
      // Try to send one more
      const newError = { ...mockErrorData, message: 'New error' };
      const result = rateLimiter.canSendError(newError);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Rate limit exceeded: 5 requests per minute');
    });

    it('should reset rate limit after window', () => {
      // Fill up rate limit
      for (let i = 0; i < 5; i++) {
        const error = { ...mockErrorData, message: `Error ${i}` };
        rateLimiter.markErrorSent(error);
      }
      
      // Advance time past rate limit window
      jest.advanceTimersByTime(61000);
      
      const newError = { ...mockErrorData, message: 'New error' };
      const result = rateLimiter.canSendError(newError);
      
      expect(result.allowed).toBe(true);
    });
  });

  describe('markErrorSent', () => {
    it('should track sent errors', () => {
      rateLimiter.markErrorSent(mockErrorData);
      
      // Should not allow duplicate immediately
      const result = rateLimiter.canSendError(mockErrorData);
      expect(result.allowed).toBe(false);
    });

    it('should increment request count', () => {
      const stats = rateLimiter.getStats();
      expect(stats.requestCount).toBe(0);
      
      rateLimiter.markErrorSent(mockErrorData);
      
      const newStats = rateLimiter.getStats();
      expect(newStats.requestCount).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return current statistics', () => {
      const stats = rateLimiter.getStats();
      
      expect(stats).toEqual({
        requestCount: 0,
        windowStart: expect.any(Number),
        duplicateHashes: [],
        isRateLimited: false
      });
    });

    it('should update stats after sending errors', () => {
      rateLimiter.markErrorSent(mockErrorData);
      rateLimiter.markErrorSent({ ...mockErrorData, message: 'Another error' });
      
      const stats = rateLimiter.getStats();
      
      expect(stats.requestCount).toBe(2);
      expect(stats.duplicateHashes.length).toBe(2);
      expect(stats.isRateLimited).toBe(false);
    });

    it('should show rate limited status', () => {
      // Fill up rate limit
      for (let i = 0; i < 5; i++) {
        const error = { ...mockErrorData, message: `Error ${i}` };
        rateLimiter.markErrorSent(error);
      }
      
      const stats = rateLimiter.getStats();
      expect(stats.isRateLimited).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all tracked data', () => {
      rateLimiter.markErrorSent(mockErrorData);
      rateLimiter.markErrorSent({ ...mockErrorData, message: 'Another error' });
      
      rateLimiter.reset();
      
      const stats = rateLimiter.getStats();
      expect(stats.requestCount).toBe(0);
      expect(stats.duplicateHashes.length).toBe(0);
    });

    it('should allow previously blocked errors', () => {
      rateLimiter.markErrorSent(mockErrorData);
      
      // Verify it's blocked
      expect(rateLimiter.canSendError(mockErrorData).allowed).toBe(false);
      
      rateLimiter.reset();
      
      // Should now be allowed
      expect(rateLimiter.canSendError(mockErrorData).allowed).toBe(true);
    });
  });

  describe('error fingerprinting', () => {
    it('should generate consistent fingerprints for same errors', () => {
      const error1 = { ...mockErrorData };
      const error2 = { ...mockErrorData };
      
      rateLimiter.markErrorSent(error1);
      
      // Same error should be blocked
      const result = rateLimiter.canSendError(error2);
      expect(result.allowed).toBe(false);
    });

    it('should generate different fingerprints for different errors', () => {
      const error1 = { ...mockErrorData, message: 'Error 1' };
      const error2 = { ...mockErrorData, message: 'Error 2' };
      
      rateLimiter.markErrorSent(error1);
      
      // Different error should be allowed
      const result = rateLimiter.canSendError(error2);
      expect(result.allowed).toBe(true);
    });

    it('should consider stack trace in fingerprint', () => {
      const error1 = { ...mockErrorData, stack_trace: 'Stack 1' };
      const error2 = { ...mockErrorData, stack_trace: 'Stack 2' };
      
      rateLimiter.markErrorSent(error1);
      
      // Different stack should be allowed
      const result = rateLimiter.canSendError(error2);
      expect(result.allowed).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clean up old duplicate entries', () => {
      // Add some errors
      rateLimiter.markErrorSent(mockErrorData);
      rateLimiter.markErrorSent({ ...mockErrorData, message: 'Error 2' });
      
      // Advance time past duplicate window
      jest.advanceTimersByTime(6000);
      
      // Trigger cleanup by checking a new error
      rateLimiter.canSendError({ ...mockErrorData, message: 'New error' });
      
      // Old duplicates should be cleaned up
      const result = rateLimiter.canSendError(mockErrorData);
      expect(result.allowed).toBe(true);
    });
  });
});