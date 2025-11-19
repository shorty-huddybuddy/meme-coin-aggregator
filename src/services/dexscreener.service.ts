import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { TokenData, DexScreenerPair } from '../types';
import { exponentialBackoff } from '../utils/helpers';
import { dexscreenerLimiter } from './upstreamClients';
import { cacheManager } from './cache.service';

export class DexScreenerService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.api.dexScreener,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  async searchTokens(query: string): Promise<TokenData[]> {
    const cacheKey = `upstream:dexscreener:search:${query}`;
    const cached = await cacheManager.get<TokenData[]>(cacheKey);
    if (cached) return cached;

    try {
      const result = await exponentialBackoff(async () => {
        const response = await dexscreenerLimiter.schedule(() => this.client.get(`/search?q=${encodeURIComponent(query)}`));
        return this.transformPairs(response.data.pairs || []);
      });

      // cache upstream search result
      await cacheManager.set(cacheKey, result, config.cache.ttl);
      return result;
    } catch (error) {
      console.warn(`DexScreener search failed for "${query}", returning empty results`);
      return [];
    }
  }

  async getTokenByAddress(address: string): Promise<TokenData[]> {
    const cacheKey = `upstream:dexscreener:token:${address}`;
    const cached = await cacheManager.get<TokenData[]>(cacheKey);
    if (cached) return cached;

    try {
      const result = await exponentialBackoff(async () => {
        const response = await dexscreenerLimiter.schedule(() => this.client.get(`/tokens/${address}`));
        return this.transformPairs(response.data.pairs || []);
      });
      await cacheManager.set(cacheKey, result, config.cache.ttl);
      return result;
    } catch (error) {
      console.warn(`DexScreener lookup failed for address ${address}`);
      return [];
    }
  }

  async getTrendingTokens(): Promise<TokenData[]> {
    try {
      // Limit to top 5 queries for faster response, only uppercase (case-insensitive on most)
      const queries = (config.upstream.dexscreenerQueries || ['SOL', 'BONK', 'WIF', 'POPCAT']).slice(0, 5);
      const perQueryCap = config.upstream.dexscreenerPerQueryCap || 20;
      const seenAddresses = new Set<string>();

      // Parallel execution with Promise.allSettled for speed
      const queryPromises = queries.map(async (query) => {
        const cacheKey = `upstream:dexscreener:search:${query}`;
        let tokens = await cacheManager.get<TokenData[]>(cacheKey);
        
        if (!tokens) {
          try {
            // Add 5s timeout per query to prevent hanging
            const response = await Promise.race([
              dexscreenerLimiter.schedule(() => this.client.get(`/search?q=${encodeURIComponent(query)}`)),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 5000))
            ]) as any;
            tokens = this.transformPairs(response.data.pairs || []);
            await cacheManager.set(cacheKey, tokens, config.cache.ttl * 2); // Longer cache
          } catch (err) {
            return [];
          }
        }
        return tokens.slice(0, perQueryCap);
      });

      const results = await Promise.allSettled(queryPromises);
      const allTokens: TokenData[] = [];

      // Deduplicate and collect results
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          result.value.forEach((token) => {
            if (!seenAddresses.has(token.token_address)) {
              seenAddresses.add(token.token_address);
              allTokens.push(token);
            }
          });
        }
      });

      return allTokens;
    } catch (error) {
      console.warn('DexScreener API unavailable, skipping trending tokens');
      return [];
    }
  }

  private transformPairs(pairs: DexScreenerPair[]): TokenData[] {
    return pairs
      .filter((pair) => pair?.chainId === 'solana' && pair?.baseToken?.address) // Focus on Solana with valid address
      .map((pair) => ({
        token_address: pair.baseToken.address,
        token_name: pair.baseToken.name || 'Unknown',
        token_ticker: pair.baseToken.symbol || 'UNKNOWN',
        price_sol: parseFloat(pair.priceNative || '0') || 0,
        market_cap_sol: pair.marketCap ? pair.marketCap / (parseFloat(pair.priceUsd || '1') || 1) : 0,
        volume_sol: (pair.volume?.h24 || 0) / (parseFloat(pair.priceUsd || '1') || 1),
        volume_1h: (pair.volume?.h1 || 0) / (parseFloat(pair.priceUsd || '1') || 1),
        volume_24h: (pair.volume?.h24 || 0) / (parseFloat(pair.priceUsd || '1') || 1),
        liquidity_sol: pair.liquidity?.quote || 0,
        transaction_count: (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0),
        price_1hr_change: pair.priceChange?.h1 || 0,
        price_24hr_change: pair.priceChange?.h24 || 0,
        protocol: pair.dexId || 'Unknown',
        last_updated: Date.now(),
        source: 'dexscreener',
      }));
  }

  getRemainingRequests(): number {
    // Not available for upstream token-bucket; return -1 to indicate unknown.
    return -1;
  }
}
