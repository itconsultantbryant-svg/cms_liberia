/**
 * Phase 16: Extend groups into ministries + related tables.
 */
const db = require('../database');

const DEFAULTS = [
  ['Choir', 'choir', 'Music and worship choir'],
  ['Youth Ministry', 'youth', 'Youth fellowship and discipleship'],
  ['Women Ministry', 'women', 'Women fellowship'],
  ['Men Ministry', 'men', 'Men fellowship'],
  ["Children's Ministry", 'children', 'Children and Sunday school'],
  ['Evangelism', 'evangelism', 'Outreach and evangelism'],
  ['Media', 'media', 'Media and communications'],
  ['Ushering', 'ushering', 'Ushering and hospitality'],
  ['Prayer Ministry', 'prayer', 'Prayer and intercession']
];

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
  await ensureColumn('groups', 'church_id', 'ALTER TABLE groups ADD COLUMN church_id INTEGER');
  await ensureColumn('groups', 'category', "ALTER TABLE groups ADD COLUMN category TEXT DEFAULT 'custom'");
  await ensureColumn('groups', 'description', 'ALTER TABLE groups ADD COLUMN description TEXT');
  await ensureColumn('groups', 'leader_member_id', 'ALTER TABLE groups ADD COLUMN leader_member_id INTEGER');
  await ensureColumn(
    'groups',
    'assistant_leader_member_id',
    'ALTER TABLE groups ADD COLUMN assistant_leader_member_id INTEGER'
  );
  await ensureColumn('groups', 'meeting_day', 'ALTER TABLE groups ADD COLUMN meeting_day TEXT');
  await ensureColumn('groups', 'meeting_time', 'ALTER TABLE groups ADD COLUMN meeting_time TEXT');
  await ensureColumn('groups', 'meeting_location', 'ALTER TABLE groups ADD COLUMN meeting_location TEXT');
  await ensureColumn('groups', 'is_active', 'ALTER TABLE groups ADD COLUMN is_active INTEGER DEFAULT 1');

  await ensureColumn('group_members', 'role', "ALTER TABLE group_members ADD COLUMN role TEXT DEFAULT 'member'");
  await ensureColumn('group_members', 'church_id', 'ALTER TABLE group_members ADD COLUMN church_id INTEGER');

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS group_meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      meeting_date TEXT NOT NULL,
      title TEXT,
      notes TEXT,
      attendance_count INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS group_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS group_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      doc_type TEXT DEFAULT 'other',
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS ministry_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT
    )
  `);

  for (const [code, name, category, description] of [
    ['choir', 'Choir', 'choir', 'Music and worship choir'],
    ['youth', 'Youth Ministry', 'youth', 'Youth fellowship'],
    ['women', 'Women Ministry', 'women', 'Women fellowship'],
    ['men', 'Men Ministry', 'men', 'Men fellowship'],
    ['children', "Children's Ministry", 'children', 'Children ministry'],
    ['evangelism', 'Evangelism', 'evangelism', 'Outreach'],
    ['media', 'Media', 'media', 'Media team'],
    ['ushering', 'Ushering', 'ushering', 'Ushering'],
    ['prayer', 'Prayer Ministry', 'prayer', 'Prayer ministry']
  ]) {
    await db.runAsync(
      `INSERT OR IGNORE INTO ministry_templates (code, name, category, description) VALUES (?, ?, ?, ?)`,
      [code, name, category, description]
    );
  }

  // Backfill church_id on groups
  await db.runAsync(`
    UPDATE groups SET church_id = (
      SELECT church_id FROM branches WHERE branches.id = groups.branch_id
    ) WHERE church_id IS NULL
  `);

  // Seed default ministries for branches with none
  const branches = await db.allAsync('SELECT id, church_id FROM branches WHERE church_id IS NOT NULL');
  for (const b of branches) {
    const count = await db.getAsync('SELECT COUNT(*) as c FROM groups WHERE branch_id = ?', [b.id]);
    if ((count?.c || 0) > 0) continue;
    for (const [name, category, description] of DEFAULTS) {
      await db.runAsync(
        `INSERT INTO groups (branch_id, church_id, name, category, description, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [b.id, b.church_id, name, category, description]
      );
    }
    console.log(`Seeded ministries for branch ${b.id}`);
  }

  console.log('Ministries schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
