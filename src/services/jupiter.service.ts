import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { TokenData, JupiterToken } from '../types';
import { exponentialBackoff } from '../utils/helpers';

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
    try {
      return await exponentialBackoff(async () => {
        const response = await this.client.get(`/search?query=${encodeURIComponent(query)}`);
        return this.transformTokens(response.data || []);
      });
    } catch (error) {
      console.warn(`Jupiter search failed for "${query}", returning empty results`);
      return [];
    }
  }

  async getPopularTokens(): Promise<TokenData[]> {
    try {
      return await exponentialBackoff(async () => {
        // Jupiter doesn't have a trending endpoint, so we search for popular tokens
        const queries = ['SOL', 'USDC', 'BONK', 'WIF'];
        const allTokens: TokenData[] = [];

        for (const query of queries) {
          try {
            const response = await this.client.get(`/search?query=${query}`);
            const tokens = this.transformTokens(response.data || []);
            allTokens.push(...tokens.slice(0, 5));
          } catch (error) {
            // Skip individual query failures
            console.warn(`Skipped Jupiter query for ${query}`);
          }
        }

        return allTokens;
      });
    } catch (error) {
      // If all retries fail, return empty array instead of throwing
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
