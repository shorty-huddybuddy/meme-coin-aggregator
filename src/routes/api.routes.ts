import { Router } from 'express';
import { AggregationService } from '../services/aggregation.service';
import { cacheManager } from '../services/cache.service';
import { asyncHandler } from '../middleware/error.middleware';
import { FilterOptions, SortOptions, ApiResponse, TokenData } from '../types';
import { decodeCursor, generateCursor } from '../utils/helpers';
import { ValidationError } from '../utils/errors';
import apiKeyMiddleware from '../middleware/auth.middleware';
import {
  tokensQueryValidator,
  searchQueryValidator,
  handleValidationErrors,
} from '../middleware/validators';
import { metrics } from '../services/metrics.service';
import logger from '../services/logger.service';
import { config } from '../config';

const router = Router();
const aggregationService = new AggregationService();

/**
 * GET /api/tokens
 * Get all tokens with optional filtering, sorting, and pagination
 */
router.get('/tokens', tokensQueryValidator, handleValidationErrors, asyncHandler(async (req, res) => {
    const {
      timePeriod,
      minVolume,
      maxVolume,
      minMarketCap,
      maxMarketCap,
      protocol,
      sortBy,
      sortOrder,
      limit = '50',
      cursor,
    } = req.query;

    // Validate limit
    const parsedLimit = parseInt(limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      throw new ValidationError('Limit must be between 1 and 500');
    }

    // Build filter options
    const filters: FilterOptions = {
      timePeriod: timePeriod as FilterOptions['timePeriod'],
      minVolume: minVolume ? parseFloat(minVolume as string) : undefined,
      maxVolume: maxVolume ? parseFloat(maxVolume as string) : undefined,
      minMarketCap: minMarketCap ? parseFloat(minMarketCap as string) : undefined,
      maxMarketCap: maxMarketCap ? parseFloat(maxMarketCap as string) : undefined,
      protocol: protocol as string,
    };

    // Build sort options
    const sortOptions: SortOptions = {
      sortBy: sortBy as SortOptions['sortBy'],
      sortOrder: sortOrder as SortOptions['sortOrder'],
      timePeriod: timePeriod as SortOptions['timePeriod'],
    };

    // Get all tokens
    let tokens = await aggregationService.getAllTokens();
    if (!Array.isArray(tokens)) tokens = [];

    // Apply filters
    tokens = aggregationService.filterTokens(tokens, filters);

    // Apply sorting
    tokens = aggregationService.sortTokens(tokens, sortOptions);

    // Build a fingerprint of current filters+sort so cursors are only valid for the same view
    const fingerprint = Buffer.from(JSON.stringify({ filters, sortOptions })).toString('base64');

    // Apply pagination
    let startIndex = 0;
    if (cursor && typeof cursor === 'string') {
      const decoded: any = decodeCursor(cursor as string);
      if (decoded && typeof decoded.index === 'number' && (!decoded.fingerprint || decoded.fingerprint === fingerprint)) {
        startIndex = decoded.index;
      } else {
        // invalid or mismatched cursor: reset to start
        startIndex = 0;
      }
    }
    const endIndex = startIndex + parsedLimit;
    const paginatedTokens = tokens.slice(startIndex, endIndex);

    // Generate next and previous cursors for cursor-based pagination
    const nextCursor = endIndex < tokens.length ? generateCursor({ index: endIndex, fingerprint }) : undefined;
    const prevCursor = startIndex > 0 ? generateCursor({ index: Math.max(0, startIndex - parsedLimit), fingerprint }) : undefined;

    const response: ApiResponse<TokenData[]> = {
      success: true,
      data: paginatedTokens,
      pagination: {
        limit: parsedLimit,
        nextCursor,
        prevCursor,
        totalCount: tokens.length,
      },
    };

    res.json(response);
  })
);

/**
 * GET /api/tokens/search
 * Search tokens by query
 */
router.get('/tokens/search', searchQueryValidator, handleValidationErrors, asyncHandler(async (req, res) => {
    const { q, limit = '20', cursor } = req.query;

    if (!q || typeof q !== 'string') {
      throw new ValidationError('Query parameter "q" is required');
    }

    const parsedLimit = parseInt(limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      throw new ValidationError('Limit must be between 1 and 500');
    }

    let tokens = await aggregationService.searchTokens(q);
    if (!Array.isArray(tokens)) tokens = [];

    // Fingerprint the query so search cursors are tied to the same query
    const fingerprint = Buffer.from(String(q)).toString('base64');

    // Apply pagination
    let startIndex = 0;
    if (cursor && typeof cursor === 'string') {
      const decoded: any = decodeCursor(cursor as string);
      if (decoded && typeof decoded.index === 'number' && (!decoded.fingerprint || decoded.fingerprint === fingerprint)) {
        startIndex = decoded.index;
      } else {
        startIndex = 0;
      }
    }

    const endIndex = startIndex + parsedLimit;
    const paginatedTokens = tokens.slice(startIndex, endIndex);
    const nextCursor = endIndex < tokens.length ? generateCursor({ index: endIndex, fingerprint }) : undefined;
    const prevCursor = startIndex > 0 ? generateCursor({ index: Math.max(0, startIndex - parsedLimit), fingerprint }) : undefined;

    const response: ApiResponse<TokenData[]> = {
      success: true,
      data: paginatedTokens,
      pagination: {
        limit: parsedLimit,
        nextCursor,
        prevCursor,
        totalCount: tokens.length,
      },
    };

    res.json(response);
  })
);

/**
 * POST /api/cache/invalidate
 * Invalidate cache
 */
router.post('/cache/invalidate', apiKeyMiddleware, asyncHandler(async (_req, res) => {
    await aggregationService.invalidateCache();

    res.json({
      success: true,
      data: { message: 'Cache invalidated successfully' },
    });
  })
);

/**
 * POST /api/cache/flush
 * Flush entire Redis cache (dev/testing only)
 */
router.post('/cache/flush', asyncHandler(async (_req, res) => {
    await cacheManager.flushAll();

    res.json({
      success: true,
      data: { message: 'Redis cache flushed successfully' },
    });
  })
);

  /**
   * GET /api/cache/status
   * Returns whether Redis is used or in-memory fallback and sample keys
   */
  router.get(
    '/cache/status',
    apiKeyMiddleware,
    asyncHandler(async (_req, res) => {
      const usingInMemory = cacheManager.isUsingInMemory();
      const keys = await cacheManager.keys('*');

      res.json({
        success: true,
        data: {
          usingInMemory,
          keyCount: keys.length,
          sampleKeys: keys.slice(0, 20),
        },
      });
    })
  );

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * GET /api/metrics
 * Protected endpoint to return in-memory metrics
 */
router.get('/metrics', apiKeyMiddleware, (_req, res) => {
  try {
    res.json({ success: true, data: metrics.getAll() });
  } catch (e) {
    logger.error('Failed to read metrics', { error: e });
    res.status(500).json({ success: false, error: 'Failed to read metrics' });
  }
});

export default router;

// Dev-only route to toggle expanded upstream fetches without restart
// Enabled only when NODE_ENV === 'development'
if ((config.server.env || '').toLowerCase() === 'development') {
  router.post('/dev/expand-upstream', asyncHandler(async (req, res) => {
    const { enable } = req.body || {};
    if (typeof enable !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Request body must include boolean `enable`' });
    }
    // mutate config in-memory for local testing
    (config as any).dev = (config as any).dev || {};
    (config as any).dev.expandUpstream = enable;
    return res.json({ success: true, data: { expandUpstream: enable } });
  }));
}

