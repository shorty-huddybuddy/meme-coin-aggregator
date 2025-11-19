import dotenv from 'dotenv';

dotenv.config();

// Parse Redis URL if provided (Railway format)
const parseRedisUrl = () => {
  // Try REDIS_URL first (Railway internal URL)
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;
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
  
  // Support Railway's individual env vars
  return {
    host: process.env.REDISHOST || process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDISPORT || process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDISPASSWORD || process.env.REDIS_PASSWORD || undefined,
  };
};

const redisConfig = parseRedisUrl();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
  },
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) || ['*'],
    credentials: (process.env.CORS_CREDENTIALS || 'false').toLowerCase() === 'true',
  },
  redis: {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '120', 10), // 2 minutes for better performance
  },
  rateLimit: {
    dexScreener: parseInt(process.env.DEXSCREENER_RATE_LIMIT || '300', 10),
    window: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10), // milliseconds
  },
  websocket: {
    updateInterval: parseInt(process.env.WS_UPDATE_INTERVAL || '10000', 10), // 10s updates
  },
  dev: {
    expandUpstream: (process.env.DEV_EXPAND_UPSTREAM || 'false').toLowerCase() === 'true',
  },
  scheduler: {
    cronSchedule: process.env.CRON_SCHEDULE || '*/30 * * * * *', // every 30 seconds
  },
  api: {
    dexScreener: 'https://api.dexscreener.com/latest/dex',
    jupiter: 'https://lite-api.jup.ag/tokens/v2',
  },
  upstream: {
    // requests per minute and concurrency defaults; can be overridden with env vars
    dexscreenerRatePerMinute: parseInt(process.env.DEXSCREENER_RATE_PER_MINUTE || '150', 10),
    jupiterRatePerMinute: parseInt(process.env.JUPITER_RATE_PER_MINUTE || '150', 10),
    dexscreenerConcurrency: parseInt(process.env.DEXSCREENER_CONCURRENCY || '3', 10),
    jupiterConcurrency: parseInt(process.env.JUPITER_CONCURRENCY || '3', 10),
    // discovery queries and per-query caps (balanced for speed and coverage)
    dexscreenerQueries: (process.env.DEXSCREENER_QUERIES || 'SOL,BONK,WIF,POPCAT,PEPE,TRUMP,MEME').split(','),
    jupiterQueries: (process.env.JUPITER_QUERIES || 'SOL,BONK,WIF,PEPE').split(','),
    // Balanced defaults for good token count with reasonable speed
    dexscreenerPerQueryCap: parseInt(process.env.DEXSCREENER_PER_QUERY_CAP || '40', 10),
    jupiterPerQueryCap: parseInt(process.env.JUPITER_PER_QUERY_CAP || '30', 10),
    geckoTerminalEnabled: (process.env.GECKO_ENABLED || 'true').toLowerCase() === 'true',
    geckoTerminalBase: process.env.GECKO_BASE || 'https://api.geckoterminal.com/api/v2',
  },
  coinGecko: {
    apiKey: process.env.COINGECKO_API_KEY || undefined,
    base: process.env.COINGECKO_BASE || 'https://api.coingecko.com/api/v3',
  },
};
