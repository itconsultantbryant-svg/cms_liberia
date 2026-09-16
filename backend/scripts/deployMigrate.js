/**
 * Phase 39 — controlled migration entrypoint for deploy pipelines.
 * Runs `npm run migrate` with logging; refuses demo seed in production.
 */
require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');
const { logger } = require('../utils/logger');
const { isProductionLike } = require('../config/environments');

function main() {
  const env = process.env.NODE_ENV || 'development';
  logger.info('deploy_migrate_start', { env });

  if (isProductionLike() && process.env.RUN_DEMO_SEED === '1') {
    console.error('Refusing RUN_DEMO_SEED in staging/production during deploy migrate.');
    process.exit(1);
  }

  const result = spawnSync('npm', ['run', 'migrate'], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
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
