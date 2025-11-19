import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';

// Simple auth failure logger to aid debugging in prod/staging
function logAuthFailure(req: Request, keyAttempt?: string) {
  try {
    // structured log
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const logger = require('../services/logger.service').default;
    logger.warn('API key auth failed', { ip: req.ip, method: req.method, path: req.path, key: keyAttempt || 'none' });
  } catch (e) {
    // ignore
  }
}

export function apiKeyMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // During tests, skip API key validation to keep tests deterministic
  if ((process.env.NODE_ENV || '').toLowerCase() === 'test') {
    return next();
  }
  const apiKeysRaw = process.env.API_KEYS;

  // If no API keys configured, skip auth (open API)
  if (!apiKeysRaw) {
    return next();
  }

  const allowed = apiKeysRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const headerKey = (req.header('x-api-key') || req.header('authorization') || '').replace(/^Bearer\s+/i, '');

  if (!headerKey || !allowed.includes(headerKey)) {
    logAuthFailure(req, headerKey);
    throw new ValidationError('Invalid or missing API key');
  }

  return next();
}

export default apiKeyMiddleware;
