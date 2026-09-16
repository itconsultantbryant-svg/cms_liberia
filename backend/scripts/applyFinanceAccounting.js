/**
 * Phase 13: Finance ledger tables + default categories/funds.
 */
const db = require('../database');

const INCOME = [
  ['Tithes', 'TITHES'],
  ['Offerings', 'OFFERINGS'],
  ['Donations', 'DONATIONS'],
  ['Pledges', 'PLEDGES'],
  ['Thanksgiving', 'THANKSGIVING'],
  ['Building Fund', 'BUILDING'],
  ['Missions', 'MISSIONS'],
  ['Special Contributions', 'SPECIAL'],
  ['Other Income', 'OTHER_IN']
];

const EXPENSE = [
  ['Utilities', 'UTILITIES'],
  ['Salaries & Allowances', 'SALARIES'],
  ['Maintenance', 'MAINT'],
  ['Ministry Expenses', 'MINISTRY'],
  ['Outreach & Missions', 'OUTREACH'],
  ['Office Supplies', 'OFFICE'],
  ['Travel', 'TRAVEL'],
  ['Other Expense', 'OTHER_EX']
];

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS finance_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      code TEXT,
      is_system INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS finance_funds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS finance_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      account_type TEXT DEFAULT 'general',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS finance_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      branch_id INTEGER,
      txn_type TEXT NOT NULL CHECK(txn_type IN ('income', 'expense')),
      category_id INTEGER,
      fund_id INTEGER,
      account_id INTEGER,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      payment_method TEXT DEFAULT 'cash'
        CHECK(payment_method IN ('cash', 'bank', 'mobile_money', 'check', 'card', 'other')),
      reference_number TEXT,
      txn_date TEXT NOT NULL,
      member_id INTEGER,
      donor_name TEXT,
      description TEXT,
      attachment_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft', 'pending', 'posted', 'voided')),
      entered_by INTEGER,
      approved_by INTEGER,
      approved_at TEXT,
      posted_at TEXT,
      voided_at TEXT,
      void_reason TEXT,
      reversal_of_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS finance_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      original_txn_id INTEGER NOT NULL,
      adjustment_txn_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_finance_txn_church_date ON finance_transactions(church_id, txn_date)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_finance_txn_status ON finance_transactions(status)');
  } catch (_) { /* ignore */ }

  // Platform default categories (church_id NULL)
  for (const [name, code] of INCOME) {
    const ex = await db.getAsync(
      `SELECT id FROM finance_categories WHERE church_id IS NULL AND code = ? AND type = 'income'`,
      [code]
    );
    if (!ex) {
      await db.runAsync(
        `INSERT INTO finance_categories (church_id, name, type, code, is_system, is_active)
         VALUES (NULL, ?, 'income', ?, 1, 1)`,
        [name, code]
      );
    }
  }
  for (const [name, code] of EXPENSE) {
    const ex = await db.getAsync(
      `SELECT id FROM finance_categories WHERE church_id IS NULL AND code = ? AND type = 'expense'`,
      [code]
    );
    if (!ex) {
      await db.runAsync(
        `INSERT INTO finance_categories (church_id, name, type, code, is_system, is_active)
         VALUES (NULL, ?, 'expense', ?, 1, 1)`,
        [name, code]
      );
    }
  }

  // Default General Fund + Cash account per church
  const churches = await db.allAsync('SELECT id FROM churches');
  for (const c of churches) {
    const fund = await db.getAsync(
      `SELECT id FROM finance_funds WHERE church_id = ? AND name = 'General Fund'`,
      [c.id]
    );
    if (!fund) {
      await db.runAsync(
        `INSERT INTO finance_funds (church_id, name, description) VALUES (?, 'General Fund', 'Primary operating fund')`,
        [c.id]
      );
    }
    const acct = await db.getAsync(
      `SELECT id FROM finance_accounts WHERE church_id = ? AND name = 'Cash'`,
      [c.id]
    );
    if (!acct) {
      await db.runAsync(
        `INSERT INTO finance_accounts (church_id, name, account_type) VALUES (?, 'Cash', 'cash')`,
        [c.id]
      );
    }
  }

  console.log('Finance accounting schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
