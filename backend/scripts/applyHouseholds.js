/**
 * Phase 10: Ensure households + household_members tables.
 */
const db = require('../database');

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS households (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      branch_id INTEGER,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      phone TEXT,
      notes TEXT,
      head_member_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS household_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      household_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      relationship TEXT NOT NULL DEFAULT 'other'
        CHECK(relationship IN ('head', 'spouse', 'child', 'dependent', 'other')),
      is_primary_contact INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      UNIQUE(household_id, member_id)
    )
  `);

  try {
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_households_church ON households(church_id)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_household_members_member ON household_members(member_id)');
  } catch (_) { /* ignore */ }

  console.log('Households schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
