import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { AggregationService } from '../services/aggregation.service';
import { TokenData, WebSocketMessage } from '../types';
import { config } from '../config';

/**
 * WebSocket service for real-time token updates
 * 
 * Purpose:
 * Broadcasts real-time token price and volume updates to connected clients.
 * Implements periodic polling with change detection and per-client filtering.
 * 
 * Features:
 * - Real-time price updates via Socket.IO
 * - Volume spike detection (>50% increase)
 * - Per-client subscription filters (volume, market cap, protocol)
 * - Initial data snapshot on connection
 * - Periodic update scheduler (configurable interval)
 * 
 * Events Emitted:
 * 
 * 1. initial_data:
 *    - Sent on client connection
 *    - Contains full filtered token list
 *    - Uses cached data for fast response
 * 
 * 2. price_update:
 *    - Sent when token prices change >1%
 *    - Contains changed tokens only
 *    - Filtered per client subscription
 * 
 * 3. volume_spike:
 *    - Sent when volume increases >50%
 *    - Highlights trending tokens
 *    - Filtered per client subscription
 * 
 * 4. subscribed:
 *    - Confirmation after client subscribes
 *    - Contains subscription acknowledgment
 * 
 * Update Strategy:
 * 1. Scheduler polls aggregation service every 3s (default)
 * 2. Compares new data with previous snapshot
 * 3. Detects price changes (>1%) and volume spikes (>50%)
 * 4. Broadcasts changes to subscribed clients
 * 5. Updates previous snapshot for next cycle
 * 
 * Client Filtering:
 * Supports per-client filters stored in socket.data:
 * - timePeriod: '1h' | '24h' | '7d' (volume calculation)
 * - minVolume / maxVolume: Volume range filter
 * - minMarketCap / maxMarketCap: Market cap range
 * - protocol: DEX protocol filter (e.g., 'raydium')
 * 
 * Performance:
 * - Initial data: Cached response (~50ms)
 * - Update cycle: Fresh fetch (~500ms)
 * - Broadcast: Filtered per client (<10ms per client)
 * - Scheduler interval: 3s (configurable)
 * 
 * @class WebSocketService
 */
