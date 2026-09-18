/**
 * Phase 39 — controlled migration entrypoint for deploy pipelines.
 * Runs `npm run migrate` with logging; refuses demo seed in production.
 *
 * Neon tip: migrations should use the *direct* host (not `-pooler`).
 * If DATABASE_URL points at the pooler, we rewrite to the direct host unless
 * DATABASE_URL_MIGRATE is set explicitly.
 */
require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');
const { logger } = require('../utils/logger');
const { isProductionLike } = require('../config/environments');

function preferDirectNeonUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes('-pooler.')) {
      u.hostname = u.hostname.replace('-pooler.', '.');
      return u.toString();
    }
  } catch (_) {
    /* keep */
  }
  return url;
}

function main() {
  const env = process.env.NODE_ENV || 'development';
  logger.info('deploy_migrate_start', { env });

  if (isProductionLike() && process.env.RUN_DEMO_SEED === '1') {
    console.error('Refusing RUN_DEMO_SEED in staging/production during deploy migrate.');
    process.exit(1);
  }

  const childEnv = { ...process.env };
  const migrateUrl =
    process.env.DATABASE_URL_MIGRATE ||
    preferDirectNeonUrl(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);
  if (migrateUrl) {
    childEnv.DATABASE_URL = migrateUrl;
    childEnv.PG_POOL_MAX = childEnv.PG_POOL_MAX || '2';
    childEnv.PG_CONNECT_TIMEOUT_MS = childEnv.PG_CONNECT_TIMEOUT_MS || '90000';
    console.log(
      'Migrate using',
      migrateUrl.includes('-pooler.') ? 'pooled' : 'direct',
      'database host'
    );
  }

  const result = spawnSync('npm', ['run', 'migrate'], {
    cwd: path.join(__dirname, '..'),
    env: childEnv,
    encoding: 'utf8',
    shell: true
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    logger.error('deploy_migrate_failed', { status: result.status });
    process.exit(result.status || 1);
  }

  logger.info('deploy_migrate_complete', { env });
  console.log('Deploy migrations complete.');
  process.exit(0);
}

main();
