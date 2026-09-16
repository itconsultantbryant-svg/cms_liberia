/**
 * Ensure Phase 6 branch management columns/tables (idempotent).
 */
const db = require('../database');

async function columnExists(table, column) {
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function ensureColumn(table, column, ddl) {
  if (await columnExists(table, column)) return;
  await db.runAsync(ddl);
  console.log(`Added ${table}.${column}`);
}

async function apply() {
  const cols = [
    ['is_headquarters', 'INTEGER DEFAULT 0'],
    ['status', "TEXT DEFAULT 'active'"],
    ['phone', 'TEXT'],
    ['pastor_name', 'TEXT'],
    ['description', 'TEXT'],
    ['logo_url', 'TEXT'],
    ['is_login_enabled', 'INTEGER DEFAULT 1']
  ];
  for (const [col, type] of cols) {
    await ensureColumn('branches', col, `ALTER TABLE branches ADD COLUMN ${col} ${type}`);
  }

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS user_branch_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      user_type TEXT NOT NULL CHECK(user_type IN ('branch', 'sub_user')),
      user_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_type, user_id, branch_id)
    )
  `);
  try {
    await db.runAsync(
      `CREATE INDEX IF NOT EXISTS idx_user_branch_access_user ON user_branch_access(user_type, user_id)`
    );
    await db.runAsync(
      `CREATE INDEX IF NOT EXISTS idx_branches_hq ON branches(church_id, is_headquarters)`
    );
  } catch (_) { /* ignore */ }

  // Backfill: oldest branch per church (or code HQ) as headquarters
  const churches = await db.allAsync('SELECT id FROM churches');
  for (const c of churches) {
    const hq = await db.getAsync(
      `SELECT id FROM branches WHERE church_id = ? AND is_headquarters = 1 LIMIT 1`,
      [c.id]
    );
    if (!hq) {
      const first = await db.getAsync(
        `SELECT id FROM branches WHERE church_id = ? ORDER BY
           CASE WHEN UPPER(COALESCE(branchcode,'')) = 'HQ' THEN 0 ELSE 1 END, id ASC LIMIT 1`,
        [c.id]
      );
      if (first) {
        await db.runAsync(
          'UPDATE branches SET is_headquarters = 1 WHERE id = ?',
          [first.id]
        );
      }
    }
  }

  console.log('Branch management schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
