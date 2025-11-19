import Redis from 'ioredis';
import { config } from '../config';

class CacheManager {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private inMemoryCache: Map<string, { value: string; expiresAt: number }> = new Map();
  private useInMemory: boolean = false;

  constructor() {
    // Skip Redis if explicitly disabled
    if (process.env.DISABLE_REDIS === 'true') {
      console.log('⚡ Using in-memory cache (Redis disabled via DISABLE_REDIS)');
      this.useInMemory = true;
      return;
    }

    try {
      const hasPassword = !!config.redis.password;
      console.log(`🔌 Attempting Redis connection to ${config.redis.host}:${config.redis.port} (auth: ${hasPassword ? 'yes' : 'no'})`);
      
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

  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.quit();
    }
    this.isConnected = false;
    this.inMemoryCache.clear();
  }

  getClient(): Redis | null {
    return this.client;
  }

  isUsingInMemory(): boolean {
    return this.useInMemory;
  }
}

export const cacheManager = new CacheManager();
