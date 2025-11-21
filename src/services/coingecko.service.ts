import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { cacheManager } from './cache.service';

/**
 * CoinGecko API integration service
 * 
 * Purpose:
 * Fetches SOL/USD exchange rate from CoinGecko API.
 * Used to convert SOL-denominated values to USD for display.
 * 
 * API Endpoints:
 * - /simple/price?ids=solana&vs_currencies=usd - Current SOL price in USD
 * 
 * Caching Strategy:
 * - Cache key: 'upstream:coingecko:sol_usd'
 * - TTL: 300 seconds (5 minutes)
 * - Prevents rate limiting from CoinGecko free tier
 * 
 * Rate Limiting:
 * - CoinGecko free tier: 10-50 calls/minute
 * - 5-minute cache ensures <12 calls/hour
 * - No dedicated rate limiter (relies on caching)
 * 
 * Use Cases:
 * - Convert token volumes from SOL to USD
 * - Convert market cap from SOL to USD
 * - Display USD equivalents in frontend
 * 
 * Error Handling:
 * - API failures: Returns 0 (graceful degradation)
 * - Logs warnings for debugging
 * - Never throws (prevents application crashes)
 * 
 * @class CoinGeckoService
 */
class CoinGeckoService {
  private client: AxiosInstance;
  private solCacheKey = 'upstream:coingecko:sol_usd';

  constructor() {
    this.client = axios.create({
      baseURL: config.coinGecko.base,
      timeout: 5000,
      headers: { Accept: 'application/json' },
    });
  }

  /**
   * Get current SOL price in USD
   * 
   * Purpose:
   * Fetches SOL/USD exchange rate from CoinGecko API with 5-minute caching.
   * Primary method for currency conversion in the application.
   * 
   * Caching Behavior:
   * - Cache hit: Returns immediately (<1ms)
   * - Cache miss: Fetches from API (~200-500ms)
   * - Cache TTL: 300 seconds (5 minutes)
   * - Force refresh: Bypasses cache if forceRefresh=true
   * 
   * API Response Format:
   * ```json
   * {
   *   "solana": {
   *     "usd": 123.45
   *   }
   * }
   * ```
   * 
   * Type Coercion:
   * - Handles both number and string responses
   * - Converts string to number if needed
   * - Returns 0 if conversion fails
   * 
   * Error Handling:
   * - Network errors: Returns 0
   * - Invalid response format: Returns 0
   * - API rate limit: Returns 0 (relies on cache to prevent)
   * - Logs warnings for debugging
   * 
   * Performance:
   * - Cached response: <1ms
   * - Fresh API call: ~200-500ms
   * - Timeout: 5000ms (configured in axios client)
   * 
   * @param {boolean} [forceRefresh=false] - Bypass cache and fetch fresh data
   * @returns {Promise<number>} Current SOL price in USD, or 0 on error
   * 
   * @example
   * // Get cached price
   * const price = await coingeckoService.getSolPriceUsd();
   * // price = 123.45
   * 
   * // Force fresh fetch
   * const freshPrice = await coingeckoService.getSolPriceUsd(true);
   * // freshPrice = 124.50 (bypassed cache)
   * 
   * // API failure
   * // Logs: "CoinGecko SOL price fetch failed: timeout of 5000ms exceeded"
   * // Returns: 0
   */
  async getSolPriceUsd(forceRefresh: boolean = false): Promise<number> {
    const cached = await cacheManager.get<number>(this.solCacheKey);
    if (!forceRefresh && cached !== null && cached !== undefined) return cached;

    try {
      const res = await this.client.get('/simple/price', {
        params: { ids: 'solana', vs_currencies: 'usd' },
      });
      const price = res.data?.solana?.usd ?? null;
      const value = typeof price === 'number' ? price : Number(price) || 0;
      // cache for 5 minutes to avoid rate limiting
      await cacheManager.set(this.solCacheKey, value, 300);
      return value;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('CoinGecko SOL price fetch failed', (e as any)?.message || e);
    }

    return 0;
  }

  /**
   * Convert SOL amount to USD equivalent
   * 
   * Purpose:
   * Convenience method to convert SOL-denominated values to USD.
   * Uses cached SOL/USD price from getSolPriceUsd().
   * 
   * Calculation:
   * USD = SOL amount × SOL/USD price
   * 
   * Edge Cases:
   * - Zero amount: Returns 0 immediately (optimization)
   * - Null/undefined amount: Returns 0
   * - Price fetch failure: Returns 0 (0 × solAmount = 0)
   * 
   * Performance:
   * - If price cached: ~1ms
   * - If price needs fetch: ~200-500ms
   * - Subsequent calls fast (price cached)
   * 
   * @param {number} solAmount - Amount in SOL to convert
   * @returns {Promise<number>} Equivalent USD value
   * 
   * @example
   * // Convert 10 SOL to USD
   * const usd = await coingeckoService.solToUsd(10);
   * // If SOL price = $123.45, usd = 1234.50
   * 
   * // Zero amount
   * const usd = await coingeckoService.solToUsd(0);
   * // usd = 0 (early return, no API call)
   * 
   * // Price unavailable (API down)
   * const usd = await coingeckoService.solToUsd(10);
   * // usd = 0 (10 × 0 = 0)
   */
  async solToUsd(solAmount: number): Promise<number> {
    if (!solAmount) return 0;
    const price = await this.getSolPriceUsd();
    return solAmount * price;
  }
}

export const coingeckoService = new CoinGeckoService();
export default coingeckoService;
