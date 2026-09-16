/**
 * Phase 27: Support session table + audit_logs.support_session_id.
 */
const db = require('../database');

async function columnExists(table, column) {
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS support_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      superadmin_id INTEGER NOT NULL,
      superadmin_email TEXT,
      church_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'ended')),
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_support_sessions_active ON support_sessions(superadmin_id, status)'
  );
  await db.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_support_sessions_church ON support_sessions(church_id, started_at DESC)'
  );

  if (await columnExists('audit_logs', 'id')) {
    if (!(await columnExists('audit_logs', 'support_session_id'))) {
      await db.runAsync('ALTER TABLE audit_logs ADD COLUMN support_session_id INTEGER');
    }
  }

  console.log('Support access schema ensure complete.');
}

if (require.main === module) {
  apply()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { apply };
