import { AggregationService } from './aggregation.service';

export class SnapshotService {
  private aggregation: AggregationService;
  private interval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.aggregation = new AggregationService();
  }

  async start(intervalMs: number = 60_000): Promise<void> {
    // Ensure DB table exists
    await dbService.connect();

    if (this.interval) return;

    // Run an immediate snapshot then schedule
    await this.takeSnapshot();
    this.interval = setInterval(() => this.takeSnapshot().catch((e) => console.error('Snapshot error', e)), intervalMs);

    // Schedule cleanup once per day (86400000ms)
    const retentionDays = parseInt(process.env.SNAPSHOT_RETENTION_DAYS || '7', 10);
    this.cleanupInterval = setInterval(
      () => dbService.cleanupOldSnapshots(retentionDays).catch((e) => console.error('Cleanup error', e)),
      86400000
    );

    // Run immediate cleanup on start
    await dbService.cleanupOldSnapshots(retentionDays);
  }

  async takeSnapshot(): Promise<void> {
    try {
      // Bypass cache to get fresh data
      const tokens = await this.aggregation.getAllTokens(false);
      await dbService.insertSnapshot(tokens);
      // eslint-disable-next-line no-console
      console.log(`Snapshot saved (${tokens.length} tokens)`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to take snapshot', e);
    }
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const snapshotService = new SnapshotService();

export default snapshotService;
