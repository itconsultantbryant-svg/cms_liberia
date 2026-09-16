/**
 * Phase 34: Ensure backup_jobs table.
 */
const db = require('../database');
const fs = require('fs');
const path = require('path');

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS backup_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK(kind IN ('full', 'church', 'config')),
      church_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'running', 'completed', 'failed', 'verified')),
      backup_path TEXT,
      size_bytes INTEGER,
      checksum TEXT,
      manifest_json TEXT,
      error_message TEXT,
      created_by INTEGER,
      verified_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);
  await db.runAsync(
    `CREATE INDEX IF NOT EXISTS idx_backup_jobs_created ON backup_jobs(created_at DESC)`
  );
  await db.runAsync(
    `CREATE INDEX IF NOT EXISTS idx_backup_jobs_church ON backup_jobs(church_id)`
  );

  const dir = path.join(__dirname, '../backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  console.log('Backup schema ensure complete.');
}

if (require.main === module) {
  apply()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { apply };
