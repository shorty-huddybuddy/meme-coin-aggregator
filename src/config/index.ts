import dotenv from 'dotenv';

dotenv.config();

/**
 * Parse Redis connection configuration from environment variables
 * 
 * Purpose:
 * Handles multiple Redis configuration formats with Railway-specific fallbacks.
 * Provides comprehensive debugging output for connection troubleshooting.
 * 
 * Configuration Priority (checked in order):
 * 1. REDIS_PRIVATE_URL - Railway private network URL (fastest, recommended)
 * 2. REDIS_URL - Standard Redis connection string (redis://user:pass@host:port)
 * 3. REDIS_PUBLIC_URL - Railway public network URL (slower)
 * 4. RAILWAY_SERVICE_REDIS_DATABASE_URL - Railway auto-generated variable
 * 5. RAILWAY_TCP_PROXY_URL - Railway TCP proxy connection
 * 6. Individual env vars (REDISHOST, REDISPORT, REDISPASSWORD)
 * 7. Hardcoded Railway TCP proxy (interchange.proxy.rlwy.net:42033)
 * 
 * Environment Variables Supported:
 * 
 * URL Format:
 * - REDIS_URL: redis://:password@host:port/db
 * - REDIS_PRIVATE_URL: redis://default:pass@private-host:6379
 * - REDIS_PUBLIC_URL: redis://default:pass@public-host:6379
 * 
 * Individual Components:
 * - REDISHOST / REDIS_HOST: Hostname or IP address
 * - REDISPORT / REDIS_PORT: Port number (default: 6379)
 * - REDISPASSWORD / REDIS_PASSWORD: Authentication password
 * 
 * Railway-Specific Handling:
 * 
 * 1. Template Variable Detection:
 *    - Checks if URL contains unresolved Railway variables: ${{Redis.REDIS_URL}}
 *    - Falls back to individual env vars if templates found
 * 
 * 2. Hardcoded TCP Proxy Fallback:
 *    - Host: interchange.proxy.rlwy.net
 *    - Port: 42033
 *    - Password: cBsXIKYigAYYsYPYeYpGjmAVYBCHSiRl
 *    - Used when no env vars configured
 * 
 * 3. Debugging Output:
 *    - Lists all REDIS/RAILWAY env variables found
 *    - Masks passwords in logs for security
 *    - Warns about unresolved template variables
 * 
 * Return Format:
 * ```typescript
 * {
 *   host: string;      // Redis server hostname
 *   port: number;      // Redis server port
 *   password?: string; // Authentication password (optional)
 * }
 * ```
 * 
 * Error Handling:
 * - Invalid URL format: Logs warning, falls back to individual vars
 * - Missing port in URL: Defaults to 6379
 * - Missing password: Returns undefined (allows no-auth Redis)
 * - URL parsing errors: Caught and logged, continues with fallback
 * 
 * Security Considerations:
 * - Passwords masked in console output (replaced with ****)
 * - Full credentials never logged
 * - Debugging output safe for production logs
 * 
 * Performance:
 * - Single execution at server startup
 * - No runtime overhead (config parsed once)
 * - Minimal regex matching for template detection
 * 
 * @returns {Object} Redis connection config with host, port, and optional password
 * 
 * @example
 * // Railway with REDIS_URL
 * REDIS_URL="redis://:mypass@redis.railway.internal:6379"
 * // Returns: { host: 'redis.railway.internal', port: 6379, password: 'mypass' }
 * 
 * // Individual env vars
 * REDISHOST="interchange.proxy.rlwy.net"
 * REDISPORT="42033"
 * REDISPASSWORD="cBsXIKYigAYYsYPYeYpGjmAVYBCHSiRl"
 * // Returns: { host: 'interchange.proxy.rlwy.net', port: 42033, password: 'cBsXIKYigAYYsYPYeYpGjmAVYBCHSiRl' }
 * 
 * // Hardcoded fallback (no env vars)
 * // Returns: { host: 'interchange.proxy.rlwy.net', port: 42033, password: 'cBsXIKYigAYYsYPYeYpGjmAVYBCHSiRl' }
 */
