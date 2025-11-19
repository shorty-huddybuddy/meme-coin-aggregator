import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { cacheManager } from './cache.service';

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

  async solToUsd(solAmount: number): Promise<number> {
    if (!solAmount) return 0;
    const price = await this.getSolPriceUsd();
    return solAmount * price;
  }
}

export const coingeckoService = new CoinGeckoService();
export default coingeckoService;
