/**
 * Phase 36 — lightweight in-memory TTL cache for hot read endpoints.
 * Not a distributed cache; suitable for single-node SQLite deployments.
 */

class TtlCache {
  constructor({ defaultTtlMs = 15000, maxEntries = 500 } = {}) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  _purge() {
    const now = Date.now();
    for (const [k, v] of this.map) {
      if (v.expiresAt <= now) this.map.delete(k);
    }
    while (this.map.size > this.maxEntries) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this._purge();
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  invalidatePrefix(prefix) {
    for (const k of this.map.keys()) {
      if (String(k).startsWith(prefix)) this.map.delete(k);
    }
  }

  clear() {
    this.map.clear();
  }

  stats() {
    this._purge();
    return { size: this.map.size, maxEntries: this.maxEntries, defaultTtlMs: this.defaultTtlMs };
  }
}

const dashboardCache = new TtlCache({ defaultTtlMs: 20_000, maxEntries: 300 });

function cacheMiddleware(buildKey, { ttlMs = 20_000, cache = dashboardCache } = {}) {
  return async (req, res, next) => {
    try {
      const key = typeof buildKey === 'function' ? buildKey(req) : buildKey;
      if (!key) return next();
      const cached = cache.get(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(cached.status || 200).json(cached.body);
      }
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cache.set(key, { status: res.statusCode, body }, ttlMs);
        }
        res.setHeader('X-Cache', 'MISS');
        return originalJson(body);
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  TtlCache,
  dashboardCache,
  cacheMiddleware
};
