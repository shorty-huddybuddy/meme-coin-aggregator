import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { TokenData, DexScreenerPair } from '../types';
import { exponentialBackoff } from '../utils/helpers';
import { dexscreenerLimiter } from './upstreamClients';
import { cacheManager } from './cache.service';

/**
 * DexScreener API integration service
 * 
 * Purpose:
 * Fetches real-time Solana token data from DexScreener API.
 * Primary source for price data, volume, liquidity, and market metrics.
 * 
 * API Endpoints Used:
 * - /search?q={query} - Search tokens by name, ticker, or address
 * - /tokens/{address} - Get all pairs for specific token address
 * 
 * Features:
 * - Cache-first strategy (30s TTL)
 * - Exponential backoff retry logic
 * - Rate limiting via token bucket algorithm
 * - Solana chain filtering
 * - Multi-query trending token aggregation
 * - Parallel query execution with timeouts
 * 
 * Data Coverage:
 * - Token name, ticker, address
 * - Price in SOL and USD
 * - 1h/24h volume and price changes
 * - Market cap and liquidity
 * - Transaction counts
 * - DEX protocol (Raydium, Orca, etc.)
 * 
 * Rate Limiting:
 * - Managed by dexscreenerLimiter (token bucket)
 * - Default: 150 requests per minute, 3 concurrent
 * - Configurable via environment variables
 * 
 * Caching Strategy:
 * - Search results: 30s TTL (real-time updates)
 * - Token lookups: 30s TTL
 * - Trending tokens: 60s TTL (longer cache for stability)
 * 
 * @class DexScreenerService
 */
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

  /**
   * Search for tokens by query string
   * 
   * Purpose:
   * Searches DexScreener for tokens matching query (name, ticker, or address).
   * Implements cache-first strategy with exponential backoff retry.
   * 
   * Search Matching:
   * - Token name: Partial case-insensitive match (e.g., "bonk" matches "Bonk Inu")
   * - Token ticker: Exact or partial match (e.g., "BONK")
   * - Token address: Exact match (full Solana address)
   * 
   * Caching:
   * - Cache key: `upstream:dexscreener:search:{query}`
   * - TTL: 30 seconds (config.cache.ttl)
   * - Cache hit: Returns immediately
   * - Cache miss: Fetches from API, caches result
   * 
   * Rate Limiting:
   * - Uses dexscreenerLimiter (token bucket algorithm)
   * - Queues request if rate limit exceeded
   * - Waits for available tokens before proceeding
   * 
   * Retry Logic:
   * - exponentialBackoff: 1s → 2s → 4s → 8s → 16s → 30s (max)
   * - Retries on: Network errors, timeouts, 5xx errors
   * - No retry on: 4xx errors (invalid query)
   * 
   * Error Handling:
   * - API failures: Returns empty array []
   * - Logs warning with query for debugging
   * - Never throws (graceful degradation)
   * 
   * Chain Filtering:
   * - Only returns Solana tokens (chainId === 'solana')
   * - Filters out Ethereum, BSC, Polygon pairs
   * 
   * @param {string} query - Search term (name, ticker, or address)
   * @returns {Promise<TokenData[]>} Array of matching tokens (empty if no results or error)
   * 
   * @example
   * // Search by ticker
   * const tokens = await service.searchTokens('BONK');
   * // Returns: [{token_ticker: 'BONK', token_name: 'Bonk', ...}, ...]
   * 
   * // Search by address
   * const tokens = await service.searchTokens('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
   * // Returns: Single token with all pairs
   * 
   * // Search with no results
   * const tokens = await service.searchTokens('NONEXISTENT');
   * // Returns: []
   */
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

  /**
   * Get all trading pairs for a specific token address
   * 
   * Purpose:
   * Fetches all DEX pairs where token is traded (Raydium, Orca, etc.).
   * Used for detailed token analysis and multi-pool aggregation.
   * 
   * API Endpoint:
   * GET /tokens/{address}
   * Returns all pairs containing the token across all DEXs
   * 
   * Use Cases:
   * - Find best liquidity pool for token
   * - Compare prices across multiple DEXs
   * - Aggregate volume from all pairs
   * - Identify arbitrage opportunities
   * 
   * Caching:
   * - Cache key: `upstream:dexscreener:token:{address}`
   * - TTL: 30 seconds
   * - Reduces API load for frequently queried tokens
   * 
   * Data Returned:
   * Each pair transformed to TokenData with:
   * - Token info (name, ticker, address)
   * - Price in SOL and USD
   * - Volume (1h, 24h)
   * - Liquidity and market cap
   * - DEX protocol identifier
   * 
   * Error Handling:
   * - Invalid address: Returns []
   * - API failure: Returns []
   * - Network timeout: Returns []
   * - Logs warning for debugging
   * 
   * @param {string} address - Solana token address (base58 encoded)
   * @returns {Promise<TokenData[]>} Array of pairs for this token
   * 
   * @example
   * // Get all pairs for BONK
   * const pairs = await service.getTokenByAddress('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
   * // Returns: [
   * //   {protocol: 'Raydium', liquidity_sol: 1000, ...},
   * //   {protocol: 'Orca', liquidity_sol: 500, ...}
   * // ]
   */
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

  /**
   * Fetch trending tokens using multiple search queries
   * 
   * Purpose:
   * Discovers trending Solana tokens by searching popular keywords.
   * Implements parallel execution with per-query timeouts for speed.
   * Primary method for populating token aggregation list.
   * 
   * Discovery Strategy:
   * 1. Execute multiple search queries in parallel (SOL, BONK, WIF, POPCAT, etc.)
   * 2. Cap results per query (default: 30 tokens)
   * 3. Deduplicate by token address
   * 4. Cache individual query results for 60s
   * 
   * Configured Queries:
   * Default: ['SOL', 'BONK', 'WIF', 'POPCAT', 'PEPE', 'TRUMP', 'MEME']
   * Configurable via: DEXSCREENER_QUERIES env var (comma-separated)
   * 
   * Per-Query Cap:
   * Default: 30 tokens per query
   * Configurable via: DEXSCREENER_PER_QUERY_CAP env var
   * Total potential: queries.length × perQueryCap tokens
   * 
   * Parallel Execution:
   * - Uses Promise.allSettled for concurrent queries
   * - Continues if some queries fail (resilient)
   * - 8-second timeout per query (prevents hanging)
   * - Logs success/failure for each query
   * 
   * Caching Behavior:
   * - Cache key: `upstream:dexscreener:search:{query}`
   * - TTL: 60s (2× normal TTL for stability)
   * - Cache hit: Logs "⚡ from cache"
   * - Cache miss: Logs "✓ returned X tokens"
   * 
   * Deduplication:
   * - Uses Set<string> to track seen addresses
   * - First occurrence wins (preserves best match)
   * - Prevents duplicate tokens from overlapping queries
   * 
   * Error Handling:
   * - Individual query failures logged but don't stop execution
   * - Query timeouts (>8s) logged as failures
   * - Network errors: Logged, returns partial results
   * - Complete failure: Returns []
   * 
   * Performance:
   * - Parallel execution: ~500ms for all queries
   * - Sequential would take: ~3500ms (7 queries × 500ms)
   * - Cached execution: ~10ms
   * 
   * Logging Output:
   * ```
   * ✓ DexScreener query "SOL" returned 30 tokens
   * ⚡ DexScreener query "BONK" from cache: 25 tokens
   * ✗ DexScreener query "INVALID" failed: Query timeout
   * DexScreener: 45 unique tokens after deduplication
   * ```
   * 
   * @returns {Promise<TokenData[]>} Deduplicated array of trending tokens
   * 
   * @example
   * // Fetch trending tokens
   * const trending = await service.getTrendingTokens();
   * // Returns: ~50-200 unique tokens depending on configuration
   * 
   * // Configure custom queries
   * process.env.DEXSCREENER_QUERIES = 'SOL,BONK,MEME';
   * process.env.DEXSCREENER_PER_QUERY_CAP = '50';
   * const trending = await service.getTrendingTokens();
   * // Returns: Up to 150 tokens (3 queries × 50 cap)
   */
  async getTrendingTokens(): Promise<TokenData[]> {
    try {
      // Use all configured queries for better token coverage
      const queries = config.upstream.dexscreenerQueries || ['SOL', 'BONK', 'WIF', 'POPCAT', 'PEPE'];
      const perQueryCap = config.upstream.dexscreenerPerQueryCap || 30;
      const seenAddresses = new Set<string>();

      // Parallel execution with Promise.allSettled for speed
      const queryPromises = queries.map(async (query) => {
        const cacheKey = `upstream:dexscreener:search:${query}`;
        let tokens = await cacheManager.get<TokenData[]>(cacheKey);
        
        if (!tokens) {
          try {
            // Add 8s timeout per query to prevent hanging
            const response = await Promise.race([
              dexscreenerLimiter.schedule(() => this.client.get(`/search?q=${encodeURIComponent(query)}`)),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 8000))
            ]) as any;
            tokens = this.transformPairs(response.data.pairs || []);
            await cacheManager.set(cacheKey, tokens, config.cache.ttl * 2); // Longer cache
            console.log(`✓ DexScreener query "${query}" returned ${tokens.length} tokens`);
          } catch (err) {
            console.warn(`✗ DexScreener query "${query}" failed:`, (err as any)?.message || err);
            return [];
          }
        } else {
          console.log(`⚡ DexScreener query "${query}" from cache: ${tokens.length} tokens`);
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

      console.log(`DexScreener: ${allTokens.length} unique tokens after deduplication`);
      return allTokens;
    } catch (error) {
      console.warn('DexScreener API unavailable, skipping trending tokens');
      return [];
    }
  }

  /**
   * Transform DexScreener pair data to standardized TokenData format
   * 
   * Purpose:
   * Converts DexScreener API response format to internal TokenData schema.
   * Filters Solana-only pairs and validates required fields.
   * 
   * Transformations Applied:
   * 
   * 1. Chain Filtering:
   *    - Only Solana pairs (chainId === 'solana')
   *    - Filters out: Ethereum, BSC, Polygon, Arbitrum, etc.
   *    - Validates baseToken.address exists
   * 
   * 2. Token Info:
   *    - token_address: pair.baseToken.address
   *    - token_name: pair.baseToken.name || 'Unknown'
   *    - token_ticker: pair.baseToken.symbol || 'UNKNOWN'
   * 
   * 3. Price Data:
   *    - price_sol: parseFloat(pair.priceNative) - Price in SOL
 *    - price_1hr_change: pair.priceChange.h1 (percentage)
   *    - price_24hr_change: pair.priceChange.h24 (percentage)
   * 
   * 4. Volume Metrics:
   *    - volume_1h: USD volume converted to SOL
   *    - volume_24h: USD volume converted to SOL
   *    - volume_sol: Defaults to 24h volume
   * 
   * 5. Market Metrics:
   *    - market_cap_sol: Market cap converted from USD to SOL
   *    - liquidity_sol: pair.liquidity.quote (SOL liquidity)
   *    - transaction_count: Sum of 24h buys + sells
   * 
   * 6. Metadata:
   *    - protocol: pair.dexId (e.g., 'raydium', 'orca')
   *    - source: 'dexscreener' (for aggregation tracking)
   *    - last_updated: Current timestamp
   * 
   * USD to SOL Conversion:
   * - Divides USD values by pair.priceUsd
   * - Example: $1000 volume / $100 SOL price = 10 SOL volume
   * - Fallback to 1 if priceUsd missing (prevents division by zero)
   * 
   * Default Values:
   * - Missing name: 'Unknown'
   * - Missing symbol: 'UNKNOWN'
   * - Missing price: 0
   * - Missing volume: 0
   * - Missing liquidity: 0
   * - Missing transactions: 0
   * - Missing price changes: 0
   * 
   * Validation:
   * - Filters pairs without baseToken.address (invalid)
   * - Filters non-Solana chains
   * - Ensures numeric conversions with parseFloat fallback
   * 
   * @param {DexScreenerPair[]} pairs - Raw pairs from DexScreener API
   * @returns {TokenData[]} Transformed and filtered token data array
   * 
   * @example
   * // DexScreener API response
   * const apiResponse = {
   *   pairs: [
   *     {
   *       chainId: 'solana',
   *       baseToken: { address: 'ABC...', name: 'Bonk', symbol: 'BONK' },
   *       priceNative: '0.00001',
   *       priceUsd: '0.001',
   *       volume: { h1: 5000, h24: 100000 },
   *       liquidity: { quote: 50000 },
   *       txns: { h24: { buys: 120, sells: 80 } },
   *       priceChange: { h1: 5.2, h24: 12.5 },
   *       dexId: 'raydium'
   *     }
   *   ]
   * };
   * 
   * // Transformed output
   * const tokens = transformPairs(apiResponse.pairs);
   * // Returns: [
   * //   {
   * //     token_address: 'ABC...',
   * //     token_name: 'Bonk',
   * //     token_ticker: 'BONK',
   * //     price_sol: 0.00001,
   * //     volume_24h: 100000000, // 100000 / 0.001
   * //     liquidity_sol: 50000,
   * //     transaction_count: 200,
   * //     price_24hr_change: 12.5,
   * //     protocol: 'raydium',
   * //     source: 'dexscreener',
   * //     last_updated: 1702345678900
   * //   }
   * // ]
   */
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
