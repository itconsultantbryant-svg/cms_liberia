-- Phase 20: Staff & user management enhancements

CREATE TABLE IF NOT EXISTS user_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  branch_id INTEGER,
  email TEXT NOT NULL,
  firstname TEXT,
  lastname TEXT,
  phone TEXT,
  job_title TEXT,
  department_id INTEGER,
  role_code TEXT,
  account_type TEXT DEFAULT 'branch',
  token_hash TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  invited_by INTEGER,
  accepted_user_id INTEGER,
  accepted_user_type TEXT,
  expires_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_invites_church ON user_invites(church_id);
CREATE INDEX IF NOT EXISTS idx_user_invites_email ON user_invites(email);
