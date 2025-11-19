import { Pool } from 'pg';

class DBService {
  private pool: Pool | null = null;
  private connected = false;

  constructor() {
    const user = process.env.POSTGRES_USER || 'memedb';
    const password = process.env.POSTGRES_PASSWORD || 'memepass';
    const host = process.env.POSTGRES_HOST || 'db';
    const port = parseInt(process.env.POSTGRES_PORT || '5432', 10);
    const database = process.env.POSTGRES_DB || 'memedb';

    this.pool = new Pool({ user, host, database, password, port });
  }

  async connect(): Promise<void> {
    if (!this.pool) return;
    // Wait for Postgres to become available, then ensure table exists
    const maxAttempts = 20;
    const delayMs = 1000;
    let attempt = 0;
    while (attempt < maxAttempts) {
      try {
        // quick probe
        await this.pool.query('SELECT 1');

        // Create snapshots table if not exists
        await this.pool.query(
          `CREATE TABLE IF NOT EXISTS token_snapshots (
            id SERIAL PRIMARY KEY,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            tokens JSONB NOT NULL
          )`
        );

        // Create index on created_at for faster retention queries
        await this.pool.query(
          `CREATE INDEX IF NOT EXISTS idx_token_snapshots_created_at 
           ON token_snapshots(created_at DESC)`
        );

        this.connected = true;
        return;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`DB initialization attempt ${attempt + 1} failed`, e);
        this.connected = false;
        // wait before retrying
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(res, delayMs));
        attempt += 1;
      }
    }

    // If we reach here, all attempts failed
    // eslint-disable-next-line no-console
    console.error('DB initialization failed after retries');
  }

  async insertSnapshot(tokens: unknown[]): Promise<void> {
    if (!this.pool) return;
    try {
      const payload = JSON.stringify(tokens);
      await this.pool.query('INSERT INTO token_snapshots(tokens) VALUES($1::jsonb)', [payload]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to insert snapshot', e);
    }
  }

  async isReady(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.query('SELECT 1');
      return this.connected;
    } catch (e) {
      return false;
    }
  }

  async countSnapshots(): Promise<number> {
    if (!this.pool) return 0;
    try {
      const res = await this.pool.query('SELECT count(*)::int as c FROM token_snapshots');
      return res.rows[0]?.c || 0;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Count snapshots failed', e);
      return 0;
    }
  }

  async cleanupOldSnapshots(retentionDays: number = 7): Promise<number> {
    if (!this.pool) return 0;
    try {
      const result = await this.pool.query(
        `DELETE FROM token_snapshots 
         WHERE created_at < NOW() - INTERVAL '1 day' * $1
         RETURNING id`,
        [retentionDays]
      );
      const deletedCount = result.rowCount || 0;
      if (deletedCount > 0) {
        // eslint-disable-next-line no-console
        console.log(`Cleaned up ${deletedCount} old snapshots (retention: ${retentionDays} days)`);
      }
      return deletedCount;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Cleanup snapshots failed', e);
      return 0;
    }
  }

  /**
   * Compute aggregated 7-day volumes per token using snapshots.
   * Strategy:
   *  - Expand JSONB tokens arrays, take per-day max(volume_24h) for each token,
   *    then sum those daily maxima across the last N days. This reduces noise
   *    from high-frequency snapshots and gives a per-day representative value.
   */
  async get7dAggregates(days: number = 7): Promise<Record<string, number>> {
    if (!this.pool) return {};
    try {
      const q = `WITH exploded AS (
          SELECT date_trunc('day', created_at) as day, (elem->> 'token_address') as token_address,
                 COALESCE((elem->> 'volume_24h')::numeric, 0) as vol24
          FROM token_snapshots, jsonb_array_elements(tokens) as elem
          WHERE created_at >= now() - INTERVAL '${days} days'
        ), daily_max AS (
          SELECT day::date as day, token_address, max(vol24) as max_vol
          FROM exploded
          GROUP BY day, token_address
        )
        SELECT token_address, sum(max_vol)::double precision as volume_7d
        FROM daily_max
        GROUP BY token_address;`;

      const res = await this.pool.query(q);
      const out: Record<string, number> = {};
      for (const row of res.rows) {
        if (!row.token_address) continue;
        out[row.token_address.toLowerCase()] = Number(row.volume_7d) || 0;
      }
      return out;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('get7dAggregates failed', e);
      return {};
    }
  }

  async disconnect(): Promise<void> {
    if (!this.pool) return;
    await this.pool.end();
    this.pool = null;
  }
}

export const dbService = new DBService();

export default dbService;
