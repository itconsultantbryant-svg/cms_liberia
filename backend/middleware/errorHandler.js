/**
 * Phase 31 — structured API errors + async wrapper + global handler.
 */

class ApiError extends Error {
  constructor(status, message, code = null, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status || 500;
    this.code = code;
    this.details = details;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: 'Route not found',
    code: 'NOT_FOUND',
    path: req.originalUrl || req.path
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  // express-validator style
  if (err.array && typeof err.array === 'function') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.array()
    });
  }

  if (status >= 500) {
    try {
      const { logger } = require('../utils/logger');
      logger.error('api_error', {
        requestId: req.requestId,
        message: err.message,
        code: err.code,
        stack: isProd ? undefined : err.stack
      });
    } catch (_) {
      console.error('[api]', err);
    }
  }

  res.status(status).json({
    success: false,
    error: err.message || 'Server error',
    message: err.message || 'Server error',
    code: err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
    ...(req.requestId ? { requestId: req.requestId } : {}),
    ...(err.details != null ? { details: err.details } : {}),
    ...(!isProd && status >= 500 && err.stack ? { stack: err.stack } : {})
  });
}

module.exports = {
  ApiError,
  asyncHandler,
  notFoundHandler,
  errorHandler
};
