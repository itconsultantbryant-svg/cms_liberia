/**
 * Phase 39 — environment profiles (development / staging / production).
 * Values are declarative defaults + required keys; secrets stay in env files / host config.
 */

const ENVIRONMENTS = {
  development: {
    name: 'development',
    description: 'Local developer machines',
    nodeEnv: 'development',
    requireStrongJwt: false,
    requireCorsOrigin: false,
    allowDemoSeed: true,
    allowDebugReset: true,
    serveFrontendBuild: false,
    recommendPersistentDb: false,
    trustProxyDefault: false
  },
  staging: {
    name: 'staging',
    description: 'Pre-production validation (mirrors production controls)',
    nodeEnv: 'staging',
    requireStrongJwt: true,
    requireCorsOrigin: true,
    allowDemoSeed: false,
    allowDebugReset: false,
    serveFrontendBuild: true,
    recommendPersistentDb: true,
    trustProxyDefault: true
  },
  production: {
    name: 'production',
    description: 'Live customer traffic',
    nodeEnv: 'production',
    requireStrongJwt: true,
    requireCorsOrigin: true,
    allowDemoSeed: false,
    allowDebugReset: false,
    serveFrontendBuild: true,
    recommendPersistentDb: true,
    trustProxyDefault: true
  }
};

/** Env vars operators should configure per environment */
const ENV_VAR_CATALOG = [
  { key: 'NODE_ENV', requiredIn: ['staging', 'production'], purpose: 'Environment name' },
  { key: 'PORT', requiredIn: [], purpose: 'HTTP listen port (default 5000)' },
  { key: 'JWT_SECRET', requiredIn: ['staging', 'production'], purpose: 'JWT signing secret (32+ chars)' },
  { key: 'CORS_ORIGIN', requiredIn: ['staging', 'production'], purpose: 'Comma-separated browser origins' },
  { key: 'APP_URL', requiredIn: ['staging', 'production'], purpose: 'Public https URL of the app' },
  { key: 'DATABASE_PATH', requiredIn: ['production'], purpose: 'Persistent SQLite path (disk mount)' },
  { key: 'UPLOADS_PATH', requiredIn: [], purpose: 'Optional override for file storage root' },
  { key: 'BACKUP_PATH', requiredIn: [], purpose: 'Optional override for backup root' },
  { key: 'TRUST_PROXY', requiredIn: [], purpose: 'Set 1 behind Render/nginx for correct IPs' },
  { key: 'SMTP_HOST', requiredIn: [], purpose: 'Outbound email host (optional)' },
  { key: 'SMTP_PORT', requiredIn: [], purpose: 'SMTP port' },
  { key: 'SMTP_USER', requiredIn: [], purpose: 'SMTP username' },
  { key: 'SMTP_PASS', requiredIn: [], purpose: 'SMTP password / API key' },
  { key: 'SMTP_FROM', requiredIn: [], purpose: 'From address for system email' },
  { key: 'SENTRY_DSN', requiredIn: [], purpose: 'Optional error reporting DSN' },
  { key: 'LOG_LEVEL', requiredIn: [], purpose: 'error|warn|info|debug' },
  { key: 'BACKUP_RETENTION_DAYS', requiredIn: [], purpose: 'Backup retention window' },
  { key: 'BACKUP_MAX_COUNT', requiredIn: [], purpose: 'Max backup snapshots kept' }
];

function resolveEnvironment(name = process.env.NODE_ENV) {
  const key = String(name || 'development').toLowerCase();
  if (key === 'prod') return ENVIRONMENTS.production;
  if (key === 'stage') return ENVIRONMENTS.staging;
  return ENVIRONMENTS[key] || ENVIRONMENTS.development;
}

function isProductionLike(env = process.env.NODE_ENV) {
  const n = String(env || '').toLowerCase();
  return n === 'production' || n === 'staging' || n === 'prod' || n === 'stage';
}

module.exports = {
  ENVIRONMENTS,
  ENV_VAR_CATALOG,
  resolveEnvironment,
  isProductionLike
};
