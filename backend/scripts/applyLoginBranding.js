/**
 * Ensure churches.login_background_url exists (SQLite + Postgres).
 */
const db = require('../database');

async function columnExists(table, column) {
  if (db.dialect === 'postgres') {
    const row = await db.getAsync(
      `SELECT 1 AS ok FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
      [table, column]
    );
    return !!row;
  }
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

async function apply() {
  if (!(await columnExists('churches', 'login_background_url'))) {
    await db.runAsync('ALTER TABLE churches ADD COLUMN login_background_url TEXT');
    console.log('[applyLoginBranding] added churches.login_background_url');
  } else {
    console.log('[applyLoginBranding] login_background_url already present');
  }
}

if (require.main === module) {
  apply()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { apply };
