import express, { Application } from 'express';
import path from 'path';
import http from 'http';
import cors from 'cors';
import compression from 'compression';
import { config } from './config';
import { cacheManager } from './services/cache.service';
import { WebSocketService } from './services/websocket.service';
import apiRoutes from './routes/api.routes';
import { errorHandler } from './middleware/error.middleware';

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
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Serve static files
    this.app.use(express.static('public'));

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

    // Root endpoint: redirect to demo UI (served from /public) if present
    this.app.get('/', (_req, res) => {
      return res.redirect('/demo.html');
    });

    // Log where the server will look for static files so deployments are easier to debug
    const checkPaths = [
      path.join(process.cwd(), 'public', 'demo.html'),
      path.join(__dirname, '..', 'public', 'demo.html'),
    ];
    for (const p of checkPaths) {
      // eslint-disable-next-line no-console
      console.log('Static check:', p);
    }
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

  public async stop(): Promise<void> {
    this.wsService.stopUpdateScheduler();
    await cacheManager.disconnect();
    this.server.close();
  }
}

// Start server
const application = new App();
application.start();

export default application;
