'use strict';

/**
 * Minimal in-memory, fixed-window rate limiter.
 *
 * Used on the authentication endpoints to slow down password guessing and
 * account-creation spam. It is per-process (fine for a single API instance);
 * a multi-instance deployment should back it with a shared store such as Redis.
 *
 * @param {object} opts
 * @param {number} opts.windowMs  window length in milliseconds
 * @param {number} opts.max       requests allowed per key per window
 * @param {string} [opts.message]
 * @param {(req) => string} [opts.keyGenerator]
 */
function rateLimit({ windowMs, max, message, keyGenerator } = {}) {
  const hits = new Map();
  const keyOf = keyGenerator || ((req) => req.ip || req.socket?.remoteAddress || 'unknown');

  // Periodically drop expired windows so the map cannot grow without bound.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, Math.max(windowMs, 60_000));
  sweep.unref();

  function limiter(req, res, next) {
    const now = Date.now();
    const key = keyOf(req);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((entry.resetAt - now) / 1000)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({
        error: message || 'Too many requests. Please wait a moment and try again.',
      });
    }
    return next();
  }

  limiter.reset = () => hits.clear();
  return limiter;
}

module.exports = { rateLimit };
