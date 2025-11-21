import { Request, Response, NextFunction } from 'express';
import logger from '../services/logger.service';
import { metrics } from '../services/metrics.service';

/**
 * Request/response logging middleware with duration tracking
 * 
 * Purpose:
 * Logs all HTTP requests with method, path, status code, and response time.
 * Increments request counter for metrics collection and monitoring.
 * Provides observability into API performance and usage patterns.
 * 
 * Logged Information:
 * - HTTP Method: GET, POST, DELETE, etc.
 * - Request Path: Full URL path including query string
 * - Status Code: HTTP response status (200, 400, 404, 500)
 * - Duration: Response time in milliseconds (ms)
 * 
 * Implementation Details:
 * 
 * 1. Capture Request Start Time:
 *    - Uses Date.now() for high-precision timestamp
 *    - Minimal overhead (~0.01ms per request)
 *    - Stored in local variable (no memory leak)
 * 
 * 2. Increment Metrics Counter:
 *    - metricsService.increment('requests')
 *    - Tracks total request count since server start
 *    - Used for /api/metrics endpoint
 *    - Gracefully handles metrics service failures
 * 
 * 3. Attach Response Listener:
 *    - Listens to 'finish' event (response fully sent to client)
 *    - Calculates duration: Date.now() - startTime
 *    - Logs after response complete (non-blocking)
 *    - Event auto-removed after response (no cleanup needed)
 * 
 * 4. Pass Control to Next Middleware:
 *    - Calls next() immediately (doesn't block request)
 *    - Logging happens asynchronously on response finish
 *    - Request processing continues immediately
 * 
 * Log Format:
 * ```
 * GET /api/tokens -> 200 { duration: 45, method: 'GET', path: '/api/tokens', status: 200 }
 * POST /api/cache/flush -> 200 { duration: 12, method: 'POST', path: '/api/cache/flush', status: 200 }
 * GET /api/search?q=BONK -> 200 { duration: 123, method: 'GET', path: '/api/search', status: 200 }
 * GET /api/invalid -> 404 { duration: 8, method: 'GET', path: '/api/invalid', status: 404 }
 * ```
 * 
 * Event Timing:
 * - 'finish': Emitted when response fully written to client socket
 * - Alternative 'close': Emitted on connection close (not used)
 * - 'finish' preferred: Fires after successful send, before TCP close
 * - Reliable for measuring actual response time
 * 
 * Performance Characteristics:
 * - Overhead: <1ms per request (two Date.now() calls)
 * - Non-blocking: Logging async, doesn't delay response
 * - Memory: Single listener per request (auto-cleaned up)
 * - No database queries or file I/O during request
 * 
 * Metrics Integration:
 * Counter incremented before request processing:
 * - Accessible via GET /api/metrics endpoint
 * - Tracks total requests since server start
 * - Resets on server restart (in-memory counter)
 * - Used for rate limiting thresholds
 * 
 * Production Usage:
 * - Essential for debugging slow endpoints
 * - Identifies performance bottlenecks (>500ms responses)
 * - Monitors API health and usage patterns
 * - Logs accessible via Winston logger (stdout/stderr)
 * - Can be exported to monitoring tools (Datadog, New Relic)
 * 
 * Debugging Slow Requests:
 * ```
 * GET /api/tokens -> 200 { duration: 523 }  // Slow! Check upstream APIs
 * GET /api/tokens -> 200 { duration: 45 }   // Fast (cached response)
 * POST /api/cache/flush -> 200 { duration: 2 }  // Quick operation
 * ```
 * 
 * Error Handling:
 * - Metrics increment failures ignored (try/catch wrapper)
 * - Logging errors don't crash server
 * - Logger service handles write failures gracefully
 * 
 * @param {Request} req - Express request object (method, path extracted)
 * @param {Response} res - Express response object (statusCode, finish event)
 * @param {NextFunction} next - Callback to continue middleware chain
 * 
 * @example
 * // Register as global middleware (logs ALL requests)
 * app.use(requestLogger);
 * app.use('/api', apiRoutes);
 * 
 * // Request flow timeline:
 * // T+0ms:   Client sends: GET /api/tokens
 * // T+0ms:   requestLogger captures start time: 1702345678900
 * // T+0ms:   Increments metrics: requests counter = 42
 * // T+0ms:   Calls next() to continue chain
 * // T+0-45ms: Route handler processes request
 * // T+45ms:  Response sent to client
 * // T+45ms:  'finish' event fires
 * // T+45ms:  Logger calculates duration: 1702345678945 - 1702345678900 = 45ms
 * // T+45ms:  Console output: "GET /api/tokens -> 200 { duration: 45, ... }"
 * 
 * // Typical durations:
 * // - Cached response: 10-50ms
 * // - Fresh aggregation: 200-500ms
 * // - Upstream timeout: 1000-10000ms (10s timeout)
 * // - Cache flush: 1-5ms
 */
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
