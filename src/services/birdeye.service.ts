import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { cacheManager } from './cache.service';
import { birdeyeLimiter } from './upstreamClients';
import { TokenData } from '../types';
import { exponentialBackoff } from '../utils/helpers';

/**
 * Birdeye API integration service (Solana)
 *
 * Purpose:
 * - Free-tier friendly token discovery and pricing data to complement DexScreener.
 * - Focused on Solana memecoins and liquid pairs.
 *
 * Endpoints used:
 * - GET /defi/tokenlist?chain=solana&sort_by=volume_24h&sort_type=desc&offset=0&limit=200
 *   Provides token list with price, volume, and liquidity stats.
 *
 * Caching:
 * - Cache key: `upstream:birdeye:tokenlist:{offset}:{limit}`
 * - TTL: config.cache.ttl * 2 (default 30s)
 *
 * Rate limiting:
 * - Managed by birdeyeLimiter (token bucket + concurrency guard)
 */
export class BirdeyeService {
  private client: AxiosInstance;
  private readonly chain = 'solana';

  constructor() {
    this.client = axios.create({
      baseURL: config.api.birdeye,
      timeout: 10000,
      headers: {
        Accept: 'application/json',
        'X-API-KEY': config.api.birdeyeApiKey || '',
      },
    });
  }

  /**
   * Fetch high-volume tokens from Birdeye
  * @param limit - max tokens to fetch (default 120 to ease rate limits)
   * @param offset - pagination offset (default 0)
   */
  async getTrendingTokens(limit = 120, offset = 0): Promise<TokenData[]> {
    if (!config.upstream.birdeyeEnabled) return [];
    if (!config.api.birdeyeApiKey) {
      console.warn('Birdeye disabled: missing BIRDEYE_API_KEY');
      return [];
    }

    const cacheKey = `upstream:birdeye:tokenlist:${offset}:${limit}`;
    const cached = await cacheManager.get<TokenData[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await exponentialBackoff(() =>
        birdeyeLimiter.schedule(() =>
          this.client.get('/defi/tokenlist', {
            params: {
              chain: this.chain,
              sort_by: 'volume_24h',
              sort_type: 'desc',
              offset,
              limit,
            },
          })
        )
      , 3, 1000, 8000);

      const tokens = this.transform(response.data?.data?.tokens || response.data?.data || []);
      await cacheManager.set(cacheKey, tokens, config.cache.ttl * 2);
      return tokens;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        console.warn('Birdeye tokenlist rate-limited (429). Cooling down.');
        // Cooldown cache to avoid hammering: store empty for 30s
        await cacheManager.set(cacheKey, [], 30);
      } else {
        console.warn('Birdeye tokenlist failed', err?.message || err);
      }
      return [];
    }
  }

  private transform(items: any[]): TokenData[] {
    const now = Date.now();
    return items
      .map((t) => {
        const price = safeNumber(t.price || t.priceUsd || t.price_usd);
        const volume24h = safeNumber(t.volume24h || t.volume_24h);
        const volume1h = safeNumber(t.volume1h || t.volume_1h);
        const liquidity = safeNumber(t.liquidity || t.liquidityUsd || t.liquidity_usd);
        const marketCap = safeNumber(t.mc || t.market_cap || t.marketCap);

        const token: TokenData = {
          token_address: t.address || t.mint || '',
          token_name: t.name || t.symbol || 'Unknown',
          token_ticker: t.symbol || 'TKN',
          price_sol: price, // Birdeye returns SOL price when chain=solana
          market_cap_sol: marketCap,
          volume_sol: volume24h || volume1h,
          volume_1h: volume1h,
          volume_24h: volume24h,
          liquidity_sol: liquidity,
          transaction_count: safeNumber(t.txCount || t.tx_count || t.tx_24h),
          price_1hr_change: safeNumber(t.priceChange1h || t.price_change_1h),
          price_24hr_change: safeNumber(t.priceChange24h || t.price_change_24h),
          last_updated: now,
          protocol: t.dex || t.platform || 'birdeye',
          source: 'birdeye',
        };
        return token;
      })
      .filter((t) => !!t.token_address);
  }
}

function safeNumber(val: any): number {
  const n = typeof val === 'string' ? parseFloat(val) : Number(val);
  return Number.isFinite(n) ? n : 0;
}

export const birdeyeService = new BirdeyeService();
export default birdeyeService;
