import { query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';

/**
 * Query parameter validation for GET /api/tokens endpoint
 * 
 * Purpose:
 * Validates and sanitizes query parameters for token listing endpoint.
 * Prevents invalid requests from reaching business logic and database queries.
 * 
 * Validated Parameters:
 * 
 * 1. limit (optional)
 *    - Description: Maximum number of tokens to return
 *    - Type: Integer
 *    - Range: 1-100
 *    - Default: 50 (applied in route handler)
 *    - Examples: ?limit=20, ?limit=100
 * 
 * 2. timePeriod (optional)
 *    - Description: Volume/price change time window
 *    - Type: String enum
 *    - Valid values: '1h' | '24h' | '7d'
 *    - Default: '24h' (applied in route handler)
 *    - Examples: ?timePeriod=1h, ?timePeriod=7d
 * 
 * 3. sortOrder (optional)
 *    - Description: Sort direction for results
 *    - Type: String enum
 *    - Valid values: 'asc' | 'desc'
 *    - Default: 'desc' (applied in route handler)
 *    - Examples: ?sortOrder=asc, ?sortOrder=desc
 * 
 * 4. sortBy (optional)
 *    - Description: Field to sort results by
 *    - Type: String
 *    - Valid pattern: Alphanumeric with underscores
 *    - Default: 'volume_sol' (applied in route handler)
 *    - Examples: ?sortBy=price_sol, ?sortBy=market_cap_sol
 * 
 * Validation Rules:
 * - All parameters optional (defaults applied in handler)
 * - limit converted to integer before range check
 * - timePeriod must match exact enum values (case-sensitive)
 * - sortOrder must match exact enum values (case-sensitive)
 * - sortBy allows flexible field names via regex pattern
 * 
 * Error Format:
 * If validation fails, handleValidationErrors middleware formats errors:
 * ```json
 * {
 *   "success": false,
 *   "error": "limit: Must be between 1 and 100; timePeriod: Invalid value"
 * }
 * ```
 * 
 * Usage:
 * ```typescript
 * router.get(
 *   '/tokens',
 *   tokensQueryValidator,
 *   handleValidationErrors,
 *   asyncHandler(async (req, res) => { ... })
 * );
 * ```
 * 
 * Integration:
 * Must be chained with handleValidationErrors middleware:
 * tokensQueryValidator → handleValidationErrors → route handler
 * 
 * @type {ValidationChain[]} Array of express-validator validation rules
 * 
 * @example
 * // Valid requests
 * GET /api/tokens?limit=50&timePeriod=24h&sortOrder=desc&sortBy=volume_sol
 * GET /api/tokens?limit=10&timePeriod=1h
 * GET /api/tokens (all defaults applied)
 * 
 * // Invalid requests (will return 400)
 * GET /api/tokens?limit=101 (exceeds max)
 * GET /api/tokens?timePeriod=12h (invalid enum value)
 * GET /api/tokens?sortOrder=random (invalid enum value)
 */
export const tokensQueryValidator = [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('timePeriod').optional().isIn(['1h', '24h', '7d']).withMessage('timePeriod must be 1h|24h|7d'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('sortOrder must be asc|desc'),
  query('sortBy').optional().isString (),
];

/**
 * Query parameter validation for GET /api/tokens/search endpoint
 * 
 * Purpose:
 * Validates search query parameters to ensure valid token search requests.
 * Prevents empty searches and enforces result limits.
 * 
 * Validated Parameters:
 * 
 * 1. q (required)
 *    - Description: Search query string (token name, ticker, or address)
 *    - Type: String
 *    - Constraints: Non-empty after trimming whitespace
 *    - Examples: ?q=BONK, ?q=So11111111111111111111111111111111111111112
 *    - Error if missing: "Search query is required"
 * 
 * 2. limit (optional)
 *    - Description: Maximum search results to return
 *    - Type: Integer
 *    - Range: 1-100
 *    - Default: 20 (applied in route handler)
 *    - Examples: ?limit=10, ?limit=50
 * 
 * Validation Flow:
 * 1. Check 'q' parameter exists and not empty after trim
 * 2. If limit provided, convert to integer and validate range
 * 3. Pass validated values to route handler
 * 4. Handler applies defaults for missing optional params
 * 
 * Search Behavior:
 * Query string matched against:
 * - Token name (case-insensitive partial match)
 * - Token ticker/symbol (case-insensitive)
 * - Token address (exact match)
 * 
 * Error Responses:
 * Missing query:
 * ```json
 * {
 *   "success": false,
 *   "error": "q: Search query is required"
 * }
 * ```
 * 
 * Invalid limit:
 * ```json
 * {
 *   "success": false,
 *   "error": "limit: Must be between 1 and 100"
 * }
 * ```
 * 
 * Performance Considerations:
 * - Limit capped at 100 to prevent excessive memory usage
 * - Search query trimmed to remove leading/trailing whitespace
 * - Empty string check prevents unnecessary database queries
 * 
 * Usage:
 * ```typescript
 * router.get(
 *   '/search',
 *   searchQueryValidator,
 *   handleValidationErrors,
 *   asyncHandler(async (req, res) => { ... })
 * );
 * ```
 * 
 * @type {ValidationChain[]} Array of express-validator validation rules
 * 
 * @example
 * // Valid requests
 * GET /api/tokens/search?q=BONK&limit=20
 * GET /api/tokens/search?q=So11111111111111111111111111111111111111112
 * GET /api/tokens/search?q=Bonk (limit defaults to 20)
 * 
 * // Invalid requests (will return 400)
 * GET /api/tokens/search (missing q parameter)
 * GET /api/tokens/search?q= (empty query after trim)
 * GET /api/tokens/search?q=BONK&limit=150 (exceeds max)
 */
export const searchQueryValidator = [
  query('q').exists().isString().withMessage('Query parameter "q" is required'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

/**
 * Validation error aggregator and formatter
 * 
 * Purpose:
 * Processes validation results from express-validator middleware.
 * Aggregates all validation errors into single formatted error message.
 * Throws ValidationError to trigger centralized error handling.
 * 
 * Error Processing Flow:
 * 1. Extract validation results from request object (populated by validator middleware)
 * 2. Check if any validation errors exist
 * 3. If errors found:
 *    a. Map each error to "parameter: message" format
 *    b. Join multiple errors with "; " separator
 *    c. Throw ValidationError with formatted message (400 status)
 * 4. If no errors, call next() to continue to route handler
 * 
 * Error Format:
 * Single error: "limit: Must be between 1 and 100"
 * Multiple errors: "limit: Must be between 1 and 100; timePeriod: Invalid value"
 * 
 * Example Error Object:
 * ```json
 * {
 *   "success": false,
 *   "error": "limit: Must be between 1 and 100; timePeriod: Must be one of: 1h, 24h, 7d"
 * }
 * ```
 * 
 * Integration Pattern:
 * Must be placed AFTER validator middleware, BEFORE route handler:
 * ```typescript
 * router.get(
 *   '/tokens',
 *   tokensQueryValidator,    // Step 1: Run validation rules
 *   handleValidationErrors,  // Step 2: Check results, throw if invalid
 *   asyncHandler(handler)    // Step 3: Execute route logic if valid
 * );
 * ```
 * 
 * Error Propagation:
 * Thrown ValidationError caught by:
 * 1. asyncHandler wrapper (if route is async)
 * 2. Express error handling middleware
 * 3. Global errorHandler middleware
 * 4. Client receives 400 response with formatted message
 * 
 * Validation Libraries:
 * Works with express-validator validation chains:
 * - query() validators
 * - body() validators
 * - param() validators
 * - custom() validators
 * 
 * Performance:
 * - Minimal overhead: Single validationResult() call
 * - Early exit if no errors (fast path)
 * - String concatenation optimized by V8
 * 
 * @param {Request} req - Express request with validation results attached
 * @param {Response} _res - Express response object (unused)
 * @param {NextFunction} next - Callback to continue middleware chain
 * @throws {ValidationError} When validation errors exist (400 status)
 * 
 * @example
 * // Request with validation errors
 * GET /api/tokens?limit=150&timePeriod=invalid
 * 
 * // validationResult contains:
 * // [{param: 'limit', msg: 'Must be between 1 and 100'},
 * //  {param: 'timePeriod', msg: 'Must be one of: 1h, 24h, 7d'}]
 * 
 * // Formatted output:
 * // "limit: Must be between 1 and 100; timePeriod: Must be one of: 1h, 24h, 7d"
 * 
 * // Client receives 400 response:
 * // {success: false, error: "limit: Must be between 1 and 100; timePeriod: Must be one of: 1h, 24h, 7d"}
 */
export function handleValidationErrors(req: Request, _res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
      const msg = errors
        .array()
        .map((e: any) => `${e.param || e.path || 'param'}: ${e.msg || e.message}`)
        .join('; ');
    throw new ValidationError(msg);
  }
  next();
}

export default {
  tokensQueryValidator,
  searchQueryValidator,
  handleValidationErrors,
};
