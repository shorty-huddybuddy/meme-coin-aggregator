import { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

export function applySecurityMiddlewares(app: Application): void {
  // Basic security headers with relaxed CSP for demo page
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          mediaSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "ws://localhost:3000", "wss://localhost:3000", "https://cdn.socket.io"],
        },
      },
    })
  );

  // CORS - allow list from env or allow same origin by default
  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  const corsOptions = origins.length
    ? { origin: origins }
    : { origin: true }; // fallback: allow origin

  app.use(cors(corsOptions));

  // Rate limiter
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || config.rateLimit.window || 15 * 60 * 1000);
  const max = Number(process.env.RATE_LIMIT_MAX || 100);

  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const logger = require('../services/logger.service').default;
        const { metrics } = require('../services/metrics.service');
        metrics.increment('rateLimitEvents');
        logger.warn('Rate limit exceeded', { ip: req.ip, method: req.method, path: req.originalUrl });
      } catch (e) {
        // ignore
      }

      res.status(429).json({ success: false, message: 'Too many requests, please try again later.' });
    },
  });

  app.use(limiter);
}

export default applySecurityMiddlewares;
