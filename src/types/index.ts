export interface TokenData {
  token_address: string;
  token_name: string;
  token_ticker: string;
  price_sol: number;
  price_usd?: number;
  market_cap_sol: number;
  market_cap_usd?: number;
  volume_sol: number;
  volume_usd?: number;
  volume_1h?: number;
  volume_24h?: number;
  volume_7d?: number;
  liquidity_sol: number;
  transaction_count: number;
  price_1hr_change: number;
  price_24hr_change?: number;
  price_7d_change?: number;
  protocol: string;
  last_updated: number;
  source?: string;
}

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd?: string;
  txns: {
    h1: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h1: number;
    h24: number;
  };
  priceChange: {
    h1: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
}

export interface JupiterToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
  daily_volume?: number;
}

export interface FilterOptions {
  timePeriod?: '1h' | '24h' | '7d';
  minVolume?: number;
  maxVolume?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
  protocol?: string;
}

export interface SortOptions {
  sortBy?: 'volume' | 'price_change' | 'market_cap' | 'liquidity' | 'transaction_count';
  sortOrder?: 'asc' | 'desc';
  timePeriod?: '1h' | '24h' | '7d';
}

export interface PaginationOptions {
  limit?: number;
  cursor?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: {
    limit: number;
    nextCursor?: string;
    prevCursor?: string;
    totalCount?: number;
  };
  error?: string;
}

export interface WebSocketMessage {
  event: 'price_update' | 'volume_spike' | 'new_token' | 'error';
  data: TokenData | TokenData[] | { message: string };
  timestamp: number;
}

export enum CacheKey {
  ALL_TOKENS = 'tokens:all',
  TOKEN_PREFIX = 'token:',
  SEARCH_PREFIX = 'search:',
}
