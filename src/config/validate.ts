import { config } from './index';

function missing(name: string) {
  return `Missing required configuration: ${name}`;
}

export function validateConfig(): void {
  const env = (config.server.env || 'development').toLowerCase();

  // Always ensure PORT is set to a usable number
  if (!config.server.port || Number.isNaN(config.server.port) || config.server.port <= 0) {
    console.error(missing('PORT'));
    process.exit(1);
  }

  // In production require stronger guarantees
  if (env === 'production') {
    // Postgres connectivity
    const pgHost = process.env.POSTGRES_HOST || process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!pgHost) {
      console.error(missing('POSTGRES_HOST or POSTGRES_URL or DATABASE_URL'));
      process.exit(1);
    }

    // Redis connectivity
    const redisPresent = !!(process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_HOSTNAME);
    if (!redisPresent) {
      console.error(missing('REDIS_URL or REDIS_HOST'));
      process.exit(1);
    }

    // API keys should be configured in production to avoid open endpoints
    const apiKeys = process.env.API_KEYS;
    if (!apiKeys) {
      console.error(missing('API_KEYS'));
      process.exit(1);
    }
  }

  // Warn if commonly-missed optional values are absent (non-fatal)
  if (!process.env.SNAPSHOT_RETENTION_DAYS) {
    // eslint-disable-next-line no-console
    console.warn('SNAPSHOT_RETENTION_DAYS not set — defaulting to 7 days');
  }

  if (!process.env.CACHE_TTL) {
    // eslint-disable-next-line no-console
    console.warn('CACHE_TTL not set — defaulting to 30s');
  }
}

export default validateConfig;