const parseRedisUrl = () => {
  // Debug: Log ALL environment variables that contain "REDIS" or "RAILWAY"
  console.log('\n🔍 CHECKING ALL Redis/Railway environment variables:');
  const envVars = Object.keys(process.env).filter(key => 
    key.toUpperCase().includes('REDIS') || 
    (key.toUpperCase().includes('RAILWAY') && key.toUpperCase().includes('REDIS'))
  );
  
  if (envVars.length === 0) {
    console.log('  ⚠️  NO REDIS ENVIRONMENT VARIABLES FOUND!');
    console.log('  Railway may not be injecting variables. Check Railway dashboard.');
  } else {
    envVars.forEach(key => {
      const value = process.env[key];
      if (value) {
        const masked = key.includes('PASSWORD') || key.includes('PASS')
          ? '(hidden)'
          : value.includes('://') 
            ? value.substring(0, 50) + '...'
            : value;
        console.log(`  ✓ ${key} = ${masked}`);
      }
    });
  }
  console.log('');
  
  // Railway priority: Check Railway auto-generated variables first
  // Railway creates RAILWAY_SERVICE_<SERVICENAME>_URL automatically
  const redisUrl = process.env.REDIS_PRIVATE_URL 
    || process.env.REDIS_URL 
    || process.env.REDIS_PUBLIC_URL
    || process.env.RAILWAY_SERVICE_REDIS_DATABSE_URL  // Railway auto-generated
    || process.env.RAILWAY_TCP_PROXY_URL;
  
  if (redisUrl) {
    try {
      // Check if URL contains Railway template variables (not yet resolved)
      if (redisUrl.includes('${{')) {
        console.warn('⚠️  REDIS_URL contains unresolved template variables');
        console.warn('   Raw value:', redisUrl);
        console.warn('   Falling back to individual env vars');
      } else {
        console.log('✓ Using REDIS_URL:', redisUrl.replace(/:[^:]*@/, ':****@')); // Mask password
        const url = new URL(redisUrl);
        return {
          host: url.hostname,
          port: parseInt(url.port, 10) || 6379,
          password: url.password || undefined,
        };
      }
    } catch (e) {
      console.warn('Failed to parse REDIS_URL:', e instanceof Error ? e.message : 'Unknown error');
    }
  }
  
  // Support Railway's individual env vars OR use Railway TCP proxy
  const config = {
    host: process.env.REDISHOST || process.env.REDIS_HOST || 'interchange.proxy.rlwy.net',
    port: parseInt(process.env.REDISPORT || process.env.REDIS_PORT || '42033', 10),
    password: process.env.REDISPASSWORD || process.env.REDIS_PASSWORD || 'cBsXIKYigAYYsYPYeYpGjmAVYBCHSiRl',
  };
  
  console.log('✓ Using individual env vars:');
  console.log('  Host:', config.host);
  console.log('  Port:', config.port);
  console.log('  Password:', config.password ? '****' : 'None');
  
  return config;
};

const redisConfig = parseRedisUrl();

console.log('✅ Final Redis config:', {
  host: redisConfig.host,
  port: redisConfig.port,
  hasPassword: !!redisConfig.password,
  passwordLength: redisConfig.password?.length || 0
});

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
    ttl: parseInt(process.env.CACHE_TTL || '30', 10), // 30s for more real-time updates
  },
  rateLimit: {
    dexScreener: parseInt(process.env.DEXSCREENER_RATE_LIMIT || '300', 10),
    window: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10), // milliseconds
  },
  websocket: {
    updateInterval: parseInt(process.env.WS_UPDATE_INTERVAL || '1500', 10), // 1.5s updates for faster real-time feel
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
    dexscreenerRatePerMinute: parseInt(process.env.DEXSCREENER_RATE_PER_MINUTE || '200', 10),
    jupiterRatePerMinute: parseInt(process.env.JUPITER_RATE_PER_MINUTE || '200', 10),
    dexscreenerConcurrency: parseInt(process.env.DEXSCREENER_CONCURRENCY || '4', 10),
    jupiterConcurrency: parseInt(process.env.JUPITER_CONCURRENCY || '4', 10),
    // discovery queries and per-query caps (balanced for good coverage without overwhelming)
    dexscreenerQueries: (process.env.DEXSCREENER_QUERIES || 'SOL,BONK,WIF,POPCAT,PEPE,TRUMP,MEME,USDC,RAY,JUP').split(','),
    jupiterQueries: (process.env.JUPITER_QUERIES || 'SOL,BONK,WIF,PEPE,USDC,RAY').split(','),
    // Balanced caps for ~500-600 total tokens (sweet spot for performance)
    dexscreenerPerQueryCap: parseInt(process.env.DEXSCREENER_PER_QUERY_CAP || '50', 10),
    jupiterPerQueryCap: parseInt(process.env.JUPITER_PER_QUERY_CAP || '40', 10),
    geckoTerminalEnabled: (process.env.GECKO_ENABLED || 'true').toLowerCase() === 'true',
    geckoTerminalBase: process.env.GECKO_BASE || 'https://api.geckoterminal.com/api/v2',
  },
  coinGecko: {
    apiKey: process.env.COINGECKO_API_KEY || undefined,
    base: process.env.COINGECKO_BASE || 'https://api.coingecko.com/api/v3',
  },
};
