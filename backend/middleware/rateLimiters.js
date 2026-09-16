/**
 * Phase 31 — shared rate limiters.
 */
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT || 300),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
    message: 'Too many requests. Please slow down.',
    code: 'RATE_LIMITED'
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: 'Too many attempts. Please try again later.',
    message: 'Too many attempts. Please try again later.',
    code: 'AUTH_RATE_LIMITED'
  }
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.WRITE_RATE_LIMIT || 120),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: (req) => !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method),
  message: {
    success: false,
    error: 'Too many write requests.',
    message: 'Too many write requests.',
    code: 'WRITE_RATE_LIMITED'
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  writeLimiter
};
