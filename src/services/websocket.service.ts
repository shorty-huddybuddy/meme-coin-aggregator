import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { AggregationService } from '../services/aggregation.service';
import { TokenData, WebSocketMessage } from '../types';
import { config } from '../config';

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

        // Check for price changes
        const priceChanged = Math.abs(token.price_sol - previous.price_sol) > previous.price_sol * 0.01; // 1% change

        // Check for volume spikes (>50% increase)
        const volumeSpike = token.volume_sol > previous.volume_sol * 1.5;

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
