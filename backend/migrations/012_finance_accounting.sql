-- Phase 13: Finance & accounting ledger
CREATE TABLE IF NOT EXISTS finance_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  code TEXT,
  is_system INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_funds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT DEFAULT 'general',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS finance_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  original_txn_id INTEGER NOT NULL,
  adjustment_txn_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (original_txn_id) REFERENCES finance_transactions(id),
  FOREIGN KEY (adjustment_txn_id) REFERENCES finance_transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_finance_txn_church_date ON finance_transactions(church_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_finance_txn_status ON finance_transactions(status);
CREATE INDEX IF NOT EXISTS idx_finance_cat_type ON finance_categories(type);
