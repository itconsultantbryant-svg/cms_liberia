/**
 * Phase 35 — request security middleware (Origin check, XSS scrub on body strings).
 */
const { containsDangerousHtml } = require('../utils/securityHardening');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * For mutating requests with an Origin header, require it to be allowed.
 * Bearer-token APIs are largely CSRF-resistant; this adds defense in depth.
 */
function originCheck(allowedOrigins) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next(); // non-browser / same-origin tooling
    if (allowedOrigins.includes(origin)) return next();
    if (process.env.NODE_ENV !== 'production') {
      const dev = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3004',
        'http://127.0.0.1:3004',
        'http://localhost:5000',
        'http://127.0.0.1:5000'
      ];
      if (dev.includes(origin)) return next();
    }
    return res.status(403).json({
      success: false,
      error: 'Origin not allowed',
      code: 'ORIGIN_DENIED'
    });
  };
}

function scrubDangerousStrings(value, path = '') {
  if (typeof value === 'string') {
    if (containsDangerousHtml(value)) {
      const err = new Error(`Disallowed content in ${path || 'body'}`);
      err.status = 400;
      err.code = 'XSS_REJECTED';
      throw err;
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scrubDangerousStrings(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      // Skip passwords / tokens from XSS pattern (they shouldn't contain HTML anyway)
      if (/password|token|secret/i.test(k)) continue;
      scrubDangerousStrings(v, path ? `${path}.${k}` : k);
    }
  }
}

function rejectDangerousBody(req, res, next) {
  try {
    if (req.body) scrubDangerousStrings(req.body);
    next();
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: err.message,
      code: err.code || 'XSS_REJECTED'
    });
  }
}

module.exports = {
  originCheck,
  rejectDangerousBody
};
