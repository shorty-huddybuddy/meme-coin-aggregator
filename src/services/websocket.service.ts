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
      socket.on('subscribe', (data: { filters?: unknown }) => {
        // eslint-disable-next-line no-console
        console.log(`Client ${socket.id} subscribed with filters:`, data.filters);
        socket.emit('subscribed', { message: 'Successfully subscribed to token updates' });
      });

      socket.on('disconnect', () => {
        // eslint-disable-next-line no-console
        console.log(`Client disconnected: ${socket.id}`);
      });

      socket.on('error', (error) => {
        // eslint-disable-next-line no-console
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });
  }

  private async sendInitialData(socket: Socket): Promise<void> {
    try {
      const tokens = await this.aggregationService.getAllTokens();
      const message: WebSocketMessage = {
        event: 'new_token',
        data: tokens,
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

      // Update cache
      tokens.forEach((token) => {
        this.previousTokens.set(token.token_address, token);
      });

      // Broadcast updates
      if (updates.length > 0) {
        const message: WebSocketMessage = {
          event: 'price_update',
          data: updates,
          timestamp: Date.now(),
        };
        this.io.emit('price_update', message);
      }

      if (volumeSpikes.length > 0) {
        const message: WebSocketMessage = {
          event: 'volume_spike',
          data: volumeSpikes,
          timestamp: Date.now(),
        };
        this.io.emit('volume_spike', message);
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
