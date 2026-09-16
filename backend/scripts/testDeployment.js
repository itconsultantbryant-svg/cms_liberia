/**
 * Phase 39 — deployment readiness tests.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const {
  buildDeploymentChecklist,
  assertDeployReady
} = require('../utils/deployment');
const { ENVIRONMENTS, resolveEnvironment, isProductionLike } = require('../config/environments');
const { logger } = require('../utils/logger');

const PORT = process.env.PORT || 5000;

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

function request(pathName) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api${pathName}`,
        method: 'GET'
      },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => {
          let body = raw;
          try {
            body = JSON.parse(raw);
          } catch (_) { /* */ }
          resolve({ status: res.statusCode, body, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('Phase 39 deployment tests\n');

  assert(!!ENVIRONMENTS.development && !!ENVIRONMENTS.staging && !!ENVIRONMENTS.production, 'Three env profiles defined');
  assert(resolveEnvironment('staging').requireCorsOrigin === true, 'Staging requires CORS');
  assert(resolveEnvironment('production').allowDemoSeed === false, 'Production blocks demo seed');
  assert(isProductionLike('staging') && isProductionLike('production'), 'staging/production are prod-like');
  assert(!isProductionLike('development'), 'development is not prod-like');

  const prev = { ...process.env };
  process.env.NODE_ENV = 'development';
  delete process.env.JWT_SECRET;
  delete process.env.CORS_ORIGIN;
  delete process.env.DATABASE_PATH;
  const devReport = buildDeploymentChecklist('development');
  assert(devReport.environment === 'development', 'Dev checklist environment');
  assert(devReport.checks.length >= 8, 'Checklist has core checks');

  // Production without secrets must fail assertDeployReady
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'weak';
  delete process.env.CORS_ORIGIN;
  let failed = false;
  try {
    assertDeployReady('production');
  } catch (_) {
    failed = true;
  }
  assert(failed, 'assertDeployReady fails without strong prod secrets');

  // Production with proper secrets passes critical checks (may warn on DATABASE_PATH)
  process.env.JWT_SECRET = 'p'.repeat(40);
  process.env.CORS_ORIGIN = 'https://app.example.com';
  process.env.APP_URL = 'https://app.example.com';
  process.env.TRUST_PROXY = '1';
  process.env.DATABASE_PATH = path.join(__dirname, '../database.sqlite');
  const prodReport = buildDeploymentChecklist('production');
  assert(prodReport.checks.find(c => c.id === 'jwt_secret')?.ok, 'Prod JWT check ok');
  assert(prodReport.checks.find(c => c.id === 'cors_origin')?.ok, 'Prod CORS check ok');

  // Restore env for API calls
  Object.keys(process.env).forEach(k => {
    if (!(k in prev)) delete process.env[k];
  });
  Object.assign(process.env, prev);

  logger.info('deploy_test_log_probe', { probe: true });
  assert(true, 'logger emits without throwing');

  const health = await request('/health');
  assert(health.status === 200, 'GET /api/health');
  assert(health.body.status === 'ok' || health.body.data?.status === 'ok', 'health status ok');

  const ready = await request('/health/ready');
  assert(ready.status === 200 || ready.status === 503, `GET /api/health/ready (${ready.status})`);
  assert(ready.body.database === 'up' || ready.body.data?.database === 'up', 'ready reports database');
  assert(Array.isArray(ready.body.checks || ready.body.data?.checks), 'ready includes checks');
  assert(!!ready.headers['x-request-id'], 'X-Request-Id present');

  assert(fs.existsSync(path.join(__dirname, '../../DEPLOYMENT.md')), 'DEPLOYMENT.md exists');
  assert(fs.existsSync(path.join(__dirname, '../../render.yaml')), 'render.yaml exists');
  assert(fs.existsSync(path.join(__dirname, '../.env.production.example')), 'production env example');
  assert(fs.existsSync(path.join(__dirname, '../.env.staging.example')), 'staging env example');

  console.log('\nPhase 39 deployment tests passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
