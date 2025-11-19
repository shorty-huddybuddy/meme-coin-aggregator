import { config } from '../config';

export class RateLimiter {
  private requestTimestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = config.rateLimit.dexScreener, windowMs: number = config.rateLimit.window) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async checkLimit(): Promise<boolean> {
    const now = Date.now();
    // Remove timestamps outside the current window
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    if (this.requestTimestamps.length >= this.maxRequests) {
      return false;
    }

    this.requestTimestamps.push(now);
    return true;
  }

  getRemainingRequests(): number {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < this.windowMs
    );
    return Math.max(0, this.maxRequests - this.requestTimestamps.length);
  }

  getResetTime(): number {
    if (this.requestTimestamps.length === 0) return 0;
    const oldest = this.requestTimestamps[0];
    return oldest + this.windowMs - Date.now();
  }
}

export async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries - 1) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
      const delay = exponentialDelay + jitter;

      console.log(`Attempt ${attempt + 1} failed. Retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type CursorPayload = { index: number; fingerprint?: string } | number;

export function generateCursor(payload: CursorPayload): string {
  // Normalize to an object so we can extend in future (fingerprint, timestamp)
  const obj = typeof payload === 'number' ? { index: payload } : payload;
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

export function decodeCursor(cursor: string): any {
  try {
    const str = Buffer.from(cursor, 'base64').toString('utf-8');
    // Try JSON decode first (new format)
    try {
      const parsed = JSON.parse(str);
      return parsed;
    } catch {
      // not JSON, fall back
    }

    // Fallback to legacy integer-only cursor
    const decoded = parseInt(str, 10);
    return { index: isNaN(decoded) ? 0 : decoded };
  } catch {
    return { index: 0 };
  }
}
