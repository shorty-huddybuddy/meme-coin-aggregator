/**
 * In-memory metrics tracking service
 * 
 * Purpose:
 * Tracks application metrics (request counts, rate limits, auth failures).
 * Provides simple counters for monitoring and debugging.
 * 
 * Metrics Tracked:
 * - requests: Total HTTP requests received
 * - rateLimitEvents: Number of rate limit hits
 * - authFailures: Failed authentication attempts
 * 
 * Features:
 * - In-memory storage (resets on server restart)
 * - Thread-safe increment operations
 * - Snapshot export via getAll()
 * 
 * Use Cases:
 * - GET /api/metrics endpoint
 * - Performance monitoring
 * - Rate limit analysis
 * - Security monitoring (auth failures)
 * 
 * Limitations:
 * - Not persistent (lost on restart)
 * - No historical data
 * - No distributed support (single instance)
 * - For production: Use Prometheus, StatsD, or Datadog
 * 
 * Performance:
 * - Increment: O(1) constant time
 * - GetAll: O(n) where n = number of counters
 * - Memory: Minimal (~100 bytes per counter)
 * 
 * @class MetricsService
 * 
 * @example
 * // Increment request counter
 * metrics.increment('requests');
 * 
 * // Increment by custom amount
 * metrics.increment('rateLimitEvents', 5);
 * 
 * // Get all metrics
 * const allMetrics = metrics.getAll();
 * // { requests: 1234, rateLimitEvents: 56, authFailures: 12 }
 */
class MetricsService {
  private counters: Record<string, number> = {
    requests: 0,
    rateLimitEvents: 0,
    authFailures: 0,
  };

  /**
   * Increment a metric counter
   * 
   * Purpose:
   * Atomically increments a counter by specified amount.
   * Initializes counter to 0 if it doesn't exist.
   * 
   * Behavior:
   * - Counter exists: Add 'by' to current value
   * - Counter missing: Initialize to 0, then add 'by'
   * - Default increment: 1
   * 
   * Thread Safety:
   * Single-threaded Node.js ensures atomic operations.
   * No race conditions in increment logic.
   * 
   * @param {string} key - Counter name (requests, rateLimitEvents, authFailures)
   * @param {number} [by=1] - Amount to increment by (default: 1)
   * 
   * @example
   * // Increment by 1
   * metrics.increment('requests');
   * // requests: 0 → 1
   * 
   * // Increment by custom amount
   * metrics.increment('rateLimitEvents', 10);
   * // rateLimitEvents: 0 → 10
   * 
   * // Multiple increments accumulate
   * metrics.increment('requests');
   * metrics.increment('requests');
   * metrics.increment('requests');
   * // requests: 0 → 1 → 2 → 3
   */
  increment(key: keyof typeof this.counters, by = 1): void {
    if (!this.counters[key]) this.counters[key] = 0;
    this.counters[key] += by;
  }

  /**
   * Get snapshot of all metric counters
   * 
   * Purpose:
   * Returns copy of all counter values for reporting.
   * Used by GET /api/metrics endpoint.
   * 
   * Return Value:
   * Object with all counter names and their current values.
   * Returns shallow copy (modifications don't affect internal state).
   * 
   * @returns {Record<string, number>} Copy of all counters
   * 
   * @example
   * const metrics = metricsService.getAll();
   * console.log(metrics);
   * // {
   * //   requests: 1234,
   * //   rateLimitEvents: 56,
   * //   authFailures: 12
   * // }
   * 
   * // Modifying returned object doesn't affect internal state
   * metrics.requests = 0; // Internal counter still 1234
   */
  getAll(): Record<string, number> {
    return { ...this.counters };
  }
}

export const metrics = new MetricsService();

export default metrics;