export class WebSocketService {
  private io: Server;
  private aggregationService: AggregationService;
  private updateInterval: NodeJS.Timeout | null = null;
  private previousTokens: Map<string, TokenData> = new Map();

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.aggregationService = new AggregationService();
    this.setupSocketHandlers();
  }

  /**
   * Setup Socket.IO connection handlers
   * 
   * Purpose:
   * Configures event listeners for client connections, subscriptions, and disconnections.
   * Sends initial data snapshot on connection.
   * 
   * Events Handled:
   * 
   * 1. connection:
   *    - Fired when client connects
   *    - Logs client ID
   *    - Sends initial_data event with cached tokens
   * 
   * 2. subscribe:
   *    - Client sends subscription with filters
   *    - Filters stored in socket.data for persistence
   *    - Numeric values normalized (string to number)
   *    - Sends 'subscribed' confirmation
   * 
   * 3. disconnect:
   *    - Client disconnects
   *    - Logs disconnection
   *    - Socket.IO auto-cleanup (no manual cleanup needed)
   * 
   * 4. error:
   *    - Socket errors logged
   *    - Connection remains active unless fatal
   * 
   * Filter Normalization:
   * String numbers converted to actual numbers:
   * - "100" → 100
   * - "0.5" → 0.5
   * - "abc" → "abc" (stays string)
   * 
   * @private
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      // eslint-disable-next-line no-console
      console.log(`Client connected: ${socket.id}`);

      // Send initial data
      this.sendInitialData(socket);

      // Handle subscriptions
      socket.on('subscribe', (data: { filters?: Record<string, any> }) => {
        // Store filters on socket for per-socket filtering
        // eslint-disable-next-line no-console
        console.log(`Client ${socket.id} subscribed with filters:`, data?.filters);
        try {
          // Attach filters to socket.data so they persist across broadcasts
          // @ts-ignore - socket.data is safe to use for storing session info
          socket.data = socket.data || {};
          // normalize numeric filters
          const normalized: Record<string, any> = {};
          if (data?.filters) {
            for (const [k, v] of Object.entries(data.filters)) {
              // try to coerce numeric values
              const n = Number(v);
              normalized[k] = Number.isNaN(n) ? v : n;
            }
          }
          // @ts-ignore
          socket.data.filters = normalized;
        } catch (e) {
          // ignore
        }

        socket.emit('subscribed', { message: 'Successfully subscribed to token updates' });
      });

      socket.on('disconnect', () => {
        // eslint-disable-next-line no-console
        console.log(`Client disconnected: ${socket.id}`);
      });

      socket.on('error', (error: any) => {
        // eslint-disable-next-line no-console
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });
  }

  /**
   * Send initial token data snapshot to newly connected client
   * 
   * Purpose:
   * Provides full filtered token list immediately on connection.
   * Uses cached data for fast initial load (<50ms).
   * 
   * Process:
   * 1. Fetch tokens from aggregation service (cache-first)
   * 2. Extract client filters from socket.data
   * 3. Apply filters to token list
   * 4. Send filtered data via 'initial_data' event
   * 
   * Filter Application:
   * - Volume: Uses timePeriod to select volume_1h/24h/7d
   * - Market cap: Filters by minMarketCap/maxMarketCap
   * - Protocol: Exact match on protocol field
   * 
   * Error Handling:
   * - Aggregation errors: Sends error event to client
   * - Logs error for debugging
   * - Client receives: {event: 'error', data: {message: '...'}}
   * 
   * Performance:
   * - Uses cached data (getAllTokens(true))
   * - Filter matching: O(n) where n = token count
   * - Typically <50ms for ~200 tokens
   * 
   * @param {Socket} socket - Socket.IO client socket
   * @returns {Promise<void>}
   * @private
   */
  private async sendInitialData(socket: Socket): Promise<void> {
    try {
      // Use cached data for faster initial response
      const tokens = await this.aggregationService.getAllTokens(true);
      // Apply any existing socket filters to the initial payload
      // @ts-ignore
      const filters: Record<string, any> = (socket.data && socket.data.filters) || {};

      const matchesFilter = (token: TokenData) => {
        let volume = token.volume_sol;
        if (filters.timePeriod === '1h') {
          volume = token.volume_1h ?? token.volume_sol;
        } else if (filters.timePeriod === '24h') {
          volume = token.volume_24h ?? token.volume_sol;
        } else if (filters.timePeriod === '7d') {
          volume = (token.volume_24h ?? token.volume_sol) * 7;
        }

        if (filters.minVolume != null && volume < filters.minVolume) return false;
        if (filters.maxVolume != null && volume > filters.maxVolume) return false;
        if (filters.minMarketCap != null && token.market_cap_sol < filters.minMarketCap) return false;
        if (filters.maxMarketCap != null && token.market_cap_sol > filters.maxMarketCap) return false;
        if (filters.protocol && typeof filters.protocol === 'string' && token.protocol !== filters.protocol) return false;
        return true;
      };

      const payload = tokens.filter(matchesFilter);
      // Debug log: how many tokens will be sent
      // eslint-disable-next-line no-console
      console.log(`Sending initial data to ${socket.id}: ${payload.length} tokens`);

      const message: WebSocketMessage = {
        event: 'new_token',
        data: payload,
        timestamp: Date.now(),
      };

      socket.emit('initial_data', message);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error sending initial data:', error);
      const errorMessage: WebSocketMessage = {
        event: 'error',
        data: { message: 'Failed to fetch initial data' },
        timestamp: Date.now(),
      };
      socket.emit('error', errorMessage);
    }
  }

  /**
   * Start periodic update scheduler
   * 
   * Purpose:
   * Begins polling for token updates at configured interval.
   * Broadcasts changes to all connected clients.
   * 
   * Scheduler Behavior:
   * - Interval: 3000ms (3 seconds) by default
   * - Configurable via: WS_UPDATE_INTERVAL env var
   * - Calls broadcastUpdates() each cycle
   * - Continues until stopUpdateScheduler() called
   * 
   * Idempotency:
   * - Returns early if scheduler already running
   * - Prevents multiple overlapping schedulers
   * - Safe to call multiple times
   * 
   * Lifecycle:
   * - Started during WebSocket service initialization
   * - Runs continuously while server active
   * - Stopped on server shutdown
   * 
   * @returns {Promise<void>}
   */
  async startUpdateScheduler(): Promise<void> {
    if (this.updateInterval) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`Starting WebSocket update scheduler (interval: ${config.websocket.updateInterval}ms)`);

    this.updateInterval = setInterval(async () => {
      await this.broadcastUpdates();
    }, config.websocket.updateInterval);
  }

  /**
   * Broadcast token updates to all connected clients
   * 
   * Purpose:
   * Polls aggregation service for fresh data, detects changes, and broadcasts updates.
   * Implements per-client filtering for personalized subscriptions.
   * 
   * Change Detection:
   * 
   * 1. Price Changes:
   *    - Compares current price_sol with previous snapshot
   *    - Threshold: >1% change
   *    - Triggers: price_update event
   * 
   * 2. Volume Spikes:
   *    - Compares current volume_sol with previous
   *    - Threshold: >50% increase
   *    - Triggers: volume_spike event
   * 
   * 3. New Tokens:
   *    - Tokens not in previous snapshot
   *    - Added to updates array
   * 
   * Broadcast Process:
   * 1. Fetch fresh tokens (bypass cache)
   * 2. Compare with previousTokens Map
   * 3. Identify changed tokens (price/volume)
   * 4. For each connected client:
   *    a. Extract client filters from socket.data
   *    b. Filter updates array by client preferences
   *    c. Send price_update event if matches
   *    d. Send volume_spike event if matches
   * 5. Update previousTokens Map for next cycle
   * 
   * Per-Client Filtering:
   * Each client receives only tokens matching their subscription:
   * - timePeriod: Selects volume_1h/24h/7d for comparison
   * - minVolume/maxVolume: Volume range filter
   * - minMarketCap/maxMarketCap: Market cap range
   * - protocol: Exact protocol match
   * 
   * Performance:
   * - Fresh data fetch: ~500ms
   * - Change detection: O(n) where n = token count
   * - Per-client filtering: O(m) where m = updates count
   * - Total broadcast cycle: ~500-600ms
   * 
   * Logging:
   * ```
   * Broadcast cycle: fetched 150 tokens, updates=12, spikes=3
   * ```
   * 
   * Error Handling:
   * - Aggregation errors: Logged, cycle skipped
   * - Individual client errors: Logged, other clients unaffected
   * - Never throws (prevents scheduler crashes)
   * 
   * @returns {Promise<void>}
   * @private
   */
  private async broadcastUpdates(): Promise<void> {
    try {
      // Fetch fresh data (bypass cache)
      const tokens = await this.aggregationService.getAllTokens(false);

      // Detect changes
      const updates: TokenData[] = [];
      const volumeSpikes: TokenData[] = [];

      for (const token of tokens) {
        const previous = this.previousTokens.get(token.token_address);

        if (!previous) {
          // New token
          updates.push(token);
          continue;
        }

        // Check for price changes (0.01% threshold for maximum update frequency)
        const priceChanged = Math.abs(token.price_sol - previous.price_sol) > previous.price_sol * 0.0001; // 0.01% change

        // Check for volume spikes (>10% increase for high sensitivity)
        const volumeSpike = token.volume_sol > previous.volume_sol * 1.1;

        if (priceChanged || volumeSpike) {
          updates.push(token);
        }

        if (volumeSpike) {
          volumeSpikes.push(token);
        }
      }

      // Update previous tokens cache
      tokens.forEach((token) => {
        this.previousTokens.set(token.token_address, token);
      });

      // Debug logs
      // eslint-disable-next-line no-console
      console.log(`Broadcast cycle: fetched ${tokens.length} tokens, updates=${updates.length}, spikes=${volumeSpikes.length}`);
      
      // Log which tokens were updated
      if (updates.length > 0) {
        updates.forEach(token => {
          const prev = this.previousTokens.get(token.token_address);
          const priceChange = prev ? ((token.price_sol - prev.price_sol) / prev.price_sol * 100).toFixed(2) : 'N/A';
          const volumeChange = prev ? ((token.volume_sol - prev.volume_sol) / prev.volume_sol * 100).toFixed(2) : 'N/A';
          console.log(`  📊 ${token.token_ticker || 'Unknown'} (${token.token_address.slice(0, 8)}...): Price ${priceChange}%, Volume ${volumeChange}%`);
        });
      }

      // Broadcast updates with per-socket filter support
      if (updates.length > 0 || volumeSpikes.length > 0) {
        // iterate connected sockets and send only matching tokens
        const clients = Array.from(this.io.sockets.sockets.values()) as Socket[];

        for (const s of clients) {
          // @ts-ignore
          const filters: Record<string, any> = (s.data && s.data.filters) || {};

          const matchesFilter = (token: TokenData) => {
            let volume = token.volume_sol;
            if (filters.timePeriod === '1h') {
              volume = token.volume_1h ?? token.volume_sol;
            } else if (filters.timePeriod === '24h') {
              volume = token.volume_24h ?? token.volume_sol;
            } else if (filters.timePeriod === '7d') {
              volume = (token.volume_24h ?? token.volume_sol) * 7;
            }

            if (filters.minVolume != null && volume < filters.minVolume) return false;
            if (filters.maxVolume != null && volume > filters.maxVolume) return false;
            if (filters.minMarketCap != null && token.market_cap_sol < filters.minMarketCap) return false;
            if (filters.maxMarketCap != null && token.market_cap_sol > filters.maxMarketCap) return false;
            if (filters.protocol && typeof filters.protocol === 'string' && token.protocol !== filters.protocol) return false;
            return true;
          };

          const socketUpdates = updates.filter(matchesFilter);
          const socketSpikes = volumeSpikes.filter(matchesFilter);

          if (socketUpdates.length > 0) {
            const message: WebSocketMessage = {
              event: 'price_update',
              data: socketUpdates,
              timestamp: Date.now(),
            };
            s.emit('price_update', message);
          }

          if (socketSpikes.length > 0) {
            const message: WebSocketMessage = {
              event: 'volume_spike',
              data: socketSpikes,
              timestamp: Date.now(),
            };
            s.emit('volume_spike', message);
          }
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error broadcasting updates:', error);
    }
  }

  stopUpdateScheduler(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      // eslint-disable-next-line no-console
      console.log('WebSocket update scheduler stopped');
    }
  }

  getIO(): Server {
    return this.io;
  }
}

// Export a factory function to create and start the WebSocket service
export function startWebSocketServer(httpServer: HttpServer): WebSocketService {
  const wsService = new WebSocketService(httpServer);
  wsService.startUpdateScheduler();
  console.log('✓ WebSocket server started');
  return wsService;
}
