import { sleep } from '../utils/helpers';

type Task<T> = () => Promise<T>;

/**
 * Token bucket rate limiter with concurrency control
 * 
 * Purpose:
 * Implements token bucket algorithm for rate limiting upstream API calls.
 * Prevents exceeding API rate limits and manages concurrent request limits.
 * 
 * Algorithm: Token Bucket
 * - Bucket capacity: Maximum burst of requests
 * - Refill rate: Tokens added per second
 * - Token cost: 1 token per request
 * - Behavior: Requests wait when bucket empty
 * 
 * Features:
 * - Rate limiting: Requests per minute capping
 * - Concurrency control: Max simultaneous requests
 * - Request queuing: FIFO queue when limits exceeded
 * - Automatic refilling: Tokens refill every second
 * - Backoff on errors: 200ms delay after failures
 * 
 * Components:
 * 1. Token Bucket:
 *    - tokens: Current available tokens
 *    - capacity: Maximum tokens (burst size)
 *    - refillAmount: Tokens added per refill interval
 *    - refillIntervalMs: 1000ms (1 second)
 * 
 * 2. Concurrency Limiter:
 *    - concurrent: Current running requests
 *    - concurrencyLimit: Maximum simultaneous requests
 * 
 * 3. Request Queue:
 *    - FIFO queue of pending requests
 *    - Processed when tokens/concurrency available
 * 
 * Flow:
 * 1. Client calls schedule(task)
 * 2. Task added to queue
 * 3. processQueue() checks tokens and concurrency
 * 4. If available: Execute task, decrement token, increment concurrent
 * 5. If not: Wait in queue
 * 6. On completion: Decrement concurrent, process next in queue
 * 7. Tokens refill every second automatically
 * 
 * Configuration:
 * - ratePerMinute: Total requests allowed per minute
 * - burst: Initial tokens (default: max(1, ratePerMinute/60))
 * - concurrency: Max simultaneous requests (default: 5)
 * 
 * @class UpstreamRateLimiter
 * 
 * @example
 * // Create limiter: 150 req/min, burst 5, max 3 concurrent
 * const limiter = new UpstreamRateLimiter(150, 5, 3);
 * 
 * // Schedule API call
 * const result = await limiter.schedule(async () => {
 *   return await axios.get('/api/data');
 * });
 * 
 * // Multiple calls queued and rate-limited
 * const promises = Array.from({ length: 100 }, (_, i) =>
 *   limiter.schedule(() => fetchData(i))
 * );
 * await Promise.all(promises);
 * // Executes at most 3 concurrent, 150/min rate
 */
export class UpstreamRateLimiter {
  private tokens: number;
  private capacity: number;
  private refillIntervalMs: number;
  private refillAmount: number;
  private queue: Array<{
    task: Task<any>;
    resolve: (v: any) => void;
    reject: (e: any) => void;
  }> = [];
  private concurrent = 0;
  private concurrencyLimit: number;

  /**
   * Initialize token bucket rate limiter
   * 
   * Purpose:
   * Configures rate limiting and concurrency parameters.
   * Starts automatic token refill interval.
   * 
   * Parameters:
   * @param {number} ratePerMinute - Maximum requests per minute
   * @param {number} [burst=1] - Initial burst capacity (tokens available immediately)
   * @param {number} [concurrency=5] - Maximum simultaneous requests
   * 
   * Calculations:
   * - Capacity: max(burst, ceil(ratePerMinute/60))
   * - Refill amount: (ratePerMinute/60) per second
   * - Initial tokens: Set to capacity (full bucket)
   * 
   * Refill Interval:
   * - Runs every 1000ms (1 second)
   * - Adds refillAmount tokens per interval
   * - Capped at capacity (no overflow)
   * 
   * @example
   * // DexScreener: 150/min, burst 3, max 3 concurrent
   * const dexLimiter = new UpstreamRateLimiter(150, 3, 3);
   * // Capacity: 3, Refill: 2.5 tokens/second
   * 
   * // Jupiter: 150/min, burst 3, max 3 concurrent
   * const jupiterLimiter = new UpstreamRateLimiter(150, 3, 3);
   */
  constructor(ratePerMinute: number, burst: number = 1, concurrency: number = 5) {
    this.capacity = Math.max(burst, Math.ceil(ratePerMinute / 60));
    this.tokens = this.capacity;
    this.refillIntervalMs = 1000; // refill per second
    this.refillAmount = ratePerMinute / 60 / (1000 / this.refillIntervalMs);
    this.concurrencyLimit = concurrency;
    setInterval(() => this.refill(), this.refillIntervalMs);
  }

  private refill() {
    this.tokens = Math.min(this.capacity, this.tokens + this.refillAmount);
    this.processQueue();
  }

  private processQueue() {
    while (this.queue.length > 0 && this.tokens >= 1 && this.concurrent < this.concurrencyLimit) {
      const item = this.queue.shift()!;
      this.execute(item.task, item.resolve, item.reject);
    }
  }

  private async execute(task: Task<any>, resolve: (v: any) => void, reject: (e: any) => void) {
    if (this.tokens < 1 || this.concurrent >= this.concurrencyLimit) {
      // requeue
      this.queue.unshift({ task, resolve, reject });
      return;
    }
    this.tokens -= 1;
    this.concurrent += 1;
    try {
      const result = await task();
      resolve(result);
    } catch (e) {
      // On error we wait a bit (simple backoff) and reject to caller
      await sleep(200);
      reject(e);
    } finally {
      this.concurrent -= 1;
      this.processQueue();
    }
  }

  /**
   * Schedule a task with rate limiting and concurrency control
   * 
   * Purpose:
   * Queues task for execution when tokens and concurrency available.
   * Primary interface for rate-limited API calls.
   * 
   * Behavior:
   * 1. Wraps task in Promise
   * 2. Adds to queue with resolve/reject callbacks
   * 3. Calls processQueue() to attempt execution
   * 4. If tokens/concurrency available: Executes immediately
   * 5. If not: Waits in queue until resources available
   * 6. Returns task result or throws task error
   * 
   * Queue Processing:
   * - FIFO order (first scheduled, first executed)
   * - Automatic retry when tokens refill
   * - Automatic retry when concurrent requests complete
   * 
   * Error Handling:
   * - Task errors propagated to caller
   * - 200ms backoff delay on errors
   * - Concurrency slot released after error
   * - Next queued task processed
   * 
   * @param {Task<T>} task - Async function to execute
   * @returns {Promise<T>} Task result when executed
   * @template T - Return type of task
   * 
   * @example
   * // Schedule single API call
   * const data = await limiter.schedule(async () => {
   *   const response = await axios.get('/api/endpoint');
   *   return response.data;
   * });
   * 
   * // Schedule multiple calls (queued automatically)
   * const promises = [
   *   limiter.schedule(() => fetchToken('SOL')),
   *   limiter.schedule(() => fetchToken('BONK')),
   *   limiter.schedule(() => fetchToken('WIF'))
   * ];
   * const results = await Promise.all(promises);
   * 
   * // Error handling
   * try {
   *   await limiter.schedule(() => riskyApiCall());
   * } catch (error) {
   *   console.error('API call failed:', error);
   * }
   */
  schedule<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }
}

export default UpstreamRateLimiter;
