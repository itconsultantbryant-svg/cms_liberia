/**
 * Apply existing migrate chain against Postgres (Neon).
 * Uses the same apply* scripts; SQL is translated by database.js dialect layer.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migratePostgres.js
 */
require('dotenv').config();
const { isPostgres } = require('../utils/sqlDialect');

async function main() {
  if (!isPostgres()) {
    console.error('DATABASE_URL (or NEON_DATABASE_URL) is required for Postgres migrate.');
    process.exit(1);
  }

  const db = require('../database');
  await db.ping();
  console.log('Postgres reachable. Running migrate chain…');

  // Reuse the standard migrate npm script steps via child processes so apply scripts load fresh.
  const { spawnSync } = require('child_process');
  const path = require('path');
  const backend = path.join(__dirname, '..');

  const steps = [
    'scripts/runMigrations.js',
    'scripts/applyMultiTenant.js',
    'scripts/applyAuthSecurity.js',
    'scripts/applyPlatformSuperadmin.js',
    'scripts/applyBranchManagement.js',
    'scripts/applyRbac.js',
    'scripts/applyApprovalWorkflows.js',
    'scripts/applyMemberManagement.js',
    'scripts/applyHouseholds.js',
    'scripts/applyVisitors.js',
    'scripts/applyServicesAttendance.js',
    'scripts/applyFinanceAccounting.js',
    'scripts/applyPledgesDonations.js',
    'scripts/applyBudgets.js',
    'scripts/applyMinistries.js',
    'scripts/applyEvents.js',
    'scripts/applyPastoralCare.js',
    'scripts/applyCommunications.js',
    'scripts/applyStaffUsers.js',
    'scripts/applyDocuments.js',
    'scripts/applyAssets.js',
    'scripts/applyNotifications.js',
    'scripts/applyAuditLogging.js',
    'scripts/applySubscriptions.js',
    'scripts/applySupportAccess.js',
    'scripts/applyChurchSettings.js',
    'scripts/applyDashboardPreferences.js',
    'scripts/applyFileStorage.js',
    'scripts/applyBackups.js',
    'scripts/applyPerformanceIndexes.js',
    'scripts/applyChurchDomains.js',
    'scripts/applyCurrencies.js'
  ];

  for (const rel of steps) {
    console.log(`→ ${rel}`);
    const r = spawnSync(process.execPath, [path.join(backend, rel)], {
      cwd: backend,
      env: process.env,
      stdio: 'inherit'
    });
    if (r.status !== 0) {
      console.error(`Failed: ${rel} (exit ${r.status})`);
      process.exit(r.status || 1);
    }
  }

  console.log('Postgres migrate complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
