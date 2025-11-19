import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { TokenData, JupiterToken } from '../types';
import { exponentialBackoff } from '../utils/helpers';
import { jupiterLimiter } from './upstreamClients';
import { cacheManager } from './cache.service';

export class JupiterService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.api.jupiter,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  async searchTokens(query: string): Promise<TokenData[]> {
    const cacheKey = `upstream:jupiter:search:${query}`;
    const cached = await cacheManager.get<TokenData[]>(cacheKey);
    if (cached) return cached;

    try {
      const result = await exponentialBackoff(async () => {
        const response = await jupiterLimiter.schedule(() => this.client.get(`/search?query=${encodeURIComponent(query)}`));
        return this.transformTokens(response.data || []);
      });
      await cacheManager.set(cacheKey, result, config.cache.ttl);
      return result;
    } catch (error) {
      console.warn(`Jupiter search failed for "${query}", returning empty results`);
      return [];
    }
  }

  async getPopularTokens(): Promise<TokenData[]> {
    try {
      return await exponentialBackoff(async () => {
        // Jupiter: use configured discovery queries
        const queries = config.upstream.jupiterQueries || ['SOL', 'USDC', 'BONK', 'WIF'];
        const perQueryCap = config.upstream.jupiterPerQueryCap || (config.dev?.expandUpstream ? 20 : 5);
        const allTokens: TokenData[] = [];

        for (const query of queries) {
          try {
            const cacheKey = `upstream:jupiter:search:${query}`;
            let tokens = await cacheManager.get<TokenData[]>(cacheKey);
            if (!tokens) {
              const response = await jupiterLimiter.schedule(() => this.client.get(`/search?query=${encodeURIComponent(query)}`));
              tokens = this.transformTokens(response.data || []);
              await cacheManager.set(cacheKey, tokens, config.cache.ttl);
              console.log(`✓ Jupiter query "${query}" returned ${tokens.length} tokens`);
            } else {
              console.log(`⚡ Jupiter query "${query}" from cache: ${tokens.length} tokens`);
            }
            allTokens.push(...tokens.slice(0, perQueryCap));
          } catch (error) {
            console.warn(`✗ Jupiter query "${query}" failed:`, (error as any)?.message || error);
          }
        }

        console.log(`Jupiter: ${allTokens.length} total tokens`);
        return allTokens;
      });
    } catch (error) {
      console.warn('Jupiter API unavailable, skipping');
      return [];
    }
  }

  private transformTokens(tokens: JupiterToken[]): TokenData[] {
    return tokens.map((token) => ({
      token_address: token.address,
      token_name: token.name,
      token_ticker: token.symbol,
      price_sol: 0, // Jupiter doesn't provide price directly
      market_cap_sol: 0,
      volume_sol: token.daily_volume || 0,
      volume_1h: 0,
      volume_24h: token.daily_volume || 0,
      liquidity_sol: 0,
      transaction_count: 0,
      price_1hr_change: 0,
      price_24hr_change: 0,
      protocol: 'Jupiter',
      last_updated: Date.now(),
      source: 'jupiter',
    }));
  }
}
