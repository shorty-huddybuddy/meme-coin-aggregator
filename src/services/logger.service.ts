import winston from 'winston';

/**
 * Winston logger instance for application-wide logging
 * 
 * Purpose:
 * Provides structured logging with timestamps and JSON formatting.
 * Centralized logging configuration for consistent log format.
 * 
 * Log Levels (in order of severity):
 * - error: Error messages (stderr)
 * - warn: Warning messages
 * - info: Informational messages (default level)
 * - http: HTTP request logs
 * - verbose: Detailed information
 * - debug: Debug information
 * - silly: Very detailed debug info
 * 
 * Configuration:
 * - Level: process.env.LOG_LEVEL || 'info'
 * - Format: JSON with timestamps
 * - Transport: Console output
 * - Error stream: stderr (error level only)
 * 
 * Format Example:
 * ```json
 * {
 *   "level": "info",
 *   "message": "Server started on port 3000",
 *   "timestamp": "2025-11-21T10:30:45.123Z"
 * }
 * ```
 * 
 * Usage:
 * ```typescript
 * import logger from './services/logger.service';
 * 
 * logger.info('Server started', { port: 3000 });
 * logger.warn('Redis connection slow', { latency: 500 });
 * logger.error('Database error', { error: err.message });
 * ```
 * 
 * Environment Variables:
 * - LOG_LEVEL: Sets minimum log level (default: 'info')
 *   - production: 'warn' or 'error'
 *   - development: 'debug' or 'silly'
 *   - testing: 'error' (suppress logs)
 * 
 * Production Considerations:
 * - JSON format enables log aggregation (ELK, Datadog, etc.)
 * - Timestamps in ISO 8601 format for parsing
 * - Error logs go to stderr (separate stream)
 * - Structured metadata supports log filtering
 * 
 * Performance:
 * - Console transport: Minimal overhead (<1ms)
 * - Async logging: Non-blocking I/O
 * - JSON serialization: Fast native support
 * 
 * @type {winston.Logger}
 * 
 * @example
 * // Structured logging with metadata
 * logger.info('GET /api/tokens -> 200', {
 *   duration: 45,
 *   method: 'GET',
 *   path: '/api/tokens',
 *   status: 200
 * });
 * // Output: {"level":"info","message":"GET /api/tokens -> 200","duration":45,...,"timestamp":"..."}
 * 
 * // Error logging
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   logger.error('Operation failed', { error: error.message, stack: error.stack });
 * }
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error']
    })
  ],
});

export default logger;
