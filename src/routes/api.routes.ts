import { Router } from 'express';
import { AggregationService } from '../services/aggregation.service';
import { asyncHandler } from '../middleware/error.middleware';
import { FilterOptions, SortOptions, ApiResponse, TokenData } from '../types';
import { decodeCursor, generateCursor } from '../utils/helpers';
import { ValidationError } from '../utils/errors';

const router = Router();
const aggregationService = new AggregationService();

/**
 * GET /api/tokens
 * Get all tokens with optional filtering, sorting, and pagination
 */
router.get(
  '/tokens',
  asyncHandler(async (req, res) => {
    const {
      timePeriod,
      minVolume,
      maxVolume,
      minMarketCap,
      maxMarketCap,
      protocol,
      sortBy,
      sortOrder,
      limit = '30',
      cursor,
    } = req.query;

    // Validate limit
    const parsedLimit = parseInt(limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new ValidationError('Limit must be between 1 and 100');
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
    };

    // Get all tokens
    let tokens = await aggregationService.getAllTokens();

    // Apply filters
    tokens = aggregationService.filterTokens(tokens, filters);

    // Apply sorting
    tokens = aggregationService.sortTokens(tokens, sortOptions);

    // Apply pagination
    const startIndex = cursor ? decodeCursor(cursor as string) : 0;
    const endIndex = startIndex + parsedLimit;
    const paginatedTokens = tokens.slice(startIndex, endIndex);

    // Generate next cursor
    const nextCursor = endIndex < tokens.length ? generateCursor(endIndex) : undefined;

    const response: ApiResponse<TokenData[]> = {
      success: true,
      data: paginatedTokens,
      pagination: {
        limit: parsedLimit,
        nextCursor,
      },
    };

    res.json(response);
  })
);

/**
 * GET /api/tokens/search
 * Search tokens by query
 */
router.get(
  '/tokens/search',
  asyncHandler(async (req, res) => {
    const { q, limit = '20', cursor } = req.query;

    if (!q || typeof q !== 'string') {
      throw new ValidationError('Query parameter "q" is required');
    }

    const parsedLimit = parseInt(limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new ValidationError('Limit must be between 1 and 100');
    }

    const tokens = await aggregationService.searchTokens(q);

    // Apply pagination
    const startIndex = cursor ? decodeCursor(cursor as string) : 0;
    const endIndex = startIndex + parsedLimit;
    const paginatedTokens = tokens.slice(startIndex, endIndex);
    const nextCursor = endIndex < tokens.length ? generateCursor(endIndex) : undefined;

    const response: ApiResponse<TokenData[]> = {
      success: true,
      data: paginatedTokens,
      pagination: {
        limit: parsedLimit,
        nextCursor,
      },
    };

    res.json(response);
  })
);

/**
 * POST /api/cache/invalidate
 * Invalidate cache
 */
router.post(
  '/cache/invalidate',
  asyncHandler(async (_req, res) => {
    await aggregationService.invalidateCache();

    res.json({
      success: true,
      data: { message: 'Cache invalidated successfully' },
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

export default router;
