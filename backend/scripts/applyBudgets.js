/**
 * Phase 15: Ensure budgets + budget_lines tables.
 */
const db = require('../database');

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      branch_id INTEGER,
      name TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft', 'submitted', 'approved', 'active', 'closed')),
      currency TEXT DEFAULT 'USD',
      notes TEXT,
      total_income REAL DEFAULT 0,
      total_expense REAL DEFAULT 0,
      created_by INTEGER,
      submitted_by INTEGER,
      submitted_at TEXT,
      approved_by INTEGER,
      approved_at TEXT,
      activated_at TEXT,
      closed_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS budget_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      budget_id INTEGER NOT NULL,
      category_id INTEGER,
      line_type TEXT NOT NULL CHECK(line_type IN ('income', 'expense')),
      label TEXT,
      amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
    )
  `);

  try {
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_budgets_church_status ON budgets(church_id, status)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_budget_lines_budget ON budget_lines(budget_id)');
  } catch (_) { /* ignore */ }

  console.log('Budgets schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
