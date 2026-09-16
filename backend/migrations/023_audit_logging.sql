-- Phase 25: Immutable audit logging
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER,
  branch_id INTEGER,
  user_id INTEGER,
  user_type TEXT,
  user_email TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  summary TEXT,
  previous_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_church_created ON audit_logs(church_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, user_type);
