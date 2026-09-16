/**
 * Phase 12: Extend service_types + seed defaults; attendance helper columns.
 */
const db = require('../database');

const DEFAULT_SERVICES = [
  ['Sunday Worship', 'sunday_worship', 'Main Sunday service'],
  ['Midweek Service', 'midweek', 'Midweek gathering'],
  ['Prayer Service', 'prayer', 'Prayer meeting'],
  ['Youth Service', 'youth', 'Youth ministry service'],
  ['Special Program', 'special', 'Special church program'],
  ['Conference', 'conference', 'Conference or camp meeting'],
  ['Custom Service', 'custom', 'Custom / other service']
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
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS service_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const [code, name, category, description] of [
    ['sunday_worship', 'Sunday Worship', 'sunday_worship', 'Main Sunday service'],
    ['midweek', 'Midweek Service', 'midweek', 'Midweek gathering'],
    ['prayer', 'Prayer Service', 'prayer', 'Prayer meeting'],
    ['youth', 'Youth Service', 'youth', 'Youth ministry service'],
    ['special', 'Special Program', 'special', 'Special church program'],
    ['conference', 'Conference', 'conference', 'Conference or camp meeting'],
    ['custom', 'Custom Service', 'custom', 'Custom / other service']
  ]) {
    await db.runAsync(
      `INSERT OR IGNORE INTO service_templates (code, name, category, description) VALUES (?, ?, ?, ?)`,
      [code, name, category, description]
    );
  }

  await ensureColumn('service_types', 'church_id', 'ALTER TABLE service_types ADD COLUMN church_id INTEGER');
  await ensureColumn('service_types', 'category', "ALTER TABLE service_types ADD COLUMN category TEXT DEFAULT 'custom'");
  await ensureColumn('service_types', 'description', 'ALTER TABLE service_types ADD COLUMN description TEXT');
  await ensureColumn('service_types', 'is_active', 'ALTER TABLE service_types ADD COLUMN is_active INTEGER DEFAULT 1');
  await ensureColumn('service_types', 'qr_enabled', 'ALTER TABLE service_types ADD COLUMN qr_enabled INTEGER DEFAULT 1');

  await ensureColumn('attendances', 'church_id', 'ALTER TABLE attendances ADD COLUMN church_id INTEGER');
  await ensureColumn('member_attendances', 'church_id', 'ALTER TABLE member_attendances ADD COLUMN church_id INTEGER');
  await ensureColumn('member_attendances', 'branch_id', 'ALTER TABLE member_attendances ADD COLUMN branch_id INTEGER');
  await ensureColumn(
    'member_attendances',
    'check_in_method',
    "ALTER TABLE member_attendances ADD COLUMN check_in_method TEXT DEFAULT 'manual'"
  );

  // Backfill church_id on service_types from branches
  await db.runAsync(`
    UPDATE service_types SET church_id = (
      SELECT church_id FROM branches WHERE branches.id = service_types.branch_id
    ) WHERE church_id IS NULL
  `);

  await db.runAsync(`
    UPDATE attendances SET church_id = (
      SELECT church_id FROM branches WHERE branches.id = attendances.branch_id
    ) WHERE church_id IS NULL
  `);

  // Seed defaults for branches that have no services
  const branches = await db.allAsync('SELECT id, church_id FROM branches WHERE church_id IS NOT NULL');
  for (const b of branches) {
    const count = await db.getAsync(
      'SELECT COUNT(*) as c FROM service_types WHERE branch_id = ?',
      [b.id]
    );
    if ((count?.c || 0) > 0) continue;
    for (const [name, category, description] of DEFAULT_SERVICES) {
      await db.runAsync(
        `INSERT INTO service_types (branch_id, church_id, name, category, description, is_active, qr_enabled)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
        [b.id, b.church_id, name, category, description]
      );
    }
    console.log(`Seeded default services for branch ${b.id}`);
  }

  console.log('Services & attendance schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
