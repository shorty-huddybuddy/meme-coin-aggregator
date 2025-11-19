import { AggregationService } from './aggregation.service';

export class SnapshotService {
  private aggregation: AggregationService;
  private interval: NodeJS.Timeout | null = null;

  constructor() {
    this.aggregation = new AggregationService();
  }

  // Start snapshot loop (now in-memory/no-op persistence)
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

  // Retained for interface compatibility
  async takeSnapshot(): Promise<void> {
    // No persistence; ensure fresh aggregation only.
    await this.aggregation.getAllTokens(false);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export const snapshotService = new SnapshotService();
export default snapshotService;
