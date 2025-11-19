import { useState, useEffect } from 'react';
import type { TokenData, WebSocketUpdate, FilterOptions, SortOptions } from '../types';
import { wsService } from '../services/websocket';
import { apiClient } from '../services/api';

export function TokenList() {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [updatedTokens, setUpdatedTokens] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [prevCursor, setPrevCursor] = useState<string | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  // Filters & sorting (local UI state)
  const [timePeriod, setTimePeriod] = useState<FilterOptions['timePeriod']>('24h');
  // Keep raw input as string to support suffixes like 1k, 2.5M, 1b
  const [minVolumeInput, setMinVolumeInput] = useState<string>('');
  const [protocol, setProtocol] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SortOptions['sortBy']>('volume');
  const [sortOrder, setSortOrder] = useState<SortOptions['sortOrder']>('desc');
  const [pageSize, setPageSize] = useState<number>(30);

  useEffect(() => {
    const handleUpdate = (update: WebSocketUpdate) => {
      if (update.type === 'initial_data' && update.tokens) {
        setTokens(update.tokens);
      } else if (update.type === 'price_update' && update.updates) {
        // Merge updates into existing tokens
        setTokens((prev) => {
          const tokenMap = new Map(prev.map((t) => [t.token_address, t]));
          update.updates!.forEach((u) => tokenMap.set(u.token_address, u));
          return Array.from(tokenMap.values());
        });

        // Track which tokens were updated for visual feedback
        const updated = new Set(update.updates.map((u) => u.token_address));
        setUpdatedTokens(updated);
        setTimeout(() => setUpdatedTokens(new Set()), 2000);
      } else if (update.type === 'volume_spike' && update.spikes) {
        console.log('Volume spikes detected:', update.spikes.length);
      }
    };

    wsService.connect('http://localhost:3000', handleUpdate);

    // Load initial data from API (respects filters & sort)
    fetchTokens();

    return () => {
      wsService.disconnect();
    };
  }, []);

  async function fetchTokens(cursor?: string) {
    setLoading(true);
    try {
      function parseVolumeInput(input: string): number | undefined {
        if (!input) return undefined;
        const s = input.trim().toLowerCase().replace(/,/g, '');
        const match = s.match(/^([\d.]+)\s*([kmb])?$/);
        if (!match) {
          const asNum = Number(s);
          return Number.isFinite(asNum) ? asNum : undefined;
        }
        let num = Number(match[1]);
        const suffix = match[2];
        if (isNaN(num)) return undefined;
        if (suffix === 'k') num *= 1e3;
        else if (suffix === 'm') num *= 1e6;
        else if (suffix === 'b') num *= 1e9;
        return num;
      }

      const parsedMin = parseVolumeInput(minVolumeInput);
      const filters: FilterOptions = { timePeriod, protocol } as FilterOptions;
      if (parsedMin !== undefined) filters.minVolume = parsedMin;
      const sort: SortOptions = { sortBy, sortOrder, timePeriod };
      const res = await apiClient.getTokens(filters, sort, pageSize, cursor);
      setTokens(res.data || []);
      setNextCursor(res.pagination?.nextCursor);
      setPrevCursor(res.pagination?.prevCursor);
      setTotalCount(res.pagination?.totalCount);
      // Update websocket subscription filters so server-side broadcasts are narrowed
      wsService.updateFilters(filters);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch tokens', e);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    // reset cursor when applying new filters
    setNextCursor(undefined);
    setPrevCursor(undefined);
    fetchTokens(undefined);
  }

  // Cursor navigation: go to given cursor (prev/next)
  async function goToCursor(cursor?: string) {
    // simply fetchTokens with provided cursor; it will replace the page
    await fetchTokens(cursor);
  }

  const formatNumber = (num: number): string => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const formatPrice = (price: number): string => {
    if (price < 0.0001) return price.toExponential(2);
    return price.toFixed(6);
  };

  function getDisplayedVolume(token: TokenData) {
    if (timePeriod === '1h') return token.volume_1h ?? token.volume_sol;
    if (timePeriod === '7d') return token.volume_7d ?? ((token.volume_24h ?? token.volume_sol) * 7);
    // default 24h
    return token.volume_24h ?? token.volume_sol;
  }

  function getDisplayedChange(token: TokenData) {
    if (timePeriod === '1h') return token.price_1hr_change ?? 0;
    if (timePeriod === '7d') return token.price_7d_change ?? token.price_24hr_change ?? token.price_1hr_change ?? 0;
    // default 24h
    return token.price_24hr_change ?? token.price_1hr_change ?? 0;
  }

  const volumeHeaderLabel = timePeriod === '1h' ? 'Volume (1h)' : timePeriod === '7d' ? 'Volume (7d)' : 'Volume (24h)';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Header */}
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-2 drop-shadow-lg">
          🚀 Meme Coin Aggregator
        </h1>
        <p className="text-white/90 text-sm sm:text-base">
          Real-time token data from DexScreener & Jupiter
        </p>
        <p className="text-white/70 text-xs sm:text-sm mt-2">
          Showing {tokens.length} {totalCount ? `of ${totalCount}` : ''} tokens
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg p-4 sm:p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time Period
            </label>
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="1h">1 Hour</option>
              <option value="24h">24 Hours</option>
              <option value="7d">7 Days</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Volume (SOL)
            </label>
            <input
              type="text"
              placeholder="e.g. 1, 1k, 2.5M"
              value={minVolumeInput}
              onChange={(e) => setMinVolumeInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Protocol
            </label>
            <input
              type="text"
              placeholder="raydium"
              value={protocol ?? ''}
              onChange={(e) => setProtocol(e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sort By
            </label>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="price">Price</option>
                <option value="market_cap">Market Cap</option>
                <option value="volume">Volume</option>
                <option value="liquidity">Liquidity</option>
                <option value="transactions">Transactions</option>
                <option value="price_change">Change</option>
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="w-20 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="desc">↓</option>
                <option value="asc">↑</option>
              </select>
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Per Page
            </label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value={10}>10</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-3 flex items-end">
            <button
              onClick={applyFilters}
              className="w-full px-6 py-2 bg-gradient-to-r from-primary to-secondary text-white font-medium rounded-lg hover:opacity-90 transition-opacity shadow-md"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
          <p className="text-white mt-4 text-lg">Loading tokens...</p>
        </div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-16 text-white text-lg">
          No tokens match the filters.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block bg-white/95 backdrop-blur rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-primary to-secondary text-white">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">Token</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">Price (SOL)</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">Market Cap</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">{volumeHeaderLabel}</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">Liquidity</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">
                      {timePeriod === '1h' ? '1h Change' : timePeriod === '7d' ? '7d Change' : '24h Change'}
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">Protocol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tokens.map((token) => {
                    const change = getDisplayedChange(token);
                    return (
                      <tr
                        key={token.token_address}
                        className={`hover:bg-purple-50 transition-colors ${
                          updatedTokens.has(token.token_address) ? 'bg-green-100 animate-pulse' : ''
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">{token.token_name}</div>
                          <div className="text-sm text-gray-500">{token.token_ticker}</div>
                        </td>
                        <td className="px-6 py-4 font-mono text-sm">{formatPrice(token.price_sol)}</td>
                        <td className="px-6 py-4">{formatNumber(token.market_cap_sol)}</td>
                        <td className="px-6 py-4">{formatNumber(getDisplayedVolume(token) || 0)}</td>
                        <td className="px-6 py-4">{formatNumber(token.liquidity_sol)}</td>
                        <td className={`px-6 py-4 font-semibold ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {change >= 0 ? '+' : ''}
                          {change.toFixed(2)}%
                        </td>
                        <td className="px-6 py-4 capitalize text-primary font-medium">{token.protocol}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-4">
            {tokens.map((token) => {
              const change = getDisplayedChange(token);
              return (
                <div
                  key={token.token_address}
                  className={`bg-white/95 backdrop-blur rounded-xl shadow-lg p-4 ${
                    updatedTokens.has(token.token_address) ? 'ring-2 ring-green-500 animate-pulse' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">{token.token_name}</h3>
                      <p className="text-sm text-gray-500">{token.token_ticker}</p>
                    </div>
                    <div className={`text-right font-semibold text-lg ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {change >= 0 ? '+' : ''}
                      {change.toFixed(2)}%
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs mb-1">Price (SOL)</p>
                      <p className="font-mono font-medium">{formatPrice(token.price_sol)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-1">Market Cap</p>
                      <p className="font-medium">{formatNumber(token.market_cap_sol)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-1">{volumeHeaderLabel}</p>
                      <p className="font-medium">{formatNumber(getDisplayedVolume(token) || 0)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-1">Liquidity</p>
                      <p className="font-medium">{formatNumber(token.liquidity_sol)}</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <span className="text-xs text-gray-500">Protocol: </span>
                    <span className="text-xs font-medium text-primary capitalize">{token.protocol}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex justify-center gap-4 mt-6">
            <button
              onClick={() => goToCursor(prevCursor)}
              disabled={!prevCursor || loading}
              className="px-6 py-2 bg-white/90 text-primary font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition-colors shadow-md"
            >
              ← Previous
            </button>
            <button
              onClick={() => goToCursor(nextCursor)}
              disabled={!nextCursor || loading}
              className="px-6 py-2 bg-white/90 text-primary font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition-colors shadow-md"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
