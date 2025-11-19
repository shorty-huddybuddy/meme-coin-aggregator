import { TokenData, FilterOptions, SortOptions } from '../types';
import { DexScreenerService } from './dexscreener.service';
import { JupiterService } from './jupiter.service';
import { cacheManager } from './cache.service';
import { CacheKey } from '../types';
import { coingeckoService } from './coingecko.service';
import { geckoTerminalService } from './geckoterminal.service';
import { config } from '../config';

export class AggregationService {
  private dexScreener: DexScreenerService;
  private jupiter: JupiterService;

  constructor() {
    this.dexScreener = new DexScreenerService();
    this.jupiter = new JupiterService();
  }

  async getAllTokens(useCache: boolean = true): Promise<TokenData[]> {
    if (useCache) {
      const cached = await cacheManager.get<TokenData[]>(CacheKey.ALL_TOKENS);
      if (cached) {
        return cached;
      }
    }

    // Add global timeout of 15 seconds for entire aggregation
    const aggregationTimeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Aggregation timeout')), 15000)
    );

    try {
      const [dexTokens, jupiterTokens, geckoTokens] = await Promise.race([
        Promise.allSettled([
          this.dexScreener.getTrendingTokens(),
          this.jupiter.getPopularTokens(),
          geckoTerminalService.collectTokens(1), // Only 1 page for speed
        ]),
        aggregationTimeout
      ]) as PromiseSettledResult<TokenData[]>[];

    const allTokens: TokenData[] = [];

    if (dexTokens.status === 'fulfilled') {
      allTokens.push(...dexTokens.value);
    }

    if (jupiterTokens.status === 'fulfilled') {
      allTokens.push(...jupiterTokens.value);
    }

      if (geckoTokens.status === 'fulfilled') {
        allTokens.push(...geckoTokens.value);
      }

    const mergedTokens = this.mergeTokens(allTokens);

    // Removed Postgres 7d aggregate enrichment.
    // Compute 7d volume approximation from available 24h volume (fallback-only approach).
    for (const t of mergedTokens) {
      t.volume_7d = t.volume_7d ?? ((t.volume_24h ?? t.volume_sol) * 7);
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

    // Cache for 2x TTL to reduce re-aggregation frequency
    await cacheManager.set(CacheKey.ALL_TOKENS, mergedTokens, config.cache.ttl * 2);
    return mergedTokens;
    } catch (timeoutError) {
      console.error('Aggregation timeout - returning empty array');
      return [];
    }
  }

  async searchTokens(query: string, useCache: boolean = true): Promise<TokenData[]> {
    const cacheKey = `${CacheKey.SEARCH_PREFIX}${query}`;

    if (useCache) {
      const cached = await cacheManager.get<TokenData[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const [dexResults, jupiterResults] = await Promise.allSettled([
      this.dexScreener.searchTokens(query),
      this.jupiter.searchTokens(query),
    ]);

    const allTokens: TokenData[] = [];

    if (dexResults.status === 'fulfilled') {
      allTokens.push(...dexResults.value);
    }

    if (jupiterResults.status === 'fulfilled') {
      allTokens.push(...jupiterResults.value);
    }

    const mergedTokens = this.mergeTokens(allTokens);
    await cacheManager.set(cacheKey, mergedTokens);

    return mergedTokens;
  }

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
          price_1hr_change: existing.price_1hr_change !== 0 ? existing.price_1hr_change : token.price_1hr_change,
          price_24hr_change: existing.price_24hr_change !== 0 ? existing.price_24hr_change : token.price_24hr_change,
          protocol: existing.protocol !== 'Unknown' ? existing.protocol : token.protocol,
          last_updated: Math.max(existing.last_updated, token.last_updated),
          source: `${existing.source},${token.source}`,
        };

        tokenMap.set(key, merged);
      }
    }

    return Array.from(tokenMap.values());
  }

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

  async invalidateCache(): Promise<void> {
    const keys = await cacheManager.keys('tokens:*');
    await Promise.all(keys.map((key) => cacheManager.del(key)));
  }
}
