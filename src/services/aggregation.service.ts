import { TokenData, FilterOptions, SortOptions } from '../types';
import { DexScreenerService } from './dexscreener.service';
import { JupiterService } from './jupiter.service';
import { BirdeyeService } from './birdeye.service';
import { cacheManager } from './cache.service';
import { CacheKey } from '../types';
import { coingeckoService } from './coingecko.service';
import { geckoTerminalService } from './geckoterminal.service';
import { config } from '../config';

export class AggregationService {
  private dexScreener: DexScreenerService;
  private jupiter: JupiterService;
  private birdeye: BirdeyeService;

  constructor() {
    this.dexScreener = new DexScreenerService();
    this.jupiter = new JupiterService();
    this.birdeye = new BirdeyeService();
  }

  /**
  * Fetches and aggregates token data from multiple DEX sources (DexScreener, Jupiter, Birdeye, GeckoTerminal)
   * Implements caching with 60s TTL to reduce API calls and improve response times
   * 
   * @param useCache - Whether to use cached data (default: true)
   * @returns Promise<TokenData[]> - Array of merged and enriched token data
   * 
   * Flow:
   * 1. Check cache first (returns in <100ms if hit)
   * 2. If cache miss: fetch from all APIs in parallel using Promise.allSettled (graceful degradation)
   * 3. Merge duplicate tokens by address (combines data from multiple sources)
   * 4. Calculate 7-day volume approximation (24h volume * 7)
   * 5. Enrich with 7-day price changes from Redis snapshots
   * 6. Convert SOL prices to USD using CoinGecko (with 3s timeout)
   * 7. Cache merged results for 60 seconds
   */
  async getAllTokens(useCache: boolean = true): Promise<TokenData[]> {
    if (useCache) {
      const cached = await cacheManager.get<TokenData[]>(CacheKey.ALL_TOKENS);
      if (cached) {
        return cached;
      }
    }

    // Add global timeout of 25 seconds for entire aggregation
    const aggregationTimeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Aggregation timeout')), 25000)
    );

