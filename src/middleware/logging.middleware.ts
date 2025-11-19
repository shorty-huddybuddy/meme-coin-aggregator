import { Request, Response, NextFunction } from 'express';
import logger from '../services/logger.service';
import { metrics } from '../services/metrics.service';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, path } = req;

  // increment request counter
  try {
    metrics.increment('requests');
  } catch (e) {
    // ignore
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${method} ${path} -> ${res.statusCode}`, { duration, method, path, status: res.statusCode });
  });

  next();
}

export default requestLogger;
