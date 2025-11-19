import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { cacheManager } from './cache.service';
import { dexscreenerLimiter } from './upstreamClients';
import { TokenData } from '../types';

// Simple GeckoTerminal collector (optional)
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

  // Fetch trending pools (if endpoint available) and paginate pools pages
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
