/**
 * Phase 31 — consistent API response helpers.
 * New endpoints should prefer these shapes; legacy `{ error }` remains supported.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordHash',
  'token_version',
  'tokenVersion',
  'reset_token',
  'resetToken',
  'reset_token_hash',
  'lock_until',
  'failed_login_attempts',
  'jwt_secret',
  'secret',
  'api_key',
  'apiKey'
]);

function stripSensitive(value, depth = 0) {
  if (value == null || depth > 8) return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripSensitive(v, depth + 1));
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k)) continue;
      out[k] = stripSensitive(v, depth + 1);
    }
    return out;
  }
  return value;
}

function ok(res, data = null, meta = undefined, status = 200) {
  const body = {
    success: true,
    data: data == null ? null : stripSensitive(data)
  };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

function fail(res, status, message, code = undefined, details = undefined) {
  const body = {
    success: false,
    error: message,
    message
  };
  if (code) body.code = code;
  if (details !== undefined) body.details = details;
  return res.status(status).json(body);
}

function created(res, data, meta) {
  return ok(res, data, meta, 201);
}

module.exports = {
  SENSITIVE_KEYS,
  stripSensitive,
  ok,
  fail,
  created
};
