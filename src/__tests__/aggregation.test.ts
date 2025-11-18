import { AggregationService } from '../services/aggregation.service';
import { TokenData } from '../types';

describe('AggregationService', () => {
  let service: AggregationService;

  beforeEach(() => {
    service = new AggregationService();
  });

  describe('mergeTokens', () => {
    it('should merge duplicate tokens by address', () => {
      const tokens: TokenData[] = [
        {
          token_address: 'ABC123',
          token_name: 'Token A',
          token_ticker: 'TKA',
          price_sol: 1.5,
          market_cap_sol: 1000,
          volume_sol: 500,
          liquidity_sol: 200,
          transaction_count: 100,
          price_1hr_change: 5,
          protocol: 'Raydium',
          last_updated: Date.now(),
          source: 'dexscreener',
        },
        {
          token_address: 'ABC123',
          token_name: 'Token A',
          token_ticker: 'TKA',
          price_sol: 1.5,
          market_cap_sol: 1200,
          volume_sol: 600,
          liquidity_sol: 250,
          transaction_count: 120,
          price_1hr_change: 5,
          protocol: 'Raydium',
          last_updated: Date.now(),
          source: 'jupiter',
        },
      ];

      const merged = service.mergeTokens(tokens);

      expect(merged).toHaveLength(1);
      expect(merged[0].market_cap_sol).toBe(1200); // Should take max
      expect(merged[0].volume_sol).toBe(600); // Should take max
      expect(merged[0].source).toBe('dexscreener,jupiter');
    });

    it('should handle case-insensitive addresses', () => {
      const tokens: TokenData[] = [
        {
          token_address: 'abc123',
          token_name: 'Token A',
          token_ticker: 'TKA',
          price_sol: 1.5,
          market_cap_sol: 1000,
          volume_sol: 500,
          liquidity_sol: 200,
          transaction_count: 100,
          price_1hr_change: 5,
          protocol: 'Raydium',
          last_updated: Date.now(),
          source: 'dexscreener',
        },
        {
          token_address: 'ABC123',
          token_name: 'Token A',
          token_ticker: 'TKA',
          price_sol: 1.5,
          market_cap_sol: 1200,
          volume_sol: 600,
          liquidity_sol: 250,
          transaction_count: 120,
          price_1hr_change: 5,
          protocol: 'Raydium',
          last_updated: Date.now(),
          source: 'jupiter',
        },
      ];

      const merged = service.mergeTokens(tokens);
      expect(merged).toHaveLength(1);
    });

    it('should keep separate tokens with different addresses', () => {
      const tokens: TokenData[] = [
        {
          token_address: 'ABC123',
          token_name: 'Token A',
          token_ticker: 'TKA',
          price_sol: 1.5,
          market_cap_sol: 1000,
          volume_sol: 500,
          liquidity_sol: 200,
          transaction_count: 100,
          price_1hr_change: 5,
          protocol: 'Raydium',
          last_updated: Date.now(),
          source: 'dexscreener',
        },
        {
          token_address: 'XYZ789',
          token_name: 'Token B',
          token_ticker: 'TKB',
          price_sol: 2.0,
          market_cap_sol: 2000,
          volume_sol: 800,
          liquidity_sol: 300,
          transaction_count: 150,
          price_1hr_change: 10,
          protocol: 'Orca',
          last_updated: Date.now(),
          source: 'dexscreener',
        },
      ];

      const merged = service.mergeTokens(tokens);
      expect(merged).toHaveLength(2);
    });
  });

  describe('filterTokens', () => {
    const sampleTokens: TokenData[] = [
      {
        token_address: 'ABC123',
        token_name: 'Token A',
        token_ticker: 'TKA',
        price_sol: 1.5,
        market_cap_sol: 1000,
        volume_sol: 500,
        liquidity_sol: 200,
        transaction_count: 100,
        price_1hr_change: 5,
        protocol: 'Raydium',
        last_updated: Date.now(),
        source: 'dexscreener',
      },
      {
        token_address: 'XYZ789',
        token_name: 'Token B',
        token_ticker: 'TKB',
        price_sol: 2.0,
        market_cap_sol: 2000,
        volume_sol: 1500,
        liquidity_sol: 300,
        transaction_count: 150,
        price_1hr_change: 10,
        protocol: 'Orca',
        last_updated: Date.now(),
        source: 'dexscreener',
      },
    ];

    it('should filter by minimum volume', () => {
      const filtered = service.filterTokens(sampleTokens, { minVolume: 1000 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].token_address).toBe('XYZ789');
    });

    it('should filter by maximum volume', () => {
      const filtered = service.filterTokens(sampleTokens, { maxVolume: 1000 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].token_address).toBe('ABC123');
    });

    it('should filter by protocol', () => {
      const filtered = service.filterTokens(sampleTokens, { protocol: 'Raydium' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].protocol).toBe('Raydium');
    });

    it('should filter by market cap range', () => {
      const filtered = service.filterTokens(sampleTokens, { 
        minMarketCap: 1500, 
        maxMarketCap: 2500 
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].token_address).toBe('XYZ789');
    });
  });

  describe('sortTokens', () => {
    const sampleTokens: TokenData[] = [
      {
        token_address: 'ABC123',
        token_name: 'Token A',
        token_ticker: 'TKA',
        price_sol: 1.5,
        market_cap_sol: 1000,
        volume_sol: 500,
        liquidity_sol: 200,
        transaction_count: 100,
        price_1hr_change: 5,
        protocol: 'Raydium',
        last_updated: Date.now(),
        source: 'dexscreener',
      },
      {
        token_address: 'XYZ789',
        token_name: 'Token B',
        token_ticker: 'TKB',
        price_sol: 2.0,
        market_cap_sol: 2000,
        volume_sol: 1500,
        liquidity_sol: 300,
        transaction_count: 150,
        price_1hr_change: 10,
        protocol: 'Orca',
        last_updated: Date.now(),
        source: 'dexscreener',
      },
    ];

    it('should sort by volume descending', () => {
      const sorted = service.sortTokens(sampleTokens, { sortBy: 'volume', sortOrder: 'desc' });
      expect(sorted[0].token_address).toBe('XYZ789');
      expect(sorted[1].token_address).toBe('ABC123');
    });

    it('should sort by volume ascending', () => {
      const sorted = service.sortTokens(sampleTokens, { sortBy: 'volume', sortOrder: 'asc' });
      expect(sorted[0].token_address).toBe('ABC123');
      expect(sorted[1].token_address).toBe('XYZ789');
    });

    it('should sort by market cap', () => {
      const sorted = service.sortTokens(sampleTokens, { sortBy: 'market_cap', sortOrder: 'desc' });
      expect(sorted[0].market_cap_sol).toBe(2000);
      expect(sorted[1].market_cap_sol).toBe(1000);
    });

    it('should sort by price change', () => {
      const sorted = service.sortTokens(sampleTokens, { sortBy: 'price_change', sortOrder: 'desc' });
      expect(sorted[0].price_1hr_change).toBe(10);
      expect(sorted[1].price_1hr_change).toBe(5);
    });
  });
});
