import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Create rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Express rate limiter for API endpoints
 * 
 * Purpose:
 * Prevents API abuse by limiting requests per IP address.
 * Protects against DoS attacks and excessive API usage.
 * 
 * Configuration:
 * - Window: 15 minutes (900,000ms)
 * - Max requests: 100 per window per IP
 * - Headers: Standard rate limit headers enabled
 * - Legacy headers: Disabled (uses RateLimit-* headers)
 * 
 * Response Headers:
 * - RateLimit-Limit: Maximum requests allowed
 * - RateLimit-Remaining: Requests remaining in window
 * - RateLimit-Reset: Time when limit resets
 * 
 * Rate Limit Response:
 * ```json
 * {
 *   "message": "Too many requests from this IP, please try again later."
 * }
 * ```
 * HTTP Status: 429 Too Many Requests
 * 
 * Implementation:
 * - IP-based limiting (extracts from req.ip)
 * - Sliding window algorithm
 * - In-memory store (resets on server restart)
 * 
 * Use Case:
 * Applied to all /api routes in index.ts:
 * ```typescript
 * app.use('/api', apiLimiter);
 * ```
 * 
 * Production Considerations:
 * - For distributed systems: Use Redis store
 * - For stricter limits: Reduce max to 50-60/window
 * - For public APIs: Consider tiered limits (free vs paid)
 * 
 * @type {RateLimitRequestHandler}
 */
export const apiLimiter = limiter;

/**
 * Security headers middleware
 * 
 * Purpose:
 * Adds security-related HTTP headers to all responses.
 * Protects against common web vulnerabilities.
 * 
 * Headers Added:
 * 
 * 1. X-Content-Type-Options: nosniff
 *    - Prevents MIME type sniffing
 *    - Forces browser to respect Content-Type header
 *    - Mitigates: Drive-by download attacks
 * 
 * 2. X-Frame-Options: DENY
 *    - Prevents page from being embedded in iframe
 *    - Mitigates: Clickjacking attacks
 *    - Alternative: Use frame-ancestors in CSP
 * 
 * 3. X-XSS-Protection: 1; mode=block
 *    - Enables browser XSS filter
 *    - Blocks page if XSS attack detected
 *    - Legacy header (modern browsers use CSP)
 * 
 * Additional Security Considerations:
 * For production, also add:
 * - Strict-Transport-Security (HSTS)
 * - Content-Security-Policy (CSP)
 * - Referrer-Policy
 * - Permissions-Policy
 * 
 * Integration:
 * Applied globally in index.ts:
 * ```typescript
 * app.use(securityMiddleware);
 * ```
 * 
 * Performance:
 * - Minimal overhead: Simple header setting
 * - No async operations
 * - <0.1ms per request
 * 
 * @param {Request} _req - Express request (unused)
 * @param {Response} res - Express response for setting headers
 * @param {NextFunction} next - Continue to next middleware
 * 
 * @example
 * // Response includes security headers
 * HTTP/1.1 200 OK
 * X-Content-Type-Options: nosniff
 * X-Frame-Options: DENY
 * X-XSS-Protection: 1; mode=block
 * Content-Type: application/json
 */
export default function securityMiddleware(_req: Request, res: Response, next: NextFunction) {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  next();
}