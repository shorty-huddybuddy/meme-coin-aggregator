import { TokenData, FilterOptions, SortOptions } from '../types';
import { DexScreenerService } from './dexscreener.service';
import { JupiterService } from './jupiter.service';
import { cacheManager } from './cache.service';
import { CacheKey } from '../types';

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

    const [dexTokens, jupiterTokens] = await Promise.allSettled([
      this.dexScreener.getTrendingTokens(),
      this.jupiter.getPopularTokens(),
    ]);

    const allTokens: TokenData[] = [];

    if (dexTokens.status === 'fulfilled') {
      allTokens.push(...dexTokens.value);
    }

    if (jupiterTokens.status === 'fulfilled') {
      allTokens.push(...jupiterTokens.value);
    }

    const mergedTokens = this.mergeTokens(allTokens);
    await cacheManager.set(CacheKey.ALL_TOKENS, mergedTokens);

    return mergedTokens;
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
      if (filters.minVolume !== undefined && token.volume_sol < filters.minVolume) {
        return false;
      }

      if (filters.maxVolume !== undefined && token.volume_sol > filters.maxVolume) {
        return false;
      }

      if (filters.minMarketCap !== undefined && token.market_cap_sol < filters.minMarketCap) {
        return false;
      }

      if (filters.maxMarketCap !== undefined && token.market_cap_sol > filters.maxMarketCap) {
        return false;
      }

      if (filters.protocol && token.protocol !== filters.protocol) {
        return false;
      }

      return true;
    });
  }

  sortTokens(tokens: TokenData[], sortOptions: SortOptions): TokenData[] {
    const { sortBy = 'volume_sol', sortOrder = 'desc' } = sortOptions;

    return [...tokens].sort((a, b) => {
      let aValue: number;
      let bValue: number;

      switch (sortBy) {
        case 'volume':
          aValue = a.volume_sol;
          bValue = b.volume_sol;
          break;
        case 'price_change':
          aValue = a.price_1hr_change;
          bValue = b.price_1hr_change;
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
