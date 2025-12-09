import UpstreamRateLimiter from './upstreamRateLimiter';
import { config } from '../config';

/**
 * Singleton rate limiters for upstream API services
 * 
 * Purpose:
 * Provides pre-configured rate limiters for each upstream API.
 * Prevents exceeding API rate limits and manages concurrency.
 * 
 * Limiters:
 * 
 * 1. dexscreenerLimiter:
 *    - Rate: DEXSCREENER_RATE_PER_MINUTE (default: 150/min)
 *    - Burst: max(1, floor(rate/60))
 *    - Concurrency: DEXSCREENER_CONCURRENCY (default: 3)
 * 
 * 2. jupiterLimiter:
 *    - Rate: JUPITER_RATE_PER_MINUTE (default: 150/min)
 *    - Burst: max(1, floor(rate/60))
 *    - Concurrency: JUPITER_CONCURRENCY (default: 3)
 * 
 * Configuration:
 * Environment variables:
 * - DEXSCREENER_RATE_PER_MINUTE: Max requests per minute
 * - DEXSCREENER_CONCURRENCY: Max simultaneous requests
 * - JUPITER_RATE_PER_MINUTE: Max requests per minute
 * - JUPITER_CONCURRENCY: Max simultaneous requests
 * 
 * Usage:
 * ```typescript
 * import { dexscreenerLimiter } from './upstreamClients';
 * 
 * const result = await dexscreenerLimiter.schedule(async () => {
 *   return await axios.get('https://api.dexscreener.com/...');
 * });
 * ```
 * 
 * Benefits:
 * - Prevents API rate limit errors (429)
 * - Manages concurrent connection limits
 * - Shared across all service instances
 * - Automatic request queuing
 * 
 * @example
 * // DexScreener search with rate limiting
 * const response = await dexscreenerLimiter.schedule(() =>
 *   axios.get('https://api.dexscreener.com/latest/dex/search?q=BONK')
 * );
 * 
 * // Jupiter search with rate limiting
 * const response = await jupiterLimiter.schedule(() =>
 *   axios.get('https://lite-api.jup.ag/tokens/v2/search?query=SOL')
 * );
 */
export const dexscreenerLimiter = new UpstreamRateLimiter(
  config.upstream.dexscreenerRatePerMinute,
  Math.max(1, Math.floor(config.upstream.dexscreenerRatePerMinute / 60)),
  config.upstream.dexscreenerConcurrency
);

export const jupiterLimiter = new UpstreamRateLimiter(
  config.upstream.jupiterRatePerMinute,
  Math.max(1, Math.floor(config.upstream.jupiterRatePerMinute / 60)),
  config.upstream.jupiterConcurrency
);

export const birdeyeLimiter = new UpstreamRateLimiter(
  config.upstream.birdeyeRatePerMinute,
  Math.max(1, Math.floor(config.upstream.birdeyeRatePerMinute / 60)),
  config.upstream.birdeyeConcurrency
);

export const coinbaseLimiter = new UpstreamRateLimiter(
  config.upstream.coinbaseRatePerMinute,
  Math.max(1, Math.floor(config.upstream.coinbaseRatePerMinute / 60)),
  config.upstream.coinbaseConcurrency
);

export const coingeckoLimiter = new UpstreamRateLimiter(
  config.upstream.coingeckoRatePerMinute,
  Math.max(1, Math.floor(config.upstream.coingeckoRatePerMinute / 60)),
  config.upstream.coingeckoConcurrency
);

export default { dexscreenerLimiter, jupiterLimiter, birdeyeLimiter, coinbaseLimiter, coingeckoLimiter };
