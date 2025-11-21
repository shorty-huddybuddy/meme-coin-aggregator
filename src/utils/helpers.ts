import { config } from '../config';

/**
 * RateLimiter - Implements sliding window rate limiting algorithm
 * 
 * Use Case: Prevents exceeding API rate limits (e.g., DexScreener: 300 req/min)
 * 
 * Algorithm:
 * - Stores timestamp of each request in array
 * - On each check: removes timestamps outside current window
 * - Allows request if count < maxRequests
 * 
 * Benefits over Fixed Window:
 * - Smooth rate distribution (no burst at window boundaries)
 * - More accurate limiting
 */
export class RateLimiter {
  private requestTimestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  /**
   * @param maxRequests - Maximum requests allowed in window (default: 300 from config)
   * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
   */
  constructor(maxRequests: number = config.rateLimit.dexScreener, windowMs: number = config.rateLimit.window) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Checks if request is within rate limit
   * 
   * @returns Promise<boolean> - true if allowed, false if rate limit exceeded
   * 
   * Side Effect: Records current timestamp if allowed (for future checks)
   * 
   * Implementation:
   * 1. Remove timestamps older than windowMs
   * 2. Check if remaining count < maxRequests
   * 3. If yes: add current timestamp and return true
   * 4. If no: return false (caller should retry with backoff)
   */
  async checkLimit(): Promise<boolean> {
    const now = Date.now();
    // Remove timestamps outside the current window
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    if (this.requestTimestamps.length >= this.maxRequests) {
      return false;
    }

    this.requestTimestamps.push(now);
    return true;
  }

  /**
   * Calculates how many requests are still available in current window
   * 
   * @returns number - Remaining request quota (0 if limit reached)
   * 
   * Use Case: API response headers (X-RateLimit-Remaining)
   */
  getRemainingRequests(): number {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < this.windowMs
    );
    return Math.max(0, this.maxRequests - this.requestTimestamps.length);
  }

  /**
   * Calculates milliseconds until rate limit resets (oldest request expires)
   * 
   * @returns number - Milliseconds until reset (0 if no requests in window)
   * 
   * Implementation:
   * - Finds oldest timestamp in window
   * - Returns time until it expires (oldest + windowMs - now)
   * 
   * Use Case: API response headers (X-RateLimit-Reset)
   */
  getResetTime(): number {
    if (this.requestTimestamps.length === 0) return 0;
    const oldest = this.requestTimestamps[0];
    return oldest + this.windowMs - Date.now();
  }
}

/**
 * Retries failed async operations with exponential backoff and jitter
 * 
 * @param fn - Async function to retry
 * @param maxRetries - Maximum retry attempts (default: 5)
 * @param baseDelay - Initial delay in ms (default: 1000 = 1s)
 * @param maxDelay - Maximum delay cap in ms (default: 30000 = 30s)
 * @returns Promise<T> - Result of successful fn() execution
 * @throws Error - If all retries exhausted
 * 
 * Algorithm:
 * 1. Try function execution
 * 2. On failure: wait (baseDelay * 2^attempt) + random jitter
 * 3. Repeat up to maxRetries times
 * 4. Jitter prevents thundering herd (multiple clients retrying simultaneously)
 * 
 * Example Delays (baseDelay=1000):
 * - Attempt 1: 1000-1500ms (1s + 0-500ms jitter)
 * - Attempt 2: 2000-2500ms (2s + jitter)
 * - Attempt 3: 4000-4500ms (4s + jitter)
 * - Attempt 4: 8000-8500ms (8s + jitter)
 * - Attempt 5: 16000-16500ms (16s + jitter, capped at maxDelay)
 * 
 * Use Cases:
 * - API rate limit errors (429 Too Many Requests)
 * - Temporary network failures
 * - Database connection timeouts
 */
export async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries - 1) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
      const delay = exponentialDelay + jitter;

      console.log(`Attempt ${attempt + 1} failed. Retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Pauses execution for specified duration
 * 
 * @param ms - Delay in milliseconds
 * @returns Promise<void> - Resolves after delay
 * 
 * Use Case: Adding delays between retry attempts in exponentialBackoff
 * 
 * Example:
 * await sleep(1000); // Pauses for 1 second
 * console.log('1 second later...');
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Type definition for cursor payload data
 * Supports both simple number (legacy) and object with fingerprint (current)
 */
export type CursorPayload = { index: number; fingerprint?: string } | number;

/**
 * Generates base64-encoded cursor for pagination
 * 
 * @param payload - Either number (index only) or object with index and fingerprint
 * @returns string - Base64-encoded cursor (URL-safe)
 * 
 * Structure:
 * - index: Position in dataset (e.g., 20 = start of page 3 with limit=10)
 * - fingerprint: Hash of current filters/sort (ensures cursor only works with same query)
 * 
 * Example:
 * Input: { index: 20, fingerprint: "abc123" }
 * Output: "eyJpbmRleCI6MjAsImZpbmdlcnByaW50IjoiYWJjMTIzIn0="
 * 
 * Security: Prevents cursor reuse across different filter combinations
 * (e.g., cursor from "volume > 1000" won't work with "volume > 500")
 */
export function generateCursor(payload: CursorPayload): string {
  // Normalize to an object so we can extend in future (fingerprint, timestamp)
  const obj = typeof payload === 'number' ? { index: payload } : payload;
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

/**
 * Decodes base64 cursor back to pagination state object
 * Supports both legacy number format and current object format
 * 
 * @param cursor - Base64-encoded cursor string
 * @returns any - Decoded object { index, fingerprint? } or number (legacy) or null if invalid
 * 
 * Error Handling:
 * - Invalid base64: Returns null
 * - Invalid JSON: Tries parsing as plain number (legacy support)
 * - Malformed data: Returns null
 * 
 * Use Case:
 * Client sends cursor from previous response → Decode to get index → Resume pagination
 * 
 * Example:
 * Input: "eyJpbmRleCI6MjB9"
 * Output: { index: 20 }
 */
export function decodeCursor(cursor: string): any {
  try {
    const str = Buffer.from(cursor, 'base64').toString('utf-8');
    // Try JSON decode first (new format)
    try {
      const parsed = JSON.parse(str);
      return parsed;
    } catch {
      // not JSON, fall back
    }

    // Fallback to legacy integer-only cursor
    const decoded = parseInt(str, 10);
    return { index: isNaN(decoded) ? 0 : decoded };
  } catch {
    return { index: 0 };
  }
}
