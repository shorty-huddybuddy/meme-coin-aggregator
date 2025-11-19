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

  // In production, warn for missing non-critical configs (no hard exits)
  if (env === 'production') {
    // Redis connectivity (warn if missing; service can fallback to in-memory)
    const redisPresent = !!(process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_HOSTNAME);
    if (!redisPresent) {
      // eslint-disable-next-line no-console
      console.warn('Redis not configured (REDIS_URL or REDIS_HOST). Falling back to in-memory cache.');
    }

    // API keys should be configured in production to avoid open endpoints
    const apiKeys = process.env.API_KEYS;
    if (!apiKeys) {
      // eslint-disable-next-line no-console
      console.warn('API_KEYS not set — API will be public. Set API_KEYS to restrict access.');
    }
  }

  // Optional values (non-fatal)
  if (!process.env.CACHE_TTL) {
    // eslint-disable-next-line no-console
    console.warn('CACHE_TTL not set — defaulting to 30s');
  }
}

export default validateConfig;
