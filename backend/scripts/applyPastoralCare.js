/**
 * Phase 18: Pastoral care tables + sensitive pastoral.* permissions.
 */
const db = require('../database');

const PASTORAL_PERMS = [
  ['pastoral.view', 'pastoral', 'View confidential pastoral care cases'],
  ['pastoral.manage', 'pastoral', 'Create and manage pastoral care cases']
];

const PASTOR_ROLES = [
  'RESIDENT_PASTOR',
  'RESIDENT_PASTOR_HQ',
  'SENIOR_PASTOR',
  'ASSOCIATE_PASTOR',
  'BRANCH_PASTOR',
  'PRESIDENT'
];

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS pastoral_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      case_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      member_id INTEGER,
      subject_name TEXT,
      status TEXT DEFAULT 'open',
      priority TEXT DEFAULT 'normal',
      confidentiality TEXT DEFAULT 'confidential',
      assigned_to_user_id INTEGER,
      assigned_to_user_type TEXT,
      follow_up_date TEXT,
      created_by INTEGER,
      created_by_type TEXT,
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS pastoral_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      case_id INTEGER NOT NULL,
      note_type TEXT DEFAULT 'note',
      body TEXT NOT NULL,
      is_sensitive INTEGER DEFAULT 1,
      created_by INTEGER,
      created_by_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES pastoral_cases(id) ON DELETE CASCADE
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS pastoral_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      case_id INTEGER NOT NULL,
      visit_type TEXT NOT NULL,
      visit_date TEXT NOT NULL,
      visit_time TEXT,
      location TEXT,
      notes TEXT,
      visited_by_user_id INTEGER,
      visited_by_user_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES pastoral_cases(id) ON DELETE CASCADE
    )
  `);

  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_pastoral_cases_church ON pastoral_cases(church_id)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_pastoral_cases_status ON pastoral_cases(status)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_pastoral_notes_case ON pastoral_notes(case_id)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_pastoral_visits_case ON pastoral_visits(case_id)');

  for (const [key, category, description] of PASTORAL_PERMS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO permissions (perm_key, category, description) VALUES (?, ?, ?)`,
      [key, category, description]
    );
  }

  for (const roleCode of PASTOR_ROLES) {
    const role = await db.getAsync(
      `SELECT id FROM roles WHERE role_code = ? AND church_id IS NULL`,
      [roleCode]
    );
    if (!role) continue;
    for (const [key] of PASTORAL_PERMS) {
      await db.runAsync(
        `INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, ?)`,
        [role.id, key]
      );
    }
  }

  console.log('Pastoral care schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
