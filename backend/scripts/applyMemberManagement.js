/**
 * Phase 9: Ensure extended member profile columns + documents table.
 */
const db = require('../database');

const COLUMNS = [
  ['membership_id', 'ALTER TABLE members ADD COLUMN membership_id TEXT'],
  ['middlename', 'ALTER TABLE members ADD COLUMN middlename TEXT'],
  ['phone_alt', 'ALTER TABLE members ADD COLUMN phone_alt TEXT'],
  ['baptism_status', 'ALTER TABLE members ADD COLUMN baptism_status TEXT DEFAULT \'unknown\''],
  ['baptism_date', 'ALTER TABLE members ADD COLUMN baptism_date TEXT'],
  ['ministry', 'ALTER TABLE members ADD COLUMN ministry TEXT'],
  ['department', 'ALTER TABLE members ADD COLUMN department TEXT'],
  ['emergency_contact_name', 'ALTER TABLE members ADD COLUMN emergency_contact_name TEXT'],
  ['emergency_contact_phone', 'ALTER TABLE members ADD COLUMN emergency_contact_phone TEXT'],
  ['notes', 'ALTER TABLE members ADD COLUMN notes TEXT'],
  ['membership_status', "ALTER TABLE members ADD COLUMN membership_status TEXT DEFAULT 'Active'"]
];

async function columnExists(table, column) {
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function apply() {
  for (const [col, ddl] of COLUMNS) {
    if (!(await columnExists('members', col))) {
      await db.runAsync(ddl);
      console.log(`Added members.${col}`);
    }
  }

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS member_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      doc_type TEXT DEFAULT 'other',
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);

  try {
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_members_membership_id ON members(membership_id)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_members_membership_status ON members(membership_status)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_member_documents_member ON member_documents(member_id)');
  } catch (_) { /* ignore */ }

  // Backfill membership_status from legacy member_status
  await db.runAsync(`
    UPDATE members SET membership_status = 'Active'
    WHERE membership_status IS NULL OR membership_status = ''
  `);

  // Backfill membership_id where missing
  const missing = await db.allAsync(
    `SELECT id, church_id FROM members WHERE membership_id IS NULL OR membership_id = '' ORDER BY id`
  );
  for (const m of missing) {
    const mid = `MEM-${String(m.church_id || 0).padStart(3, '0')}-${String(m.id).padStart(5, '0')}`;
    await db.runAsync('UPDATE members SET membership_id = ? WHERE id = ?', [mid, m.id]);
  }
  if (missing.length) console.log(`Backfilled membership_id for ${missing.length} members`);

  console.log('Member management schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
