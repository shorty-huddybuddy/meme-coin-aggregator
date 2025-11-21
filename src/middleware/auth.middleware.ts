import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';

/**
 * Logs API key authentication failures for security monitoring
 * 
 * Purpose:
 * Records failed authentication attempts with request context for audit trail.
 * Helps identify potential security threats and debugging auth issues.
 * 
 * Logged Information:
 * - Client IP address (for rate limiting/blocking)
 * - HTTP method (GET, POST, etc.)
 * - Request path (endpoint being accessed)
 * - Attempted key value (for debugging valid key issues)
 * 
 * Implementation:
 * - Uses structured logging via logger.service
 * - Gracefully handles logger import failures (ignores if missing)
 * - Never throws errors (silent failure for reliability)
 * 
 * Security Considerations:
 * - Logs actual key attempt (be careful in production)
 * - IP address helps identify attack patterns
 * - Path reveals which endpoints are targeted
 * 
 * @param {Request} req - Express request object with IP and path info
 * @param {string} [keyAttempt] - API key that was attempted (optional)
 * 
 * @example
 * // Failed auth with key
 * logAuthFailure(req, 'invalid-key-123');
 * // Logs: { ip: '192.168.1.1', method: 'GET', path: '/api/tokens', key: 'invalid-key-123' }
 * 
 * // Failed auth without key
 * logAuthFailure(req);
 * // Logs: { ip: '192.168.1.1', method: 'GET', path: '/api/tokens', key: 'none' }
 */
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

/**
 * API Key authentication middleware
 * 
 * Purpose:
 * Validates incoming requests against configured API keys to prevent unauthorized access.
 * Implements flexible authentication with test environment bypass and open API mode.
 * 
 * Authentication Flow:
 * 1. Check if running in test environment (NODE_ENV === 'test') → skip validation
 * 2. Check if API_KEYS environment variable configured → if not, allow (open API)
 * 3. Extract API key from request headers (x-api-key or Authorization)
 * 4. Parse comma-separated valid keys from API_KEYS environment variable
 * 5. Compare provided key against allowed keys list
 * 6. Log authentication failures for security monitoring
 * 7. Throw ValidationError if key is invalid or missing
 * 
 * Headers Supported:
 * - x-api-key: Direct API key (e.g., "x-api-key: abc123")
 * - Authorization: Bearer token format (e.g., "Authorization: Bearer abc123")
 * 
 * Environment Modes:
 * 
 * 1. Test Mode (NODE_ENV=test):
 *    - Skips all authentication
 *    - Allows integration tests without real keys
 * 
 * 2. Open API Mode (no API_KEYS configured):
 *    - Allows all requests
 *    - Useful for development/public APIs
 * 
 * 3. Protected Mode (API_KEYS configured):
 *    - Requires valid key in request headers
 *    - Logs failures for monitoring
 * 
 * Key Configuration:
 * ```bash
 * # Single key
 * API_KEYS="mykey123"
 * 
 * # Multiple keys (comma-separated, supports key rotation)
 * API_KEYS="key1,key2,key3"
 * ```
 * 
 * Security Features:
 * - Keys stored in environment variables (never hardcoded)
 * - Failed attempts logged with IP, method, path, attempted key
 * - Test environment bypass for easier testing
 * - Multiple keys support for zero-downtime rotation
 * - Bearer token stripping for OAuth-style auth
 * 
 * Error Handling:
 * - Missing key: "Invalid or missing API key" (400)
 * - Invalid key: "Invalid or missing API key" (400)
 * - Both throw ValidationError caught by error handler
 * 
 * Performance:
 * - Minimal overhead: String operations only
 * - Early exit for test/open modes
 * - No database queries or async operations
 * 
 * @param {Request} req - Express request object with headers
 * @param {Response} _res - Express response object (unused, prefixed with _)
 * @param {NextFunction} next - Callback to pass control to next middleware
 * @throws {ValidationError} When API key is missing or invalid in protected mode
 * 
 * @example
 * // Valid request with x-api-key header
 * curl -H "x-api-key: mykey123" https://api.example.com/tokens
 * 
 * // Valid request with Authorization header
 * curl -H "Authorization: Bearer mykey123" https://api.example.com/tokens
 * 
 * // Configure multiple keys for rotation
 * export API_KEYS="production-key-1,production-key-2,backup-key"
 * 
 * // Test environment (skips auth)
 * NODE_ENV=test npm test
 */
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
