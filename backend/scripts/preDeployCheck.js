/**
 * Phase 39 — pre-deploy readiness check (fail closed for staging/production).
 *
 * Usage:
 *   NODE_ENV=production JWT_SECRET=... CORS_ORIGIN=... node scripts/preDeployCheck.js
 *   node scripts/preDeployCheck.js --env=development
 */
require('dotenv').config();
const { buildDeploymentChecklist, assertDeployReady } = require('../utils/deployment');
const { resolveEnvironment } = require('../config/environments');

function parseEnvArg() {
  const arg = process.argv.find(a => a.startsWith('--env='));
  if (arg) return arg.split('=')[1];
  return process.env.NODE_ENV || 'development';
}

function main() {
  const envName = parseEnvArg();
  const profile = resolveEnvironment(envName);
  // Temporarily assess as requested profile
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = profile.nodeEnv;

  console.log(`Phase 39 pre-deploy check (${profile.name})\n`);

  if (profile.name === 'development') {
    const report = buildDeploymentChecklist('development');
    for (const c of report.checks) {
      console.log(`  ${c.ok ? 'OK' : '!!'} [${c.severity}] ${c.id}: ${c.message}`);
    }
    console.log(`\nReady (dev advisory): ${report.ready ? 'yes' : 'with warnings'}`);
    process.env.NODE_ENV = prev;
    process.exit(0);
  }

  try {
    const report = assertDeployReady(profile.nodeEnv);
    for (const c of report.checks) {
      console.log(`  ${c.ok ? 'OK' : '!!'} [${c.severity}] ${c.id}: ${c.message}`);
    }
    console.log('\nPre-deploy check passed.');
    process.env.NODE_ENV = prev;
    process.exit(0);
  } catch (err) {
    if (err.report) {
      for (const c of err.report.checks) {
        console.log(`  ${c.ok ? 'OK' : '!!'} [${c.severity}] ${c.id}: ${c.message}`);
      }
    }
    console.error('\n' + err.message);
    process.env.NODE_ENV = prev;
    process.exit(1);
  }
}

main();
