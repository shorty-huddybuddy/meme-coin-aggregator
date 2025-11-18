import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { TokenData, DexScreenerPair } from '../types';
import { exponentialBackoff, RateLimiter } from '../utils/helpers';
import { RateLimitError } from '../utils/errors';

export class DexScreenerService {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;

  constructor() {
    this.client = axios.create({
      baseURL: config.api.dexScreener,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
    });
    this.rateLimiter = new RateLimiter();
  }

  async searchTokens(query: string): Promise<TokenData[]> {
    const canProceed = await this.rateLimiter.checkLimit();
    if (!canProceed) {
      throw new RateLimitError('DexScreener rate limit exceeded');
    }

    try {
      return await exponentialBackoff(async () => {
        const response = await this.client.get(`/search?q=${encodeURIComponent(query)}`);
        return this.transformPairs(response.data.pairs || []);
      });
    } catch (error) {
      console.warn(`DexScreener search failed for "${query}", returning empty results`);
      return [];
    }
  }

  async getTokenByAddress(address: string): Promise<TokenData[]> {
    const canProceed = await this.rateLimiter.checkLimit();
    if (!canProceed) {
      throw new RateLimitError('DexScreener rate limit exceeded');
    }

    try {
      return await exponentialBackoff(async () => {
        const response = await this.client.get(`/tokens/${address}`);
        return this.transformPairs(response.data.pairs || []);
      });
    } catch (error) {
      console.warn(`DexScreener lookup failed for address ${address}`);
      return [];
    }
  }

  async getTrendingTokens(): Promise<TokenData[]> {
    const canProceed = await this.rateLimiter.checkLimit();
    if (!canProceed) {
      throw new RateLimitError('DexScreener rate limit exceeded');
    }

    try {
      return await exponentialBackoff(async () => {
        // Use popular Solana tokens as fallback search
        const queries = ['SOL', 'BONK', 'WIF', 'POPCAT'];
        const allTokens: TokenData[] = [];

        for (const query of queries) {
          try {
            const response = await this.client.get(`/search?q=${query}`);
            const tokens = this.transformPairs(response.data.pairs || []);
            allTokens.push(...tokens.slice(0, 10)); // Take top 10 per query
          } catch (error) {
            // Skip individual query failures silently
            console.warn(`Skipped DexScreener query for ${query}`);
          }
        }

        return allTokens;
      });
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
    return this.rateLimiter.getRemainingRequests();
  }
}
