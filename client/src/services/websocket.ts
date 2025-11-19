import { io, Socket } from 'socket.io-client';
import type { WebSocketUpdate, FilterOptions } from '../types';

class WebSocketService {
  private socket: Socket | null = null;

  connect(
    url: string = 'http://localhost:3000',
    onUpdate: (update: WebSocketUpdate) => void,
    filters?: FilterOptions
  ): void {
    this.socket = io(url);

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      
      // Send subscription filters if provided
      if (filters && this.socket) {
        this.socket.emit('subscribe', filters);
      }
    });

    // Server may emit different shapes. Support:
    // - array payload directly
    // - { data: [...] }
    // - { tokens: [...] }
    this.socket.on('initial_data', (payload: any) => {
      const tokens: any[] = Array.isArray(payload)
        ? payload
        : payload?.data ?? payload?.tokens ?? [];
      onUpdate({ type: 'initial_data', tokens: tokens as any[] });
    });

    this.socket.on('price_update', (payload: any) => {
      const updates: any[] = Array.isArray(payload)
        ? payload
        : payload?.data ?? payload?.updates ?? [];
      onUpdate({ type: 'price_update', updates: updates as any[] });
    });

    this.socket.on('volume_spike', (payload: any) => {
      const spikes: any[] = Array.isArray(payload)
        ? payload
        : payload?.data ?? payload?.spikes ?? [];
      onUpdate({ type: 'volume_spike', spikes: spikes as any[] });
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    this.socket.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });
  }

  updateFilters(filters: FilterOptions): void {
    if (this.socket) {
      this.socket.emit('subscribe', filters);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const wsService = new WebSocketService();
export default wsService;
