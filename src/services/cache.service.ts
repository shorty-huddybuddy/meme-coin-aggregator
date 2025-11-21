import Redis from 'ioredis';
import { config } from '../config';

/**
 * CacheManager - Manages distributed caching using Redis with in-memory fallback
 * 
 * Features:
 * - Primary: Redis (distributed, persistent across restarts)
 * - Fallback: In-memory Map (used when Redis unavailable)
 * - Auto-detection: Switches to in-memory on connection failures
 * - TTL Support: Automatic expiration for both Redis and in-memory
 * 
 * Use Cases:
 * - Token data caching (30-60s TTL)
 * - Search result caching
 * - 7-day price history snapshots (8-day TTL)
 */
class CacheManager {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private inMemoryCache: Map<string, { value: string; expiresAt: number }> = new Map();
  private useInMemory: boolean = false;

  /**
   * Constructor - Initializes Redis connection with Railway-specific handling
   * 
   * Behavior:
   * 1. If DISABLE_REDIS=true: Use in-memory only
   * 2. If no password + remote host: Warn about Railway config issue, use in-memory
   * 3. Otherwise: Attempt Redis connection with retry strategy (3 attempts, exponential backoff)
   * 4. On connection failure: Automatically fall back to in-memory cache
   * 
   * Railway Integration:
   * - Expects REDIS_HOST, REDIS_PORT, REDIS_PASSWORD from environment
   * - Logs detailed diagnostics for debugging deployment issues
   */
  constructor() {
    // Skip Redis if explicitly disabled
    if (process.env.DISABLE_REDIS === 'true') {
      console.log('⚡ Using in-memory cache (Redis disabled via DISABLE_REDIS)');
      this.useInMemory = true;
      return;
    }

    try {
      const hasPassword = !!config.redis.password;
      const passwordInfo = config.redis.password 
        ? `${config.redis.password.substring(0, 4)}...${config.redis.password.substring(config.redis.password.length - 4)}` 
        : 'NONE';
      
      console.log('\n' + '='.repeat(60));
      console.log('🔌 REDIS CONNECTION ATTEMPT');
      console.log('='.repeat(60));
      console.log(`Host: ${config.redis.host}`);
      console.log(`Port: ${config.redis.port}`);
      console.log(`Auth: ${hasPassword ? 'YES ✓' : 'NO ✗'}`);
      console.log(`Password: ${passwordInfo}`);
      console.log('='.repeat(60) + '\n');
      
      // If no password and not localhost, skip Redis (Railway issue)
      if (!hasPassword && config.redis.host !== 'localhost' && config.redis.host !== '127.0.0.1') {
        console.warn('\n⚠️  REDIS CONFIGURATION ISSUE DETECTED!\n');
        console.warn('Problem: No password provided for remote Redis connection');
        console.warn(`Host: ${config.redis.host} (not localhost)\n`);
        console.warn('This usually means Railway environment variables are not configured.\n');
        console.warn('🔧 TO FIX THIS:');
        console.warn('   1. Go to Railway Dashboard');
        console.warn('   2. Click on your meme-coin-aggregator service');
        console.warn('   3. Go to Variables tab');
        console.warn('   4. Add: REDIS_PRIVATE_URL=${{Redis.REDIS_PRIVATE_URL}}');
        console.warn('      (Use Railway\'s dropdown, don\'t type it manually!)');
        console.warn('   5. Click Deploy\n');
        console.warn('📖 See RAILWAY_QUICK_FIX.md for detailed instructions\n');
        console.log('⚡ Using in-memory cache as fallback.');
        this.useInMemory = true;
        return;
      }
      
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        retryStrategy: (times: number) => {
          if (times > 3) {
            console.log('⚠️  Redis unavailable. Falling back to in-memory cache.');
            this.useInMemory = true;
            return null; // Stop retrying
          }
          const delay = Math.min(times * 50, 2000);
          console.log(`🔄 Redis retry attempt ${times}, waiting ${delay}ms...`);
          return delay;
        },
        lazyConnect: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 3,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.useInMemory = false;
        console.log('✓ Redis connected successfully');
      });

