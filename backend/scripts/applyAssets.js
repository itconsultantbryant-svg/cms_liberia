/**
 * Phase 22: Assets schema + permissions.
 */
const db = require('../database');

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      asset_code TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      purchase_value REAL,
      purchase_date TEXT,
      location TEXT,
      custodian_name TEXT,
      custodian_member_id INTEGER,
      custodian_staff_id INTEGER,
      condition_status TEXT DEFAULT 'good',
      status TEXT DEFAULT 'active',
      serial_number TEXT,
      document_id INTEGER,
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(church_id, asset_code)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS asset_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      asset_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      details TEXT,
      from_status TEXT,
      to_status TEXT,
      from_condition TEXT,
      to_condition TEXT,
      from_branch_id INTEGER,
      to_branch_id INTEGER,
      from_location TEXT,
      to_location TEXT,
      custodian_name TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS asset_maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      asset_id INTEGER NOT NULL,
      service_date TEXT NOT NULL,
      description TEXT NOT NULL,
      cost REAL DEFAULT 0,
      vendor TEXT,
      next_service_date TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )
  `);

  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_assets_church ON assets(church_id)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_asset_history_asset ON asset_history(asset_id)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_asset_maintenance_asset ON asset_maintenance(asset_id)');

  await db.runAsync(
    `INSERT OR IGNORE INTO permissions (perm_key, category, description) VALUES (?, ?, ?)`,
    ['assets.view', 'assets', 'View church assets & inventory']
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO permissions (perm_key, category, description) VALUES (?, ?, ?)`,
    ['assets.manage', 'assets', 'Manage church assets & inventory']
  );

  for (const code of [
    'PRESIDENT',
    'MISSION_SECRETARY',
    'CHURCH_ADMIN',
    'FINANCE_OFFICER',
    'RESIDENT_PASTOR',
    'RESIDENT_PASTOR_HQ',
    'BRANCH_ADMINISTRATOR',
    'HR_ADMIN_OFFICER'
  ]) {
    const role = await db.getAsync(
      `SELECT id FROM roles WHERE role_code = ? AND church_id IS NULL`,
      [code]
    );
    if (!role) continue;
    await db.runAsync(
      `INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, 'assets.view')`,
      [role.id]
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, 'assets.manage')`,
      [role.id]
    );
  }

  console.log('Assets schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
