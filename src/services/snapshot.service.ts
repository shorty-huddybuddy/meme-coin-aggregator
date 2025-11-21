import { AggregationService } from './aggregation.service';

/**
 * Snapshot service for periodic token data aggregation
 * 
 * Purpose:
 * Originally designed for database persistence of token snapshots.
 * Now simplified to trigger periodic cache refreshes.
 * 
 * Historical Context:
 * - Previous: Stored snapshots in SQLite database
 * - Current: No persistence, only triggers aggregation
 * - Reason: Database removed, using Redis snapshots instead
 * 
 * Current Functionality:
 * - Triggers initial aggregation on start
 * - Optional periodic cache refresh (disabled by default)
 * - Interface compatibility with legacy code
 * 
 * Use Cases:
 * - Initial cache warming on server start
 * - Manual snapshot trigger via takeSnapshot()
 * - Graceful shutdown via stop()
 * 
 * Configuration:
 * - Interval: Configurable via start() parameter (default: 60s)
 * - Disabled: Periodic snapshots commented out
 * - Enable: Uncomment interval logic in start()
 * 
 * @class SnapshotService
 * 
 * @example
 * // Start service (runs initial aggregation)
 * await snapshotService.start();
 * // Logs: "Initial aggregation completed (no DB persistence)"
 * 
 * // Manual snapshot
 * await snapshotService.takeSnapshot();
 * // Triggers fresh aggregation
 * 
 * // Stop service
 * snapshotService.stop();
 * // Clears interval if running
 */
export class SnapshotService {
  private aggregation: AggregationService;
  private interval: NodeJS.Timeout | null = null;

  constructor() {
    this.aggregation = new AggregationService();
  }

  /**
   * Start snapshot service with initial aggregation
   * 
   * Purpose:
   * Triggers initial token aggregation on server startup.
   * Optionally enables periodic cache refresh (currently disabled).
   * 
   * Behavior:
   * 1. Check if already running (prevents duplicate intervals)
   * 2. Trigger initial aggregation (non-blocking)
   * 3. Log completion or ignore errors
   * 4. Periodic interval disabled (can be enabled by uncommenting)
   * 
   * Periodic Refresh (Disabled):
   * To enable periodic cache refresh, uncomment:
   * ```typescript
   * this.interval = setInterval(() => {
   *   this.aggregation.getAllTokens(false).catch(() => {});
   * }, _intervalMs);
   * ```
   * 
   * Error Handling:
   * - Initial aggregation errors ignored (graceful degradation)
   * - Prevents startup failures from cache misses
   * 
   * @param {number} [_intervalMs=60000] - Interval in milliseconds (unused, kept for compatibility)
   * @returns {Promise<void>}
   * 
   * @example
   * // Start on server boot
   * await snapshotService.start();
   * // Logs: "Initial aggregation completed (no DB persistence)"
   * 
   * // Start with custom interval (ignored in current implementation)
   * await snapshotService.start(30000);
   */
  async start(_intervalMs: number = 60_000): Promise<void> {
    // Previously: connect & ensure DB tables.
    // DB removed — this becomes a no-op.
    if (this.interval) return;

    // Optional immediate aggregation (not persisted)
    try {
      await this.aggregation.getAllTokens(false);
      // eslint-disable-next-line no-console
      console.log('Initial aggregation completed (no DB persistence)');
    } catch {
      // ignore
    }

    // Disabled periodic snapshots since DB removed.
    // If you want periodic refresh of cache, uncomment:
    // this.interval = setInterval(() => {
    //   this.aggregation.getAllTokens(false).catch(() => {});
    // }, _intervalMs);
  }

  /**
   * Manually trigger token aggregation
   * 
   * Purpose:
   * Forces fresh aggregation of all token data.
   * Retained for interface compatibility with legacy code.
   * 
   * Behavior:
   * - Calls getAllTokens(false) to bypass cache
   * - Fetches fresh data from all upstream APIs
   * - Updates cache with latest data
   * 
   * Use Cases:
   * - Manual cache refresh
   * - Testing/debugging
   * - Admin endpoints
   * 
   * Performance:
   * - Fresh aggregation: ~500-1000ms
   * - Network-bound (depends on upstream APIs)
   * 
   * @returns {Promise<void>}
   * 
   * @example
   * // Manually refresh cache
   * await snapshotService.takeSnapshot();
   * // Fresh data now in cache
   */
  async takeSnapshot(): Promise<void> {
    // No persistence; ensure fresh aggregation only.
    await this.aggregation.getAllTokens(false);
  }

  /**
   * Stop periodic snapshot interval
   * 
   * Purpose:
   * Gracefully stops periodic aggregation interval.
   * Called during server shutdown (SIGTERM, SIGINT).
   * 
   * Behavior:
   * - Clears interval if running
   * - Sets interval to null
   * - Idempotent (safe to call multiple times)
   * 
   * @example
   * // On server shutdown
   * snapshotService.stop();
   * // Interval cleared, no more periodic aggregation
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export const snapshotService = new SnapshotService();
export default snapshotService;
