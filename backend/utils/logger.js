/**
 * Phase 39 — structured logger (stdout JSON in staging/production).
 */
const { isProductionLike } = require('../config/environments');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function currentLevel() {
  const name = String(process.env.LOG_LEVEL || (isProductionLike() ? 'info' : 'debug')).toLowerCase();
  return LEVELS[name] != null ? LEVELS[name] : LEVELS.info;
}

function write(level, message, meta = {}) {
  if (LEVELS[level] > currentLevel()) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    env: process.env.NODE_ENV || 'development',
    ...meta
  };
  const line = isProductionLike() ? JSON.stringify(entry) : `[${entry.ts}] ${level.toUpperCase()} ${message}${Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

const logger = {
  error: (msg, meta) => write('error', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  debug: (msg, meta) => write('debug', msg, meta)
};

function requestLogMiddleware(req, res, next) {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || `req_${Date.now().toString(36)}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    if (String(req.path || '').startsWith('/api/health')) return;
    logger.info('http', {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      ms: Date.now() - start
    });
  });
  next();
}

module.exports = { logger, requestLogMiddleware };
