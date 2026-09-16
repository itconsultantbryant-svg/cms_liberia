/**
 * Ensure currencies catalog + backfill church_currencies for all churches.
 */
const db = require('../database');

const SYSTEM = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$' }
];

async function tableExists(name) {
  const row = await db.getAsync(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [name]
  );
  return !!row;
}

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS currencies (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      symbol TEXT,
      decimal_places INTEGER DEFAULT 2,
      is_system INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_by_church_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS church_currencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      currency_code TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      is_enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(church_id, currency_code)
    )
  `);
  await db.runAsync(
    `CREATE INDEX IF NOT EXISTS idx_church_currencies_church ON church_currencies(church_id)`
  );

  for (const c of SYSTEM) {
    await db.runAsync(
      `INSERT OR IGNORE INTO currencies (code, name, symbol, decimal_places, is_system, is_active)
       VALUES (?, ?, ?, 2, 1, 1)`,
      [c.code, c.name, c.symbol]
    );
    await db.runAsync(
      `UPDATE currencies SET is_system = 1, is_active = 1, name = COALESCE(name, ?), symbol = COALESCE(symbol, ?)
       WHERE code = ?`,
      [c.name, c.symbol, c.code]
    );
  }

  if (await tableExists('churches')) {
    const churches = await db.allAsync(`SELECT id, currency FROM churches`);
    for (const ch of churches) {
      const def = String(ch.currency || 'USD').toUpperCase();
      for (const code of ['USD', 'LRD']) {
        await db.runAsync(
          `INSERT OR IGNORE INTO church_currencies (church_id, currency_code, is_default, is_enabled)
           VALUES (?, ?, ?, 1)`,
          [ch.id, code, code === def ? 1 : 0]
        );
      }
      // If church default is a custom code already on churches.currency, ensure row exists
      if (def && !['USD', 'LRD'].includes(def)) {
        await db.runAsync(
          `INSERT OR IGNORE INTO currencies (code, name, symbol, is_system, is_active)
           VALUES (?, ?, ?, 0, 1)`,
          [def, def, def]
        );
        await db.runAsync(
          `INSERT OR IGNORE INTO church_currencies (church_id, currency_code, is_default, is_enabled)
           VALUES (?, ?, 1, 1)`,
          [ch.id, def]
        );
        await db.runAsync(
          `UPDATE church_currencies SET is_default = CASE WHEN currency_code = ? THEN 1 ELSE 0 END
           WHERE church_id = ?`,
          [def, ch.id]
        );
      } else {
        await db.runAsync(
          `UPDATE church_currencies SET is_default = CASE WHEN currency_code = ? THEN 1 ELSE 0 END
           WHERE church_id = ?`,
          [def === 'LRD' ? 'LRD' : 'USD', ch.id]
        );
      }
    }
  }

  // Relax legacy CHECK(currency IN ('USD','LRD')) on staff / requests so catalog currencies work
  await relaxLegacyCurrencyCheck('staff');
  await relaxLegacyCurrencyCheck('requests');

  console.log('Currencies schema ensure complete.');
}

async function relaxLegacyCurrencyCheck(table) {
  if (!(await tableExists(table))) return;
  const row = await db.getAsync(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
    [table]
  );
  if (!row?.sql || !/CHECK\s*\(\s*currency\s+IN\s*\(\s*'USD'\s*,\s*'LRD'\s*\)\s*\)/i.test(row.sql)) {
    return;
  }
  const newSql = row.sql.replace(
    /CHECK\s*\(\s*currency\s+IN\s*\(\s*'USD'\s*,\s*'LRD'\s*\)\s*\)/gi,
    ''
  );
  const tmp = `${table}_currency_relax`;
  await db.runAsync(`DROP TABLE IF EXISTS ${tmp}`);
  await db.runAsync(newSql.replace(new RegExp(`CREATE TABLE (IF NOT EXISTS )?${table}`, 'i'), `CREATE TABLE ${tmp}`));
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  const colList = cols.map((c) => c.name).join(', ');
  await db.runAsync(`INSERT INTO ${tmp} (${colList}) SELECT ${colList} FROM ${table}`);
  await db.runAsync(`DROP TABLE ${table}`);
  await db.runAsync(`ALTER TABLE ${tmp} RENAME TO ${table}`);
  console.log(`Relaxed currency CHECK on ${table}`);
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