      this.client.on('error', (error: Error) => {
        console.error('❌ Redis error:', error.message);
        if (error.message.includes('NOAUTH')) {
          console.error('⚠️  Redis authentication failed. Check REDIS_PASSWORD. Using in-memory cache.');
          this.useInMemory = true;
        } else if (!this.useInMemory && error.message.includes('ECONNREFUSED')) {
          console.log('⚠️  Redis connection failed. Using in-memory cache instead.');
          this.useInMemory = true;
        }
      });
    } catch (error) {
      console.log('⚠️  Redis initialization failed. Using in-memory cache.');
      this.useInMemory = true;
    }
  }

  /**
   * Establishes connection to Redis server
   * Called once at application startup (from index.ts)
   * 
   * @returns Promise<void>
   * 
   * Behavior:
   * - If using in-memory: No-op, just logs readiness
   * - If Redis configured: Attempts connection
   * - On failure: Switches to in-memory fallback
   */
  async connect(): Promise<void> {
    if (this.useInMemory) {
      console.log('✓ In-memory cache ready (Redis not available)');
      return;
    }

    if (!this.isConnected && this.client) {
      try {
        await this.client.connect();
      } catch (error) {
        console.log('⚠️  Could not connect to Redis. Using in-memory cache.');
        this.useInMemory = true;
      }
    }
  }

  /**
   * Retrieves value from cache by key
   * 
   * @param key - Cache key (e.g., 'tokens:all', 'price_history:SOL111...')
   * @returns Promise<T | null> - Parsed JSON object or null if not found/expired
   * 
   * Implementation:
   * - In-memory: Checks expiration timestamp, auto-deletes expired entries
   * - Redis: Returns stored value if exists (Redis handles TTL automatically)
   * - Returns null on errors (graceful degradation)
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.useInMemory) {
      const cached = this.inMemoryCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return JSON.parse(cached.value);
      }
      if (cached) {
        this.inMemoryCache.delete(key); // Remove expired
      }
      return null;
    }

    try {
      if (!this.client) return null;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Stores value in cache with automatic expiration
   * 
   * @param key - Cache key (unique identifier)
   * @param value - Any JSON-serializable value (object, array, primitive)
   * @param ttl - Time-to-live in seconds (default: 30s from config.cache.ttl)
   * @returns Promise<void>
   * 
   * Implementation:
   * - In-memory: Stores with calculated expiration timestamp (Date.now() + ttl*1000)
   * - Redis: Uses SETEX command (atomic set with expiration)
   * - JSON.stringify: Converts value to string for storage
   */
  async set(key: string, value: unknown, ttl: number = config.cache.ttl): Promise<void> {
    if (this.useInMemory) {
      const expiresAt = Date.now() + ttl * 1000;
      this.inMemoryCache.set(key, { value: JSON.stringify(value), expiresAt });
      return;
    }

    try {
      if (!this.client) return;
      await this.client.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Deletes a single cache entry by key
   * Used for manual cache invalidation
   * 
   * @param key - Cache key to delete
   * @returns Promise<void>
   * 
   * Use Cases:
   * - Manual cache refresh
   * - Invalidating stale data
   * - Clearing specific search results
   */
  async del(key: string): Promise<void> {
    if (this.useInMemory) {
      this.inMemoryCache.delete(key);
      return;
    }

    try {
      if (!this.client) return;
      await this.client.del(key);
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Lists all cache keys matching a pattern (glob-style)
   * 
   * @param pattern - Glob pattern (e.g., 'tokens:*', 'price_history:*')
   * @returns Promise<string[]> - Array of matching keys
   * 
   * Pattern Syntax:
   * - '*' matches any characters (e.g., 'tokens:*' matches 'tokens:all', 'tokens:search:bonk')
   * - Converted to regex for in-memory matching
   * 
   * Use Cases:
   * - Cache status endpoint (listing all cached items)
   * - Batch invalidation (find all token keys, then delete)
   */
  async keys(pattern: string): Promise<string[]> {
    if (this.useInMemory) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(this.inMemoryCache.keys()).filter((key) => regex.test(key));
    }

    try {
      if (!this.client) return [];
      return await this.client.keys(pattern);
    } catch (error) {
      console.error(`Cache keys error for pattern ${pattern}:`, error);
      return [];
    }
  }

  /**
   * Clears entire cache (ALL keys)
   * Use with caution - forces all subsequent requests to fetch fresh data
   * 
   * @returns Promise<void>
   * 
   * Warning: This affects all cache entries, not just tokens
   * - Deletes price history snapshots
   * - Deletes search results cache
   * - Deletes all token data
   * 
   * Use Case: POST /api/cache/flush endpoint for testing
   */
  async flushAll(): Promise<void> {
    if (this.useInMemory) {
      this.inMemoryCache.clear();
      return;
    }

    try {
      if (!this.client) return;
      await this.client.flushall();
    } catch (error) {
      console.error('Cache flush error:', error);
    }
  }

  /**
   * Gracefully disconnects from Redis and clears in-memory cache
   * Called on application shutdown (SIGTERM/SIGINT handlers)
   * 
   * @returns Promise<void>
   * 
   * Implementation:
   * - Sends QUIT command to Redis (graceful shutdown)
   * - Clears in-memory cache to free memory
   * - Ignores errors if already disconnected
   */
  async disconnect(): Promise<void> {
    if (this.useInMemory) {
      this.inMemoryCache.clear();
      return;
    }

    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        this.isConnected = false;
      } catch (error) {
        // Connection already closed, ignore error
        console.log('Redis already disconnected');
      }
    }
    this.inMemoryCache.clear();
  }

  /**
   * Returns raw Redis client for advanced operations
   * Used by services that need direct Redis access (e.g., pub/sub, transactions)
   * 
   * @returns Redis | null - ioredis client instance or null if using in-memory
   */
  getClient(): Redis | null {
    return this.client;
  }

  /**
   * Checks if cache is using in-memory fallback (Redis unavailable)
   * Used by /api/cache/status endpoint to report cache backend type
   * 
   * @returns boolean - true if in-memory, false if Redis connected
   * 
   * Implications:
   * - true: Cache not shared across instances, lost on restart
   * - false: Cache distributed, survives restarts, shared across instances
   */
  isUsingInMemory(): boolean {
    return this.useInMemory;
  }
}

export const cacheManager = new CacheManager();
