-- Phase 27: Superadmin support access / impersonation sessions
CREATE TABLE IF NOT EXISTS support_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  superadmin_id INTEGER NOT NULL,
  superadmin_email TEXT,
  church_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'ended')),
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_sessions_active
  ON support_sessions(superadmin_id, status);
CREATE INDEX IF NOT EXISTS idx_support_sessions_church
  ON support_sessions(church_id, started_at DESC);