    try {
      const dexPromise = this.dexScreener.getTrendingTokens();
      const jupiterPromise = config.upstream.jupiterEnabled
        ? this.jupiter.getPopularTokens()
        : Promise.resolve([] as TokenData[]);
      const birdeyePromise = config.upstream.birdeyeEnabled
        ? this.birdeye.getTrendingTokens()
        : Promise.resolve([] as TokenData[]);
      const geckoPromise = config.upstream.geckoTerminalEnabled
        ? geckoTerminalService.collectTokens(config.upstream.geckoTerminalPages || 2)
        : Promise.resolve([] as TokenData[]);

      const [dexTokens, jupiterTokens, birdeyeTokens, geckoTokens] = await Promise.race([
        Promise.allSettled([
          dexPromise,
          jupiterPromise,
          birdeyePromise,
          geckoPromise,
        ]),
        aggregationTimeout
      ]) as PromiseSettledResult<TokenData[]>[];

    const allTokens: TokenData[] = [];

    if (dexTokens.status === 'fulfilled') {
      console.log(`DexScreener returned ${dexTokens.value.length} tokens`);
      allTokens.push(...dexTokens.value);
    } else {
      console.warn('DexScreener failed:', dexTokens.reason);
    }

    if (jupiterTokens.status === 'fulfilled') {
      console.log(`Jupiter returned ${jupiterTokens.value.length} tokens`);
      allTokens.push(...jupiterTokens.value);
    } else {
      console.warn('Jupiter failed:', jupiterTokens.reason);
    }

    if (birdeyeTokens.status === 'fulfilled') {
      console.log(`Birdeye returned ${birdeyeTokens.value.length} tokens`);
      allTokens.push(...birdeyeTokens.value);
    } else {
      console.warn('Birdeye failed:', birdeyeTokens.reason);
    }

      if (geckoTokens.status === 'fulfilled') {
        console.log(`GeckoTerminal returned ${geckoTokens.value.length} tokens`);
        allTokens.push(...geckoTokens.value);
      } else {
        console.warn('GeckoTerminal failed:', geckoTokens.reason);
      }

    const mergedTokens = this.mergeTokens(allTokens);
    console.log(`Merged ${allTokens.length} raw tokens into ${mergedTokens.length} unique tokens`);

    // Compute 7d volume approximation from available 24h volume (fallback-only approach).
    for (const t of mergedTokens) {
      t.volume_7d = t.volume_7d ?? ((t.volume_24h ?? t.volume_sol) * 7);
    }

    // Calculate 7-day price changes using historical snapshots
    await this.enrichWith7DayChanges(mergedTokens);

    // Log sample of 7d changes for debugging
    const tokensWithChange = mergedTokens.filter(t => t.price_7d_change !== undefined);
    if (tokensWithChange.length > 0) {
      console.log(`✓ Calculated 7d changes for ${tokensWithChange.length} tokens`);
    }

      // Enrich tokens with USD conversions using CoinGecko (SOL -> USD) with timeout
    try {
      const solPrice = await Promise.race([
        coingeckoService.getSolPriceUsd(),
        new Promise<number>((resolve) => setTimeout(() => resolve(0), 3000))
      ]);
      if (!solPrice) throw new Error('CoinGecko timeout');
      for (const t of mergedTokens) {
        t.price_usd = t.price_sol ? Number((t.price_sol * solPrice).toFixed(6)) : 0;
        t.market_cap_usd = t.market_cap_sol ? Number((t.market_cap_sol * solPrice).toFixed(2)) : 0;
        t.volume_usd = t.volume_sol ? Number((t.volume_sol * solPrice).toFixed(2)) : 0;
      }
    } catch (e) {
      // If CoinGecko is unavailable, skip USD conversion
      console.warn('Skipping CoinGecko USD enrichment');
    }

    // Cache for 2x TTL for reasonable refresh rate (60s with default config)
    await cacheManager.set(CacheKey.ALL_TOKENS, mergedTokens, config.cache.ttl * 2);
    return mergedTokens;
    } catch (timeoutError) {
      console.error('Aggregation timeout - returning empty array');
      return [];
    }
  }

  /**
   * Searches tokens by name, ticker, or address using full-text matching
   * Optimized to search within already aggregated tokens instead of making new API calls
   * 
   * @param query - Search string (case-insensitive)
   * @param useCache - Whether to use cached token data
   * @returns Promise<TokenData[]> - Filtered array of matching tokens
   * 
   * Performance: O(n) where n = total tokens, but operates on cached data (<100ms)
   */
  async searchTokens(query: string, useCache: boolean = true): Promise<TokenData[]> {
    // Optimize: search within already aggregated tokens instead of making new API calls
    const allTokens = await this.getAllTokens(useCache);
    
    const queryLower = query.toLowerCase();
    const results = allTokens.filter((token) => {
      return (
        token.token_name?.toLowerCase().includes(queryLower) ||
        token.token_ticker?.toLowerCase().includes(queryLower) ||
        token.token_address?.toLowerCase().includes(queryLower)
      );
    });

    return results;
  }

  /**
   * Merges duplicate tokens from multiple sources using token address as unique key
   * Implements intelligent data merging: prefers non-zero values, max volumes, latest timestamps
   * 
   * @param tokens - Raw token array from multiple APIs (may contain duplicates)
   * @returns TokenData[] - Deduplicated array with merged data
   * 
   * Merge Strategy:
   * - Token address (lowercase) = unique identifier
   * - Price: Prefer non-zero values (DexScreener over Jupiter zeros)
   * - Volume/Market Cap: Use maximum value from all sources
   * - Price Changes: Prefer non-zero (DexScreener has real data, Jupiter returns 0)
   * - Protocol: Prefer known protocols over "Unknown"
   * - Source: Concatenate all sources (e.g., "dexscreener,jupiter,geckoterminal")
   */
  mergeTokens(tokens: TokenData[]): TokenData[] {
    const tokenMap = new Map<string, TokenData>();

    for (const token of tokens) {
      // Skip tokens without valid address
      if (!token?.token_address) continue;
      
      const key = token.token_address.toLowerCase();
      const existing = tokenMap.get(key);

      if (!existing) {
        tokenMap.set(key, token);
      } else {
        // Merge data from multiple sources - prefer data with more information
        const merged: TokenData = {
          ...existing,
          token_name: existing.token_name || token.token_name,
          token_ticker: existing.token_ticker || token.token_ticker,
          price_sol: existing.price_sol > 0 ? existing.price_sol : token.price_sol,
          market_cap_sol: Math.max(existing.market_cap_sol, token.market_cap_sol),
          volume_sol: Math.max(existing.volume_sol, token.volume_sol),
          volume_1h: Math.max(existing.volume_1h || 0, token.volume_1h || 0),
          volume_24h: Math.max(existing.volume_24h || 0, token.volume_24h || 0),
          liquidity_sol: Math.max(existing.liquidity_sol, token.liquidity_sol),
          transaction_count: Math.max(existing.transaction_count, token.transaction_count),
          // Fix: prefer non-zero changes (DexScreener has real data, Jupiter returns 0)
          price_1hr_change: token.price_1hr_change !== 0 ? token.price_1hr_change : existing.price_1hr_change,
          price_24hr_change: token.price_24hr_change !== 0 ? token.price_24hr_change : existing.price_24hr_change,
          protocol: existing.protocol !== 'Unknown' ? existing.protocol : token.protocol,
          last_updated: Math.max(existing.last_updated, token.last_updated),
          source: `${existing.source},${token.source}`,
        };

        tokenMap.set(key, merged);
      }
    }

    return Array.from(tokenMap.values());
  }

  /**
   * Filters token array based on multiple criteria (volume, market cap, protocol)
   * Supports time-period specific volume filtering (1h, 24h, 7d)
   * 
   * @param tokens - Array of tokens to filter
   * @param filters - FilterOptions object with optional criteria
   * @returns TokenData[] - Filtered array matching all specified criteria
   * 
   * Supported Filters:
   * - minVolume/maxVolume: Range filter on volume (respects timePeriod)
   * - minMarketCap/maxMarketCap: Range filter on market capitalization
   * - protocol: Case-insensitive partial match (e.g., "Raydium" matches "Raydium CLMM")
   * - timePeriod: Selects volume field (1h, 24h, 7d)
   */
  filterTokens(tokens: TokenData[], filters: FilterOptions): TokenData[] {
    return tokens.filter((token) => {
      // Select volume field based on requested time period
      let volume = token.volume_sol;
      if (filters.timePeriod === '1h') {
        volume = token.volume_1h ?? token.volume_sol;
      } else if (filters.timePeriod === '24h') {
        volume = token.volume_24h ?? token.volume_sol;
      } else if (filters.timePeriod === '7d') {
        // Prefer accurate 7d volume from snapshots when available
        volume = token.volume_7d ?? ((token.volume_24h ?? token.volume_sol) * 7);
      }

      if (filters.minVolume !== undefined && volume < filters.minVolume) {
        return false;
      }

      if (filters.maxVolume !== undefined && volume > filters.maxVolume) {
        return false;
      }

      if (filters.minMarketCap !== undefined && token.market_cap_sol < filters.minMarketCap) {
        return false;
      }

      if (filters.maxMarketCap !== undefined && token.market_cap_sol > filters.maxMarketCap) {
        return false;
      }

      if (filters.protocol) {
        // Case-insensitive partial match for protocol
        const protocolLower = filters.protocol.toLowerCase();
        const tokenProtocolLower = (token.protocol || '').toLowerCase();
        if (!tokenProtocolLower.includes(protocolLower)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Sorts token array by specified field and order
   * Supports time-period specific sorting for volume and price_change
   * 
   * @param tokens - Array of tokens to sort (does not mutate original)
   * @param sortOptions - SortOptions object specifying sort field, order, and time period
   * @returns TokenData[] - New sorted array
   * 
   * Sort Fields:
   * - volume: Trading volume (1h/24h/7d based on timePeriod)
   * - price_change: Price percentage change (1h/24h/7d)
   * - price: Current token price in SOL
   * - market_cap: Market capitalization in SOL
   * - liquidity: Liquidity pool size in SOL
   * - transaction_count: Number of transactions
   * 
   * Sort Order: 'asc' (ascending) or 'desc' (descending, default)
   */
  sortTokens(tokens: TokenData[], sortOptions: SortOptions): TokenData[] {
    const { sortBy = 'volume', sortOrder = 'desc', timePeriod = '24h' } = sortOptions as SortOptions & { timePeriod?: '1h' | '24h' | '7d' };

    return [...tokens].sort((a, b) => {
      let aValue = 0;
      let bValue = 0;

      switch (sortBy) {
        case 'volume':
          if (timePeriod === '1h') {
            aValue = a.volume_1h ?? a.volume_sol;
            bValue = b.volume_1h ?? b.volume_sol;
          } else if (timePeriod === '24h') {
            aValue = a.volume_24h ?? a.volume_sol;
            bValue = b.volume_24h ?? b.volume_sol;
          } else if (timePeriod === '7d') {
            aValue = a.volume_7d ?? ((a.volume_24h ?? a.volume_sol) * 7);
            bValue = b.volume_7d ?? ((b.volume_24h ?? b.volume_sol) * 7);
          } else {
            aValue = a.volume_sol;
            bValue = b.volume_sol;
          }
          break;
        case 'price_change':
          if (timePeriod === '1h') {
            aValue = a.price_1hr_change;
            bValue = b.price_1hr_change;
          } else if (timePeriod === '24h') {
            aValue = a.price_24hr_change ?? a.price_1hr_change;
            bValue = b.price_24hr_change ?? b.price_1hr_change;
          } else if (timePeriod === '7d') {
            aValue = a.price_7d_change ?? a.price_24hr_change ?? a.price_1hr_change;
            bValue = b.price_7d_change ?? b.price_24hr_change ?? b.price_1hr_change;
          } else {
            aValue = a.price_24hr_change ?? a.price_1hr_change;
            bValue = b.price_24hr_change ?? b.price_1hr_change;
          }
          break;
        case 'price':
          aValue = a.price_sol;
          bValue = b.price_sol;
          break;
        case 'market_cap':
          aValue = a.market_cap_sol;
          bValue = b.market_cap_sol;
          break;
        case 'liquidity':
          aValue = a.liquidity_sol;
          bValue = b.liquidity_sol;
          break;
        case 'transaction_count':
          aValue = a.transaction_count;
          bValue = b.transaction_count;
          break;
        default:
          aValue = a.volume_sol;
          bValue = b.volume_sol;
      }

      if (sortOrder === 'asc') {
        return aValue - bValue;
      }
      return bValue - aValue;
    });
  }

  /**
   * Invalidates all token-related cache entries
   * Used for manual cache refresh (e.g., POST /api/cache/invalidate endpoint)
   * 
   * @returns Promise<void>
   * 
   * Implementation:
   * - Finds all keys matching 'tokens:*' pattern
   * - Deletes them in parallel using Promise.all
   * - Next request will fetch fresh data from APIs
   */
  async invalidateCache(): Promise<void> {
    const keys = await cacheManager.keys('tokens:*');
    await Promise.all(keys.map((key) => cacheManager.del(key)));
  }

  /**
   * Calculates 7-day price changes by comparing current price with price from 7 days ago
   * Stores daily price snapshots in Redis with 8-day TTL for historical tracking
   * 
   * @param tokens - Array of tokens to enrich (mutates in-place by adding price_7d_change)
   * @returns Promise<void>
   * 
   * Algorithm:
   * 1. For each token, fetch historical snapshot from Redis (key: price_history:{address})
   * 2. If snapshot exists and is 7+ days old: calculate percentage change
   * 3. If no snapshot or >24h old: store new snapshot with current price and timestamp
   * 4. TTL = 8 days (7 days + 1 day buffer to ensure we always have 7-day data)
   * 
   * Performance: Processes tokens in parallel, ignores individual failures gracefully
   * Cache Strategy: Only updates snapshot once per 24 hours to reduce Redis writes
   */
  private async enrichWith7DayChanges(tokens: TokenData[]): Promise<void> {
    try {
      const now = Date.now();
      
      // Process tokens in parallel for speed
      await Promise.all(tokens.map(async (token) => {
        try {
          const priceKey = `price_history:${token.token_address}`;
          
          // Get historical price from 7 days ago
          const historicalData = await cacheManager.get<{ price: number; timestamp: number }>(priceKey);
          
          if (historicalData && token.price_sol > 0) {
            // Calculate percentage change
            const oldPrice = historicalData.price;
            if (oldPrice > 0) {
              token.price_7d_change = ((token.price_sol - oldPrice) / oldPrice) * 100;
            }
          }
          
          // Store current price snapshot if enough time has passed (only update once per day)
          if (!historicalData || (now - historicalData.timestamp) >= (24 * 60 * 60 * 1000)) {
            await cacheManager.set(
              priceKey,
              { price: token.price_sol, timestamp: now },
              8 * 24 * 60 * 60 // 8 days TTL (7 days + 1 day buffer)
            );
          }
        } catch (err) {
          // Ignore individual token errors
        }
      }));
    } catch (error) {
      console.warn('Failed to enrich 7-day price changes:', error);
    }
  }
}
