/**
 * Phase 34 — automated backup runner (cron / npm run backup).
 * Usage: node scripts/runBackup.js [--church=ID]
 */
const { apply } = require('./applyBackups');
const { createFullBackup, createChurchBackup } = require('../utils/backup');

async function main() {
  await apply();
  const churchArg = process.argv.find((a) => a.startsWith('--church='));
  let job;
  if (churchArg) {
    const churchId = Number(churchArg.split('=')[1]);
    console.log(`Creating church backup for ${churchId}…`);
    job = await createChurchBackup(churchId, { createdBy: null });
  } else {
    console.log('Creating full platform backup…');
    job = await createFullBackup({ createdBy: null });
  }
  console.log(JSON.stringify({
    id: job.id,
    kind: job.kind,
    status: job.status,
    path: job.backup_path,
    sizeBytes: job.size_bytes,
    checksum: job.checksum
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
