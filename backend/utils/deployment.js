/**
 * Phase 39 — production / staging deployment readiness assessment.
 */
const fs = require('fs');
const path = require('path');
const { assessJwtSecret } = require('./securityHardening');
const { resolveEnvironment, ENV_VAR_CATALOG, isProductionLike } = require('../config/environments');

function check(id, ok, severity, message, remediation = null) {
  return { id, ok: !!ok, severity, message, remediation };
}

function buildDeploymentChecklist(envName = process.env.NODE_ENV) {
  const profile = resolveEnvironment(envName);
  const isProdLike = isProductionLike(profile.nodeEnv);
  const jwt = assessJwtSecret(process.env.JWT_SECRET, profile.nodeEnv === 'staging' ? 'production' : profile.nodeEnv);
  const cors = String(process.env.CORS_ORIGIN || '').trim();
  const appUrl = String(process.env.APP_URL || '').trim();
  const hasDatabaseUrl = !!(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../database.sqlite');
  const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../uploads');
  const backupPath = process.env.BACKUP_PATH || path.join(__dirname, '../backups');

  const checks = [];

  checks.push(
    check(
      'node_env',
      !!profile.name,
      'info',
      `Environment profile: ${profile.name}`
    )
  );

  checks.push(
    check(
      'jwt_secret',
      jwt.ok || !profile.requireStrongJwt,
      profile.requireStrongJwt ? 'critical' : 'warning',
      jwt.message,
      'Set JWT_SECRET to a 32+ character random value'
    )
  );

  checks.push(
    check(
      'cors_origin',
      !profile.requireCorsOrigin || !!cors,
      profile.requireCorsOrigin ? 'critical' : 'info',
      cors ? `CORS_ORIGIN set (${cors.split(',').length} origin(s))` : 'CORS_ORIGIN not set',
      'Set CORS_ORIGIN to your https Vercel app origin(s)'
    )
  );

  checks.push(
    check(
      'app_url',
      !isProdLike || (appUrl.startsWith('https://') || appUrl.startsWith('http://localhost')),
      isProdLike ? 'high' : 'info',
      appUrl ? `APP_URL=${appUrl}` : 'APP_URL not set (password-reset / email links need it)',
      'Set APP_URL=https://your-app.vercel.app'
    )
  );

  checks.push(
    check(
      'database_url',
      !profile.recommendPersistentDb || hasDatabaseUrl || !!process.env.DATABASE_PATH,
      profile.recommendPersistentDb ? 'critical' : 'info',
      hasDatabaseUrl
        ? 'DATABASE_URL set (Neon/Postgres)'
        : process.env.DATABASE_PATH
          ? `DATABASE_PATH=${process.env.DATABASE_PATH} (SQLite)`
          : 'No DATABASE_URL or DATABASE_PATH — using default local SQLite',
      'Set DATABASE_URL to your Neon pooled connection string'
    )
  );

  const dbDir = path.dirname(dbPath);
  const dbWritable = hasDatabaseUrl
    ? true
    : (() => {
        try {
          if (!fs.existsSync(dbDir)) return false;
          fs.accessSync(dbDir, fs.constants.W_OK);
          return true;
        } catch (_) {
          return false;
        }
      })();

  checks.push(
    check(
      'database_writable',
      dbWritable,
      hasDatabaseUrl ? 'info' : 'critical',
      hasDatabaseUrl
        ? 'Postgres remote — local SQLite writability not required'
        : dbWritable
          ? `Database directory writable: ${dbDir}`
          : `Database directory not writable: ${dbDir}`,
      'Fix filesystem permissions or use Neon DATABASE_URL'
    )
  );

  for (const [label, p] of [
    ['uploads', uploadsPath],
    ['backups', backupPath]
  ]) {
    let ok = true;
    try {
      fs.mkdirSync(p, { recursive: true });
      fs.accessSync(p, fs.constants.W_OK);
    } catch (_) {
      ok = false;
    }
    checks.push(
      check(
        `${label}_storage`,
        ok,
        ok ? 'info' : 'high',
        ok ? `${label} path ready: ${p}` : `${label} path not writable: ${p}`,
        `Ensure ${label} directory exists on persistent storage`
      )
    );
  }

  const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
  checks.push(
    check(
      'email',
      !isProdLike || smtpConfigured,
      isProdLike ? 'medium' : 'info',
      smtpConfigured
        ? `SMTP configured (${process.env.SMTP_HOST})`
        : 'SMTP not configured — password reset emails will not send externally',
      'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM'
    )
  );

  const sslHint =
    appUrl.startsWith('https://') ||
    String(process.env.FORCE_SSL || '') === '1' ||
    !isProdLike;
  checks.push(
    check(
      'ssl_domain',
      sslHint,
      isProdLike ? 'high' : 'info',
      appUrl.startsWith('https://')
        ? 'APP_URL uses https (terminate TLS at reverse proxy / platform)'
        : 'Configure custom domain + SSL on the host (Render/Cloudflare/nginx)',
      'Point DNS to the service and enable HTTPS certificate'
    )
  );

  checks.push(
    check(
      'trust_proxy',
      !profile.trustProxyDefault || process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
      'medium',
      process.env.TRUST_PROXY
        ? `TRUST_PROXY=${process.env.TRUST_PROXY}`
        : 'TRUST_PROXY not set (recommended behind reverse proxies)',
      'Set TRUST_PROXY=1 on Render/nginx'
    )
  );

  checks.push(
    check(
      'backups',
      true,
      'info',
      `Backup retention ${process.env.BACKUP_RETENTION_DAYS || 14}d / max ${process.env.BACKUP_MAX_COUNT || 30} (Superadmin API + npm run backup)`
    )
  );

  checks.push(
    check(
      'monitoring',
      true,
      'info',
      process.env.SENTRY_DSN
        ? 'SENTRY_DSN set for error reporting'
        : 'Use /api/health + platform metrics; optional SENTRY_DSN for error reporting'
    )
  );

  checks.push(
    check(
      'logging',
      true,
      'info',
      `LOG_LEVEL=${process.env.LOG_LEVEL || (isProdLike ? 'info' : 'debug')}; JSON logs in staging/production`
    )
  );

  checks.push(
    check(
      'demo_seed_blocked',
      profile.allowDemoSeed || process.env.NODE_ENV === 'production',
      'info',
      profile.allowDemoSeed
        ? 'Demo seed allowed in this environment'
        : 'Demo seed blocked for production-like environments'
    )
  );

  const criticalFailed = checks.filter(c => !c.ok && (c.severity === 'critical' || c.severity === 'high'));
  const ready = criticalFailed.length === 0;

  return {
    generatedAt: new Date().toISOString(),
    environment: profile.name,
    ready,
    summary: {
      total: checks.length,
      passed: checks.filter(c => c.ok).length,
      failed: checks.filter(c => !c.ok).length,
      criticalFailed: criticalFailed.length
    },
    catalog: ENV_VAR_CATALOG,
    checks
  };
}

function assertDeployReady(envName) {
  const report = buildDeploymentChecklist(envName);
  if (!report.ready) {
    const failed = report.checks.filter(c => !c.ok && (c.severity === 'critical' || c.severity === 'high'));
    const msg = failed.map(f => `- [${f.severity}] ${f.id}: ${f.message}`).join('\n');
    const err = new Error(`Deployment readiness failed:\n${msg}`);
    err.report = report;
    throw err;
  }
  return report;
}

module.exports = {
  buildDeploymentChecklist,
  assertDeployReady
};
