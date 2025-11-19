import UpstreamRateLimiter from './upstreamRateLimiter';
import { config } from '../config';

// Singletons for upstream services, configured from env
export const dexscreenerLimiter = new UpstreamRateLimiter(
  config.upstream.dexscreenerRatePerMinute,
  Math.max(1, Math.floor(config.upstream.dexscreenerRatePerMinute / 60)),
  config.upstream.dexscreenerConcurrency
);

export const jupiterLimiter = new UpstreamRateLimiter(
  config.upstream.jupiterRatePerMinute,
  Math.max(1, Math.floor(config.upstream.jupiterRatePerMinute / 60)),
  config.upstream.jupiterConcurrency
);

export default { dexscreenerLimiter, jupiterLimiter };
