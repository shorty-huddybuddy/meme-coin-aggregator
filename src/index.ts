import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/error.middleware';
import  loggingMiddleware  from './middleware/logging.middleware';
import  securityMiddleware  from './middleware/security.middleware';
import apiRoutes from './routes/api.routes';
import { cacheManager } from './services/cache.service';
import { startWebSocketServer } from './services/websocket.service';
import { createServer } from 'http';

class App {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }));
    this.app.use(cors({
      origin: config.cors.origins,
      credentials: config.cors.credentials,
    }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(loggingMiddleware);
    this.app.use(securityMiddleware);
  }

  private setupRoutes(): void {
    // Health check - must respond quickly
    this.app.get('/health', (_req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        cache: cacheManager.isUsingInMemory() ? 'in-memory' : 'redis'
      });
    });

    // API routes
    this.app.use('/api', apiRoutes);

    // Serve static frontend files
    const publicPath = path.join(__dirname, '../public');
    this.app.use(express.static(publicPath));

    // SPA fallback - serve index.html for all other routes
    this.app.get('*', (_req, res) => {
      const indexPath = path.join(publicPath, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) {
          res.status(404).type('text/plain').send('Application not found. Please rebuild the client.');
        }
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  async start(): Promise<void> {
    try {
      // Connect to cache
      await cacheManager.connect();

      // Start WebSocket server
      startWebSocketServer(this.server);

      // Use PORT from environment (required for deployment platforms)
      const PORT = Number(process.env.PORT || config.server.port || 8080);
      const HOST = process.env.HOST || '0.0.0.0';

      this.server.listen(PORT, HOST, () => {
        console.log(`✓ Server running on http://${HOST}:${PORT}`);
        console.log(`✓ WebSocket available on ws://${HOST}:${PORT}`);
        console.log(`✓ Health check: http://${HOST}:${PORT}/health`);
      });

      // Graceful shutdown
      const shutdown = async () => {
        console.log('\nShutting down gracefully...');
        this.server.close(() => {
          console.log('Server closed');
        });
        await cacheManager.disconnect();
        process.exit(0);
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

const app = new App();
app.start();