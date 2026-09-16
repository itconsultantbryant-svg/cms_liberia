/**
 * Phase 37 — Unified test runner.
 * Runs unit → authorization → multi-tenant matrix → E2E,
 * then a curated set of existing phase regression scripts.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const CORE = [
  { name: 'unit', script: 'testUnit.js' },
  { name: 'authorization', script: 'testAuthorization.js' },
  { name: 'multi-tenant-matrix', script: 'testMultiTenantMatrix.js' },
  { name: 'e2e-workflow', script: 'testE2EWorkflow.js' }
];

const REGRESSION = [
  { name: 'tenant-isolation', script: 'testTenantIsolation.js' },
  { name: 'auth-security', script: 'testAuthSecurity.js' },
  { name: 'rbac', script: 'testRbac.js' },
  { name: 'security', script: 'testSecurityHardening.js' },
  { name: 'files', script: 'testFileStorage.js' },
  { name: 'perf', script: 'testPerformance.js' }
];

function runScript(label, script, extraEnv = {}) {
  console.log(`\n======== ${label} ========`);
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      AUTH_RATE_LIMIT: process.env.AUTH_RATE_LIMIT || '500',
      API_RATE_LIMIT: process.env.API_RATE_LIMIT || '2000',
      WRITE_RATE_LIMIT: process.env.WRITE_RATE_LIMIT || '1000',
      ...extraEnv
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status}`);
  }
  return true;
}

function main() {
  const skipRegression = process.argv.includes('--core-only');
  const started = Date.now();
  const results = [];

  console.log('Phase 37 test suite');
  console.log(`API expected on PORT=${process.env.PORT || 5000}`);

  for (const t of CORE) {
    runScript(t.name, t.script);
    results.push({ name: t.name, ok: true });
  }

  if (!skipRegression) {
    for (const t of REGRESSION) {
      try {
        runScript(t.name, t.script);
        results.push({ name: t.name, ok: true });
      } catch (err) {
        console.error(err.message);
        results.push({ name: t.name, ok: false, error: err.message });
        // Fail fast on regression failures
        printSummary(results, started);
        process.exit(1);
      }
    }
  }

  printSummary(results, started);
  console.log('\nPhase 37 suite passed.');
}

function printSummary(results, started) {
  console.log('\n-------- Summary --------');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  }
  console.log(`Elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('\n' + err.message);
    process.exit(1);
  }
}

module.exports = { main, CORE, REGRESSION };
