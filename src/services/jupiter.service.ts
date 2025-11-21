import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { TokenData, JupiterToken } from '../types';
import { exponentialBackoff } from '../utils/helpers';
import { jupiterLimiter } from './upstreamClients';
import { cacheManager } from './cache.service';

/**
 * Jupiter API integration service
 * 
 * Purpose:
 * Fetches Solana token data from Jupiter aggregator API.
 * Secondary data source focusing on high-volume trading pairs.
 * 
 * API Endpoints:
 * - /search?query={query} - Search tokens by name or ticker
 * 
 * Data Limitations:
 * Jupiter API provides limited price data:
 * - No real-time prices (price_sol = 0)
 * - No market cap data
 * - No liquidity data
 * - No price change percentages
 * - Only daily_volume available
 * 
 * Use Cases:
 * - Token discovery (find tokens not on DexScreener)
 * - Volume supplementation
 * - Cross-validation of token addresses
 * 
 * Aggregation Strategy:
 * Jupiter data merged with DexScreener in aggregation.service:
 * - DexScreener data takes priority (has price/market cap)
 * - Jupiter fills gaps for tokens not on DexScreener
 * - Volume data supplemented where available
 * 
 * Rate Limiting:
 * - Managed by jupiterLimiter (token bucket)
 * - Default: 150 requests per minute, 3 concurrent
 * - Configurable via JUPITER_RATE_PER_MINUTE, JUPITER_CONCURRENCY
 * 
 * @class JupiterService
 */
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

  /**
   * Search for tokens by query string
   * 
   * Purpose:
   * Searches Jupiter API for tokens matching name or ticker.
   * Implements cache-first strategy with exponential backoff.
   * 
   * Caching:
   * - Cache key: `upstream:jupiter:search:{query}`
   * - TTL: 30 seconds
   * - Reduces API load for repeated searches
   * 
   * Data Returned:
   * - Token address, name, symbol
   * - Daily volume (daily_volume field)
   * - All price fields set to 0 (not provided by Jupiter)
   * 
   * Error Handling:
   * - API failures: Returns empty array []
   * - Logs warning with query for debugging
   * - Never throws (graceful degradation)
   * 
   * @param {string} query - Search term (name or ticker)
   * @returns {Promise<TokenData[]>} Array of matching tokens
   * 
   * @example
   * const tokens = await service.searchTokens('BONK');
   * // Returns: [{token_ticker: 'BONK', volume_24h: 1000000, price_sol: 0, ...}]
   */
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

  /**
   * Fetch popular tokens using configured search queries
   * 
   * Purpose:
   * Discovers popular Solana tokens by searching Jupiter API.
   * Supplements DexScreener data with additional token coverage.
   * 
   * Discovery Strategy:
   * 1. Execute configured queries sequentially (SOL, USDC, BONK, WIF)
   * 2. Cap results per query (default: 5-20 depending on expandUpstream)
   * 3. Aggregate all results
   * 4. Cache individual query results
   * 
   * Configured Queries:
   * Default: ['SOL', 'USDC', 'BONK', 'WIF']
   * Configurable via: JUPITER_QUERIES env var
   * 
   * Per-Query Cap:
   * - Standard: 5 tokens per query
   * - Expanded: 20 tokens per query (DEV_EXPAND_UPSTREAM=true)
   * - Configurable via: JUPITER_PER_QUERY_CAP env var
   * 
   * Caching:
   * - Cache key: `upstream:jupiter:search:{query}`
   * - TTL: 30 seconds
   * - Reduces redundant API calls
   * 
   * Error Handling:
   * - Individual query failures logged but don't stop execution
   * - Returns partial results if some queries fail
   * - Complete API failure: Returns []
   * 
   * Logging:
   * ```
   * ✓ Jupiter query "SOL" returned 10 tokens
   * ⚡ Jupiter query "BONK" from cache: 8 tokens
   * ✗ Jupiter query "INVALID" failed: Not found
   * Jupiter: 18 total tokens
   * ```
   * 
   * @returns {Promise<TokenData[]>} Array of popular tokens
   * 
   * @example
   * const popular = await service.getPopularTokens();
   * // Returns: ~20-80 tokens depending on configuration
   */
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

  /**
   * Transform Jupiter token data to standardized TokenData format
   * 
   * Purpose:
   * Converts Jupiter API response to internal TokenData schema.
   * Sets default values for fields not provided by Jupiter API.
   * 
   * Transformations:
   * - token_address: token.address
   * - token_name: token.name
   * - token_ticker: token.symbol
   * - volume_24h: token.daily_volume || 0
   * - volume_sol: token.daily_volume || 0
   * 
   * Default Values (not provided by Jupiter):
   * - price_sol: 0
   * - market_cap_sol: 0
   * - liquidity_sol: 0
   * - transaction_count: 0
   * - price_1hr_change: 0
   * - price_24hr_change: 0
   * - volume_1h: 0
   * 
   * Metadata:
   * - protocol: 'Jupiter'
   * - source: 'jupiter'
   * - last_updated: Current timestamp
   * 
   * Note:
   * Jupiter data merged with DexScreener in aggregation layer.
   * DexScreener provides missing price/market cap data.
   * 
   * @param {JupiterToken[]} tokens - Raw tokens from Jupiter API
   * @returns {TokenData[]} Transformed token data
   */
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
