import { RateLimiter, exponentialBackoff, generateCursor, decodeCursor } from '../utils/helpers';

describe('Helpers', () => {
  describe('RateLimiter', () => {
    it('should allow requests within limit', async () => {
      const limiter = new RateLimiter(5, 1000);
      
      for (let i = 0; i < 5; i++) {
        const canProceed = await limiter.checkLimit();
        expect(canProceed).toBe(true);
      }
    });

    it('should block requests exceeding limit', async () => {
      const limiter = new RateLimiter(3, 1000);
      
      // Fill the limit
      for (let i = 0; i < 3; i++) {
        await limiter.checkLimit();
      }

      // Should be blocked
      const canProceed = await limiter.checkLimit();
      expect(canProceed).toBe(false);
    });

    it('should get remaining requests correctly', async () => {
      const limiter = new RateLimiter(5, 1000);
      
      expect(limiter.getRemainingRequests()).toBe(5);
      
      await limiter.checkLimit();
      expect(limiter.getRemainingRequests()).toBe(4);
      
      await limiter.checkLimit();
      expect(limiter.getRemainingRequests()).toBe(3);
    });
  });

  describe('exponentialBackoff', () => {
    it('should succeed on first try', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await exponentialBackoff(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValueOnce('success');
      
      const result = await exponentialBackoff(fn, 5, 10, 100);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));
      
      await expect(exponentialBackoff(fn, 3, 10, 100)).rejects.toThrow('persistent failure');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Cursor encoding/decoding', () => {
    it('should encode and decode cursor correctly', () => {
      const index = 42;
      const cursor = generateCursor(index);
      const decoded = decodeCursor(cursor);
      
      expect(decoded).toBe(index);
    });

    it('should handle invalid cursor gracefully', () => {
      const decoded = decodeCursor('invalid-cursor');
      expect(decoded).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(decodeCursor(generateCursor(0))).toBe(0);
      expect(decodeCursor(generateCursor(999999))).toBe(999999);
    });
  });
});
