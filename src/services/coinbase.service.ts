import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { coinbaseLimiter } from './upstreamClients';
import { cacheManager } from './cache.service';
import { exponentialBackoff } from '../utils/helpers';

/**
 * Coinbase spot price service (public, no key required)
 *
 * Fetches spot prices for fiat pairs like {SYMBOL}-USD using Coinbase public API.
 * Not all tokens are listed on Coinbase; use as a supplemental price source.
 */
export class CoinbaseService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.api.coinbase,
      timeout: 8000,
      headers: {
        Accept: 'application/json',
      },
    });
  }

  /**
   * Get spot price for a pair (e.g., DOGE-USD)
   * @param pair e.g., "DOGE-USD", "SOL-USD"
   */
  async getSpotPrice(pair: string): Promise<number | null> {
    if (!config.upstream.coinbaseEnabled) return null;
    if (!pair || typeof pair !== 'string') return null;

    const cacheKey = `upstream:coinbase:spot:${pair.toUpperCase()}`;
    const cached = await cacheManager.get<number>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;

    try {
      const response = await exponentialBackoff(() =>
        coinbaseLimiter.schedule(() => this.client.get(`/prices/${encodeURIComponent(pair)}/spot`))
      , 3, 800, 6000);

      const amount = response?.data?.data?.amount;
      const price = amount ? Number(amount) : NaN;
      if (!Number.isFinite(price)) return null;

      // cache for a short time (60s default if CACHE_TTL present)
      await cacheManager.set(cacheKey, price, config.cache.ttl * 2);
      return price;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        console.warn('Coinbase spot price rate-limited (429). Cooling down.');
        await cacheManager.set(cacheKey, null, 30);
      } else {
        console.warn(`Coinbase spot price failed for ${pair}`, err?.message || err);
      }
      return null;
    }
  }
}

export const coinbaseService = new CoinbaseService();
export default coinbaseService;
