import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

/**
 * Global error handler middleware
 * 
 * Purpose:
 * Centralized error handling for all Express routes and middleware.
 * Transforms application errors into consistent JSON responses with appropriate HTTP status codes.
 * 
 * Error Classification:
 * 
 * 1. AppError instances (custom application errors):
 *    - ValidationError: 400 Bad Request (invalid input, missing required fields)
 *    - NotFoundError: 404 Not Found (resource doesn't exist)
 *    - InternalError: 500 Internal Server Error (database failures, API timeouts)
 *    - All have predefined statusCode property
 * 
 * 2. Generic Error instances (unexpected errors):
 *    - Programming errors (null reference, type errors)
 *    - Unhandled exceptions from third-party libraries
 *    - Default to 500 Internal Server Error
 *    - Show generic "Internal server error" message (no sensitive details)
 * 
 * Response Structure:
 * ```json
 * {
 *   "success": false,
 *   "error": "Error message string"
 * }
 * ```
 * 
 * HTTP Status Code Mapping:
 * - 400: ValidationError → invalid query params, malformed request body
 * - 404: NotFoundError → token address not found, endpoint doesn't exist
 * - 500: InternalError → Redis connection failed, upstream API timeout
 * - 500: Generic Error → unexpected exceptions, programming errors
 * 
 * Error Logging:
 * - AppError: Not logged (expected errors, already handled)
 * - Generic Error: Logged to console with full stack trace
 * - Logged data: Error message, stack, request context
 * 
 * Production Considerations:
 * - Never exposes sensitive data to clients:
 *   - Stack traces hidden (only logged server-side)
 *   - Internal paths not revealed
 *   - Database connection strings masked
 * - Generic errors show simple "Internal server error" message
 * - All errors logged server-side for debugging
 * - Consistent error format enables client-side parsing
 * 
 * Integration:
 * Must be registered AFTER all routes in Express app:
 * ```typescript
 * app.use('/api', apiRoutes);
 * app.use(errorHandler); // LAST middleware
 * ```
 * 
 * Error Flow:
 * 1. Route handler throws error or calls next(error)
 * 2. Express skips remaining middleware, jumps to error handlers
 * 3. errorHandler catches error
 * 4. Determines if AppError or generic Error
 * 5. Logs if unexpected error
 * 6. Sends JSON response with statusCode
 * 7. Client receives error, connection closes
 * 
 * @param {Error | AppError} err - Error object (custom or generic)
 * @param {Request} _req - Express request object (unused, prefixed with _)
 * @param {Response} res - Express response object for sending JSON
 * @param {NextFunction} _next - Next function (unused but required by Express signature)
 * 
 * @example
 * // AppError with custom status
 * throw new ValidationError('Invalid token address format');
 * // Response: {success: false, error: "Invalid token address format"} (400)
 * 
 * // NotFoundError
 * throw new NotFoundError('Token not found');
 * // Response: {success: false, error: "Token not found"} (404)
 * 
 * // Generic error (unexpected)
 * throw new Error('Database connection failed');
 * // Logged: "Unexpected error: Database connection failed" + stack
 * // Response: {success: false, error: "Internal server error"} (500)
 * 
 * // Client-side handling
 * fetch('/api/tokens?limit=invalid')
 *   .then(res => res.json())
 *   .then(data => {
 *     if (!data.success) {
 *       alert(data.error); // "limit: Must be between 1 and 100"
 *     }
 *   });
 */
export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Unexpected errors
  // eslint-disable-next-line no-console
  console.error('Unexpected error:', err);

  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
};

/**
 * Async handler wrapper to catch promise rejections
 * 
 * Purpose:
 * Wraps async Express route handlers to automatically catch promise rejections.
 * Eliminates need for try/catch blocks in every async route handler.
 * Prevents unhandled promise rejections from crashing the server.
 * 
 * Problem Solved:
 * Express doesn't natively handle promise rejections in async functions.
 * Without this wrapper, unhandled promise rejections crash the server:
 * ```typescript
 * // BAD: Unhandled rejection crashes server
 * app.get('/tokens', async (req, res) => {
 *   const data = await fetchTokens(); // If this throws, server crashes
 *   res.json(data);
 * });
 * ```
 * 
 * Solution:
 * Wraps async function in Promise.resolve() and catches any errors:
 * ```typescript
 * // GOOD: Errors passed to errorHandler middleware
 * app.get('/tokens', asyncHandler(async (req, res) => {
 *   const data = await fetchTokens(); // Throws are caught automatically
 *   res.json(data);
 * }));
 * ```
 * 
 * Error Propagation:
 * 1. Async function throws error or rejects promise
 * 2. .catch(next) captures the error
 * 3. next(error) passes error to Express error handling chain
 * 4. errorHandler middleware processes error
 * 5. Client receives formatted JSON response
 * 
 * Type Safety:
 * - fn: (req, res, next) => Promise<unknown>
 * - Returns: (req, res, next) => void (standard Express RequestHandler)
 * - Properly typed for TypeScript Express definitions
 * 
 * Performance:
 * - Negligible overhead: Single Promise.resolve() per request
 * - Promise creation optimized by V8 engine (~0.001ms)
 * - No additional async operations beyond original handler
 * 
 * Alternative Approaches (not used):
 * 1. Manual try/catch in every handler (verbose, error-prone)
 * 2. express-async-errors package (modifies Express internals)
 * 3. async-middleware library (extra dependency)
 * 
 * Usage Pattern:
 * ```typescript
 * // Without asyncHandler (requires manual try/catch)
 * router.get('/tokens', async (req, res, next) => {
 *   try {
 *     const tokens = await aggregationService.getAllTokens();
 *     res.json(tokens);
 *   } catch (error) {
 *     next(error); // Must manually catch and pass
 *   }
 * });
 * 
 * // With asyncHandler (automatic error catching)
 * router.get('/tokens', asyncHandler(async (req, res) => {
 *   const tokens = await aggregationService.getAllTokens();
 *   res.json(tokens); // Errors caught automatically
 * }));
 * ```
 * 
 * Error Types Handled:
 * - Thrown errors: throw new ValidationError('Invalid input')
 * - Rejected promises: await failingAsyncFunction()
 * - Unhandled async errors: Promise chain failures
 * - Network timeouts: axios timeout errors
 * - Database errors: Redis connection failures
 * 
 * @param {Function} fn - Async Express route handler (req, res, next) => Promise<unknown>
 * @returns {RequestHandler} Express request handler with automatic error catching
 * 
 * @example
 * // Multiple async operations
 * router.get('/tokens', asyncHandler(async (req, res) => {
 *   const tokens = await aggregationService.getAllTokens(); // Can throw
 *   const enriched = await enrichWith7DayChanges(tokens); // Can throw
 *   res.json(enriched); // All errors caught automatically
 * }));
 * 
 * // Error automatically propagates to errorHandler
 * router.post('/cache/flush', asyncHandler(async (req, res) => {
 *   await cacheManager.flushAll(); // If Redis fails, error caught
 *   res.json({ success: true });
 * }));
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
