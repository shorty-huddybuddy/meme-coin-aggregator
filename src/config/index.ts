import dotenv from 'dotenv';

dotenv.config();

// Parse Redis URL if provided (Railway format)
const parseRedisUrl = () => {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port, 10) || 6379,
        password: url.password || undefined,
      };
    } catch (e) {
      console.warn('Failed to parse REDIS_URL, using individual env vars');
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };
};

const redisConfig = parseRedisUrl();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
  },
  redis: {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '30', 10), // seconds
  },
  rateLimit: {
    dexScreener: parseInt(process.env.DEXSCREENER_RATE_LIMIT || '300', 10),
    window: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10), // milliseconds
  },
  websocket: {
    updateInterval: parseInt(process.env.WS_UPDATE_INTERVAL || '5000', 10),
  },
  scheduler: {
    cronSchedule: process.env.CRON_SCHEDULE || '*/30 * * * * *', // every 30 seconds
  },
  api: {
    dexScreener: 'https://api.dexscreener.com/latest/dex',
    jupiter: 'https://lite-api.jup.ag/tokens/v2',
  },
};
