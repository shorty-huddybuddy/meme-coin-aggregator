import { useState, useEffect } from 'react';
import type { TokenData, WebSocketUpdate, FilterOptions, SortOptions } from '../types';
import { wsService } from '../services/websocket';
import { apiClient } from '../services/api';
import './TokenList.css';

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

    // Use environment variable or current origin for WebSocket
    const wsUrl = import.meta.env.VITE_API_URL || window.location.origin;
    wsService.connect(wsUrl, handleUpdate);

    // Load initial data from API (respects filters & sort)
    fetchTokens();

    return () => {
      wsService.disconnect();
    };
  }, []);

  // Auto-apply filters when they change
  useEffect(() => {
    applyFilters();
  }, [timePeriod, minVolumeInput, protocol, sortBy, sortOrder, pageSize]);

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
    <div className="token-list">
      <h1>🚀 Meme Coin Aggregator</h1>
      <p className="subtitle">Real-time token data from DexScreener & Jupiter</p>
      <div className="summary">
        <small>Showing {tokens.length} {totalCount ? `of ${totalCount}` : ''} tokens</small>
      </div>
      
      <div className="controls">
        <label>
          Time:
          <select value={timePeriod} onChange={(e) => setTimePeriod(e.target.value as any)}>
            <option value="1h">1h</option>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
          </select>
        </label>

        <label>
          Min Volume:
          <input
            type="text"
            placeholder="e.g. 1k, 2.5M"
            value={minVolumeInput}
            onChange={(e) => setMinVolumeInput(e.target.value)}
          />
        </label>

        <label>
          Protocol:
          <input type="text" placeholder="raydium" value={protocol ?? ''} onChange={(e) => setProtocol(e.target.value || undefined)} />
        </label>

        <label>
          Sort:
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="price">Price</option>
            <option value="market_cap">Market Cap</option>
            <option value="volume">Volume</option>
            <option value="liquidity">Liquidity</option>
            <option value="price_change">Change</option>
          </select>
        </label>

        <label>
          Order:
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)}>
            <option value="desc">↓</option>
            <option value="asc">↑</option>
          </select>
        </label>

        <label>
          Per Page:
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>

        <button onClick={applyFilters} className="apply-btn">Apply</button>
      </div>

      {loading ? (
        <div className="loading">Loading tokens...</div>
      ) : tokens.length === 0 ? (
        <div className="loading">No tokens match the filters.</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Price (SOL)</th>
                <th>Market Cap</th>
                <th>{volumeHeaderLabel}</th>
                <th>Liquidity</th>
                <th>{timePeriod === '1h' ? '1h Change' : timePeriod === '7d' ? '7d Change' : '24h Change'}</th>
                <th>Protocol</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => {
                const change = getDisplayedChange(token);
                return (
                  <tr
                    key={token.token_address}
                    className={updatedTokens.has(token.token_address) ? 'updated' : ''}
                  >
                    <td className="token-info">
                      <div className="token-name">{token.token_name}</div>
                      <div className="token-ticker">{token.token_ticker}</div>
                    </td>
                    <td className="price">{formatPrice(token.price_sol)}</td>
                    <td>{formatNumber(token.market_cap_sol)}</td>
                    <td>{formatNumber(getDisplayedVolume(token) || 0)}</td>
                    <td>{formatNumber(token.liquidity_sol)}</td>
                    <td className={change >= 0 ? 'positive' : 'negative'}>
                      {change >= 0 ? '+' : ''}
                      {change.toFixed(2)}%
                    </td>
                    <td className="protocol">{token.protocol}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination-controls">
        <button onClick={() => goToCursor(prevCursor)} disabled={!prevCursor || loading} className="pagination-btn">← Prev</button>
        <button onClick={() => goToCursor(nextCursor)} disabled={!nextCursor || loading} className="pagination-btn">Next →</button>
      </div>
    </div>
  );
}
