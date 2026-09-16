-- Phase 22: Asset & inventory management

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
);

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
);

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
);

CREATE INDEX IF NOT EXISTS idx_assets_church ON assets(church_id);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
CREATE INDEX IF NOT EXISTS idx_asset_history_asset ON asset_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_asset ON asset_maintenance(asset_id);
