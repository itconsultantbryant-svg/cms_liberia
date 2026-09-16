/**
 * Phase 35 — security hardening helpers & audit checklist.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WEAK_JWT_VALUES = new Set([
  '',
  'your-secret-key',
  'secret',
  'changeme',
  'jwt_secret',
  'password',
  '123456'
]);

function assessJwtSecret(secret = process.env.JWT_SECRET, env = process.env.NODE_ENV) {
  const isProd = env === 'production';
  if (!secret || WEAK_JWT_VALUES.has(String(secret))) {
    return {
      ok: !isProd,
      severity: isProd ? 'critical' : 'warning',
      message: isProd
        ? 'JWT_SECRET must be a strong unique value in production'
        : 'Using weak/default JWT_SECRET (acceptable only in development)'
    };
  }
  if (String(secret).length < 32) {
    return {
      ok: !isProd,
      severity: isProd ? 'high' : 'warning',
      message: 'JWT_SECRET should be at least 32 characters'
    };
  }
  return { ok: true, severity: 'ok', message: 'JWT_SECRET looks configured' };
}

function assertProductionSecrets() {
  const { isProductionLike } = require('../config/environments');
  if (!isProductionLike()) return;
  const jwt = assessJwtSecret(process.env.JWT_SECRET, 'production');
  if (!jwt.ok) throw new Error(jwt.message);
  if (!process.env.CORS_ORIGIN || !String(process.env.CORS_ORIGIN).trim()) {
    throw new Error('CORS_ORIGIN must be set in production/staging (comma-separated allowlist)');
  }
}

/**
 * Stronger password policy (Phase 35).
 * Existing validatePassword length check remains; this adds complexity.
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { ok: false, error: 'Password is required' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, error: 'Password must include an uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, error: 'Password must include a lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: 'Password must include a number' };
  }
  return { ok: true };
}

/** Reject obvious XSS payload patterns in free-text fields (defense in depth). */
function containsDangerousHtml(value) {
  if (value == null || typeof value !== 'string') return false;
  return /<\s*script|javascript:|onerror\s*=|onload\s*=|<\s*iframe/i.test(value);
}

function assertSafeText(value, fieldName = 'field') {
  if (containsDangerousHtml(value)) {
    const err = new Error(`${fieldName} contains disallowed content`);
    err.status = 400;
    err.code = 'XSS_REJECTED';
    throw err;
  }
  return value;
}

/**
 * Scan source trees for accidental secret literals (heuristic).
 */
function scanForHardcodedSecrets(roots = []) {
  const findings = [];
  const patterns = [
    /JWT_SECRET\s*=\s*['"](?!your-secret-key|changeme)[^'"]{8,}['"]/,
    /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i,
    /-----BEGIN (RSA |EC )?PRIVATE KEY-----/
  ];
  const skipDirs = new Set([
    'node_modules',
    'build',
    'uploads',
    'backups',
    '.git',
    'coverage'
  ]);

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|jsx|ts|tsx|env|json|md)$/i.test(ent.name)) continue;
      if (ent.name === '.env.example') continue;
      let text;
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch (_) {
        continue;
      }
      // Skip this security module's own pattern strings
      if (full.includes('securityHardening.js') || full.includes('testSecurity')) continue;
      for (const re of patterns) {
        if (re.test(text)) {
          findings.push({ file: full, pattern: String(re) });
        }
      }
    }
  }

  roots.forEach(walk);
  return findings;
}

function buildSecurityChecklist(extra = {}) {
  const jwt = assessJwtSecret();
  const isProd = process.env.NODE_ENV === 'production';
  return {
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    auth: {
      bearerJwt: true,
      tokenVersionInvalidation: true,
      bruteForceLockout: true,
      passwordPolicy: 'min 8 + upper + lower + digit',
      debugResetDisabledInProduction: process.env.NODE_ENV === 'production'
        ? process.env.AUTH_DEBUG_RESET !== '1'
        : null
    },
    authorization: {
      rbacRequirePermission: true,
      superadminSeparated: true
    },
    tenantIsolation: {
      requireTenant: true,
      clientChurchIdScrubbed: true,
      automatedTests: 'npm run test:tenant'
    },
    injection: {
      parameterizedQueries: true,
      note: 'Application uses sqlite3 bound parameters; avoid string-concat SQL'
    },
    xss: {
      helmet: true,
      dangerousHtmlReject: true,
      reactEscapesByDefault: true
    },
    csrf: {
      model: 'stateless Bearer tokens (not cookie session)',
      originCheckOnMutations: true,
      note: 'CSRF risk is low when Authorization header is required; Origin checked on mutating API calls'
    },
    fileUploads: {
      tenantPaths: true,
      mimeExtensionSizeValidation: true,
      privateFilesNotPubliclyStatic: true
    },
    rateLimiting: {
      api: true,
      write: true,
      auth: true
    },
    headers: {
      helmet: true
    },
    secrets: {
      jwt: jwt,
      corsOriginRequiredInProduction: isProd ? !!(process.env.CORS_ORIGIN) : null,
      notInFrontendBundle: true
    },
    sessionCookie: {
      authTransport: 'Authorization: Bearer',
      httpOnlyCookiesForAuth: false,
      note: 'No auth cookies issued — Prefer Bearer for SPA'
    },
    ...extra
  };
}

function randomSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = {
  WEAK_JWT_VALUES,
  assessJwtSecret,
  assertProductionSecrets,
  validatePasswordStrength,
  containsDangerousHtml,
  assertSafeText,
  scanForHardcodedSecrets,
  buildSecurityChecklist,
  randomSecret
};
