/**
 * Phase 20: Staff & user management columns + invites.
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
  await ensureColumn('staff', 'church_id', 'ALTER TABLE staff ADD COLUMN church_id INTEGER');
  await ensureColumn('staff', 'photo_url', 'ALTER TABLE staff ADD COLUMN photo_url TEXT');
  await ensureColumn('staff', 'job_title', 'ALTER TABLE staff ADD COLUMN job_title TEXT');
  await ensureColumn('staff', 'status', "ALTER TABLE staff ADD COLUMN status TEXT DEFAULT 'active'");

  await ensureColumn('sub_users', 'phone', 'ALTER TABLE sub_users ADD COLUMN phone TEXT');
  await ensureColumn('sub_users', 'photo_url', 'ALTER TABLE sub_users ADD COLUMN photo_url TEXT');
  await ensureColumn('sub_users', 'job_title', 'ALTER TABLE sub_users ADD COLUMN job_title TEXT');
  await ensureColumn('sub_users', 'department_id', 'ALTER TABLE sub_users ADD COLUMN department_id INTEGER');
  await ensureColumn('sub_users', 'status', "ALTER TABLE sub_users ADD COLUMN status TEXT DEFAULT 'active'");

  await ensureColumn('branches', 'phone', 'ALTER TABLE branches ADD COLUMN phone TEXT');
  await ensureColumn('branches', 'photo_url', 'ALTER TABLE branches ADD COLUMN photo_url TEXT');
  await ensureColumn('branches', 'job_title', 'ALTER TABLE branches ADD COLUMN job_title TEXT');

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS user_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      branch_id INTEGER,
      email TEXT NOT NULL,
      firstname TEXT,
      lastname TEXT,
      phone TEXT,
      job_title TEXT,
      department_id INTEGER,
      role_code TEXT,
      account_type TEXT DEFAULT 'branch',
      token_hash TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      invited_by INTEGER,
      accepted_user_id INTEGER,
      accepted_user_type TEXT,
      expires_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_user_invites_church ON user_invites(church_id)');

  // Backfill staff church_id / job_title / status
  await db.runAsync(`
    UPDATE staff SET church_id = (
      SELECT church_id FROM branches WHERE branches.id = staff.branch_id
    ) WHERE church_id IS NULL
  `);
  await db.runAsync(`UPDATE staff SET job_title = position WHERE job_title IS NULL AND position IS NOT NULL`);
  await db.runAsync(`UPDATE staff SET status = CASE WHEN is_active = 0 THEN 'suspended' ELSE 'active' END WHERE status IS NULL`);
  await db.runAsync(`UPDATE sub_users SET status = CASE WHEN is_active = 0 THEN 'suspended' ELSE 'active' END WHERE status IS NULL`);
  await db.runAsync(`UPDATE sub_users SET job_title = position WHERE job_title IS NULL AND position IS NOT NULL`);

  // Ensure pastor roles can manage staff
  for (const code of ['RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'SENIOR_PASTOR', 'BRANCH_PASTOR', 'PRESIDENT']) {
    const role = await db.getAsync(
      `SELECT id FROM roles WHERE role_code = ? AND church_id IS NULL`,
      [code]
    );
    if (role) {
      await db.runAsync(
        `INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, 'staff.manage')`,
        [role.id]
      );
      await db.runAsync(
        `INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, 'users.manage')`,
        [role.id]
      );
    }
  }
  // Pastors get staff; only PRESIDENT/MISSION keep full users — revoke users.manage from pastors
  for (const code of ['RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'SENIOR_PASTOR', 'BRANCH_PASTOR']) {
    const role = await db.getAsync(
      `SELECT id FROM roles WHERE role_code = ? AND church_id IS NULL`,
      [code]
    );
    if (role) {
      await db.runAsync(
        `DELETE FROM role_permissions WHERE role_id = ? AND perm_key = 'users.manage'`,
        [role.id]
      );
    }
  }

  console.log('Staff & user management schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
