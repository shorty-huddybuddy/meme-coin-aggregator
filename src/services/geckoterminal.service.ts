import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { cacheManager } from './cache.service';
import { dexscreenerLimiter } from './upstreamClients';
import { TokenData } from '../types';

/**
 * GeckoTerminal API integration service
 * 
 * Purpose:
 * Optional data source for additional Solana token discovery.
 * Fetches pool data from GeckoTerminal API as supplementary source.
 * 
 * API Endpoints:
 * - /networks/solana/pools?page={page} - List Solana pools
 * 
 * Status:
 * Optional service (disabled by default).
 * Enable via: GECKO_ENABLED=true
 * 
 * Data Provided:
 * - Token addresses from pool assets
 * - Token names and symbols
 * - Protocol/DEX information
 * - Limited price/volume data
 * 
 * Caching:
 * - Cache key: `upstream:gecko:pools:solana:page:{page}`
 * - TTL: 30 seconds
 * - Caches per-page results
 * 
 * Rate Limiting:
 * - Uses dexscreenerLimiter (shared rate limiter)
 * - Prevents overwhelming GeckoTerminal API
 * 
 * @class GeckoTerminalService
 */
export class GeckoTerminalService {
  private client: AxiosInstance;
  private network = 'solana';

  constructor() {
    this.client = axios.create({
      baseURL: config.upstream.geckoTerminalBase || 'https://api.geckoterminal.com/api/v2',
      timeout: 10000,
      headers: {
        Accept: 'application/json',
      },
    });
  }

  /**
   * Collect tokens from GeckoTerminal pool pages
   * 
   * Purpose:
   * Paginate through GeckoTerminal pool listings to discover tokens.
   * Extracts token addresses from pool asset data.
   * 
   * Pagination:
   * - Default: 3 pages
   * - Configurable via pages parameter
   * - Each page returns ~50-100 pools
   * - Total tokens: ~100-300 depending on pages
   * 
   * Data Extraction:
   * For each pool:
   * 1. Extract pool.attributes.assets or pool.assets
   * 2. For each asset with address:
   *    - Create TokenData with address, name, symbol
   *    - Set protocol from pool.attributes.dex
   *    - Default price/volume fields to 0
   * 
   * Caching:
   * - Per-page caching for efficiency
   * - Cache key includes network and page number
   * - TTL: 30 seconds
   * 
   * Error Handling:
   * - Skips pages that fail to fetch
   * - Ignores pools without valid asset data
   * - Returns partial results on errors
   * - Never throws
   * 
   * Enabled Check:
   * Returns empty array if GECKO_ENABLED=false (default)
   * 
   * @param {number} [pages=3] - Number of pages to fetch
   * @returns {Promise<TokenData[]>} Array of discovered tokens
   * 
   * @example
   * // Fetch 5 pages
   * const tokens = await service.collectTokens(5);
   * // Returns: ~250-500 tokens from pool assets
   * 
   * // Service disabled
   * GECKO_ENABLED=false
   * const tokens = await service.collectTokens();
   * // Returns: []
   */
  async collectTokens(pages: number = 3): Promise<TokenData[]> {
    if (!config.upstream.geckoTerminalEnabled) return [];

    const allTokens: TokenData[] = [];

    for (let p = 1; p <= pages; p++) {
      const cacheKey = `upstream:gecko:pools:${this.network}:page:${p}`;
      try {
        let pools = await cacheManager.get<any[]>(cacheKey);
        if (!pools) {
          const res = await dexscreenerLimiter.schedule(() => this.client.get(`/networks/${this.network}/pools?page=${p}`));
          pools = res.data?.data || [];
          await cacheManager.set(cacheKey, pools, config.cache.ttl);
        }

        if (Array.isArray(pools)) {
          for (const pool of pools) {
            try {
              // pool has assets, convert to TokenData-like objects
              const assets = pool?.attributes?.assets || pool?.assets || [];
              for (const a of assets) {
                if (!a?.address) continue;
                const token: TokenData = {
                  token_address: a.address,
                  token_name: a.name || a.symbol || 'Unknown',
                  token_ticker: a.symbol || 'TKN',
                  price_sol: 0,
                  market_cap_sol: 0,
                  volume_sol: 0,
                  liquidity_sol: 0,
                  transaction_count: 0,
                  price_1hr_change: 0,
                  last_updated: Date.now(),
                  protocol: pool?.attributes?.dex || pool?.protocol || 'geckoterminal',
                } as TokenData;

                allTokens.push(token);
              }
            } catch (e) {
              // ignore per-pool failures
            }
          }
        }
      } catch (e) {
        // skip page
      }
    }

    return allTokens;
  }
}

export const geckoTerminalService = new GeckoTerminalService();
export default geckoTerminalService;
