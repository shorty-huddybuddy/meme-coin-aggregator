export interface TokenData {
  token_address: string;
  token_name: string;
  token_ticker: string;
  price_sol: number;
  market_cap_sol: number;
  volume_sol: number;
  volume_1h?: number;
  volume_7d?: number;
  volume_24h?: number;
  liquidity_sol: number;
  transaction_count: number;
  price_1hr_change: number;
  price_24hr_change: number;
  price_7d_change?: number;
  protocol: string;
  last_updated: number;
  source: string;
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
  sortBy?: 'price' | 'market_cap' | 'volume' | 'liquidity' | 'transactions' | 'price_change';
  sortOrder?: 'asc' | 'desc';
  timePeriod?: '1h' | '24h' | '7d';
}

export interface WebSocketUpdate {
  type: 'initial_data' | 'price_update' | 'volume_spike';
  tokens?: TokenData[];
  updates?: TokenData[];
  spikes?: TokenData[];
}
