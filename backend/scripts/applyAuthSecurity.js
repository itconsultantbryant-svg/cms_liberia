/**
 * Ensure Phase 2 auth security columns/tables exist (idempotent).
 */
const db = require('../database');

async function columnExists(table, column) {
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function tableExists(table) {
  const row = await db.getAsync(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [table]
  );
  return !!row;
}

async function ensureColumn(table, column, ddl) {
  if (!(await tableExists(table))) return;
  if (await columnExists(table, column)) return;
  try {
    await db.runAsync(ddl);
    console.log(`Added ${table}.${column}`);
  } catch (e) {
    if (!String(e.message).includes('duplicate column')) {
      console.warn(`ensureColumn ${table}.${column}:`, e.message);
    }
  }
}

const AUTH_COLUMNS = [
  ['failed_login_attempts', 'INTEGER DEFAULT 0'],
  ['locked_until', 'TEXT'],
  ['token_version', 'INTEGER DEFAULT 0'],
  ['password_changed_at', 'TEXT'],
  ['mfa_enabled', 'INTEGER DEFAULT 0'],
  ['mfa_secret', 'TEXT']
];

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_type TEXT NOT NULL CHECK(account_type IN ('branch', 'sub_user')),
      account_id INTEGER NOT NULL,
      church_id INTEGER,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await db.runAsync(
      `CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens(token_hash)`
    );
    await db.runAsync(
      `CREATE INDEX IF NOT EXISTS idx_password_reset_account ON password_reset_tokens(account_type, account_id)`
    );
  } catch (_) { /* ignore */ }

  for (const table of ['branches', 'sub_users']) {
    for (const [col, type] of AUTH_COLUMNS) {
      await ensureColumn(table, col, `ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    }
  }

  console.log('Auth security schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
