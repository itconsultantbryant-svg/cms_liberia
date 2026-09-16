-- Phase: Multi-currency catalog (USD + LRD system-wide; admins can add more)
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
);

CREATE TABLE IF NOT EXISTS church_currencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  currency_code TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  is_enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(church_id, currency_code),
  FOREIGN KEY (church_id) REFERENCES churches(id) ON DELETE CASCADE,
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
);

CREATE INDEX IF NOT EXISTS idx_church_currencies_church ON church_currencies(church_id);
CREATE INDEX IF NOT EXISTS idx_currencies_active ON currencies(is_active);

INSERT OR IGNORE INTO currencies (code, name, symbol, decimal_places, is_system, is_active)
VALUES
  ('USD', 'US Dollar', '$', 2, 1, 1),
  ('LRD', 'Liberian Dollar', 'L$', 2, 1, 1);
