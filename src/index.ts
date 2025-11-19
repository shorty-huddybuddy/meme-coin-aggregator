import express, { Application } from 'express';
import path from 'path';
import http from 'http';
import compression from 'compression';
import { config } from './config';
// Validate configuration early to fail fast in production
import validateConfig from './config/validate';

validateConfig();
import { cacheManager } from './services/cache.service';
import { WebSocketService } from './services/websocket.service';
import apiRoutes from './routes/api.routes';
import { errorHandler } from './middleware/error.middleware';
import applySecurityMiddlewares from './middleware/security.middleware';

class App {
  public app: Application;
  public server: http.Server;
  private wsService: WebSocketService;

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wsService = new WebSocketService(this.server);

    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // Security (CORS, rate limiting, helmet)
    applySecurityMiddlewares(this.app);
    // Request logging for observability
    // Note: keep logging early to capture all requests including auth failures
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requestLogger } = require('./middleware/logging.middleware');
    this.app.use(requestLogger);
    this.app.use(compression());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Serve built React client static files first (so assets like `/assets/*` resolve)
    // This ensures Vite-built assets under `public/client/assets` are served with correct MIME types.
    this.app.use(express.static(path.join(__dirname, '../public/client')));
    // Fallback to other public files (demo.html, favicon, etc.)
    this.app.use(express.static('public'));

    // Favicon route (prevent 404)
    this.app.get('/favicon.ico', (_req, res) => res.status(204).end());

    // Request logging
    this.app.use((req, _res, next) => {
      // eslint-disable-next-line no-console
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }

  private initializeRoutes(): void {
    // API routes
    this.app.use('/api', apiRoutes);

    // Serve React client build if exists; fallback to demo.html
    const clientBuildPath = path.join(__dirname, '../public/client');
    this.app.get('/', (_req, res) => {
      if (require('fs').existsSync(path.join(clientBuildPath, 'index.html'))) {
        return res.sendFile(path.join(clientBuildPath, 'index.html'));
      }
      return res.redirect('/demo.html');
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Connect to Redis
      await cacheManager.connect();
      // eslint-disable-next-line no-console
      console.log('✓ Redis connected');

      // Start WebSocket update scheduler
      await this.wsService.startUpdateScheduler();
      // eslint-disable-next-line no-console
      console.log('✓ WebSocket scheduler started');

      // Start HTTP server
      this.server.listen(config.server.port, () => {
        // eslint-disable-next-line no-console
        console.log(`✓ Server running on http://localhost:${config.server.port}`);
        // eslint-disable-next-line no-console
        console.log(`✓ WebSocket available on ws://localhost:${config.server.port}`);
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  // Graceful shutdown helper
  public async shutdown(): Promise<void> {
    try {
      // eslint-disable-next-line no-console
      console.log('Shutting down gracefully...');
      this.wsService.stopUpdateScheduler();
      await cacheManager.disconnect();
      // Close the HTTP server
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
      // eslint-disable-next-line no-console
      console.log('Shutdown complete');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error during shutdown', e);
    }
  }

  public async stop(): Promise<void> {
    this.wsService.stopUpdateScheduler();
    await cacheManager.disconnect();
    this.server.close();
  }
}

// Start server
const application = new App();
application.start();

// Readiness endpoint (Redis-only)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const expressApp = (application as any).app;
  expressApp.get('/health/ready', async (_req: any, res: any) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cache = require('./services/cache.service').cacheManager;
      const redisOk = typeof cache.isUsingInMemory === 'function' ? !cache.isUsingInMemory() : true;
      if (redisOk) {
        return res.json({ success: true, data: { ready: true } });
      }
      return res.status(503).json({ success: false, data: { ready: false } });
    } catch (e) {
      return res.status(503).json({ success: false, data: { ready: false } });
    }
  });
} catch (e) {
  // ignore silently if attach fails during tests
}

export default application;
