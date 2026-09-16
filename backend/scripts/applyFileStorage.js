/**
 * Phase 33: Ensure stored_files registry.
 */
const db = require('../database');

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS stored_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      original_name TEXT,
      stored_name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      mime_type TEXT,
      extension TEXT,
      size_bytes INTEGER,
      visibility TEXT NOT NULL DEFAULT 'private'
        CHECK(visibility IN ('private', 'church', 'public_branding')),
      uploaded_by INTEGER,
      uploaded_by_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.runAsync(
    `CREATE INDEX IF NOT EXISTS idx_stored_files_church ON stored_files(church_id)`
  );
  await db.runAsync(
    `CREATE INDEX IF NOT EXISTS idx_stored_files_category ON stored_files(church_id, category)`
  );

  // Optional link column on church_documents
  try {
    await db.runAsync(
      `ALTER TABLE church_documents ADD COLUMN stored_file_id INTEGER`
    );
  } catch (_) { /* already exists */ }

  // Ensure tenant directory roots exist for known churches
  const { ensureChurchRoot } = require('../utils/fileStorage');
  const churches = await db.allAsync('SELECT id FROM churches');
  for (const c of churches) {
    ensureChurchRoot(c.id);
  }
  console.log('File storage schema ensure complete.');
}

if (require.main === module) {
  apply()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { apply };
