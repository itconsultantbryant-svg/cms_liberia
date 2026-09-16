/**
 * Phase 21: Document library schema + permissions.
 */
const db = require('../database');

const CATEGORIES = [
  ['church', 'Church documents', 'General church documents'],
  ['policies', 'Policies', 'Policies and guidelines'],
  ['financial', 'Financial documents', 'Finance and accounting documents'],
  ['member', 'Member documents', 'Member-related files'],
  ['minutes', 'Meeting minutes', 'Meeting minutes and records'],
  ['reports', 'Reports', 'Operational and ministry reports'],
  ['certificates', 'Certificates', 'Certificates and credentials'],
  ['evidence', 'Supporting evidence', 'Supporting evidence and attachments']
];

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS document_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS church_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      branch_id INTEGER,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      visibility TEXT DEFAULT 'church',
      member_id INTEGER,
      group_id INTEGER,
      event_id INTEGER,
      current_version INTEGER DEFAULT 1,
      filename TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      file_size INTEGER,
      uploaded_by INTEGER,
      uploaded_by_type TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      church_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      file_size INTEGER,
      notes TEXT,
      uploaded_by INTEGER,
      uploaded_by_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES church_documents(id) ON DELETE CASCADE,
      UNIQUE(document_id, version)
    )
  `);

  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_church_documents_church ON church_documents(church_id)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_church_documents_category ON church_documents(category)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id)');

  for (const [code, name, description] of CATEGORIES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO document_categories (code, name, description) VALUES (?, ?, ?)`,
      [code, name, description]
    );
  }

  await db.runAsync(
    `INSERT OR IGNORE INTO permissions (perm_key, category, description) VALUES (?, ?, ?)`,
    ['documents.view', 'documents', 'View church document library']
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO permissions (perm_key, category, description) VALUES (?, ?, ?)`,
    ['documents.manage', 'documents', 'Upload and manage church documents']
  );

  // Grant to common admin/pastor roles (not pastoral-sensitive)
  for (const code of [
    'PRESIDENT',
    'MISSION_SECRETARY',
    'CHURCH_ADMIN',
    'SENIOR_PASTOR',
    'RESIDENT_PASTOR',
    'RESIDENT_PASTOR_HQ',
    'SECRETARY',
    'BRANCH_ADMINISTRATOR',
    'BRANCH_SECRETARY',
    'FINANCE_OFFICER'
  ]) {
    const role = await db.getAsync(
      `SELECT id FROM roles WHERE role_code = ? AND church_id IS NULL`,
      [code]
    );
    if (!role) continue;
    await db.runAsync(
      `INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, 'documents.view')`,
      [role.id]
    );
    if (['SECRETARY', 'BRANCH_SECRETARY'].includes(code)) continue;
    await db.runAsync(
      `INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, 'documents.manage')`,
      [role.id]
    );
  }
  // Finance officer: view financial docs + manage
  // Secretaries: view only (already handled)

  console.log('Documents schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
