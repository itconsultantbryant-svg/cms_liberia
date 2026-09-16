-- Phase 2: Authentication & Security
-- Lockout, token versioning, MFA readiness, password reset tokens

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_type TEXT NOT NULL CHECK(account_type IN ('branch', 'sub_user')),
  account_id INTEGER NOT NULL,
  church_id INTEGER,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_account ON password_reset_tokens(account_type, account_id);

-- branches auth columns (also ensured in applyAuthSecurity.js)
ALTER TABLE branches ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE branches ADD COLUMN locked_until TEXT;
ALTER TABLE branches ADD COLUMN token_version INTEGER DEFAULT 0;
ALTER TABLE branches ADD COLUMN password_changed_at TEXT;
ALTER TABLE branches ADD COLUMN mfa_enabled INTEGER DEFAULT 0;
ALTER TABLE branches ADD COLUMN mfa_secret TEXT;

-- sub_users auth columns
ALTER TABLE sub_users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE sub_users ADD COLUMN locked_until TEXT;
ALTER TABLE sub_users ADD COLUMN token_version INTEGER DEFAULT 0;
ALTER TABLE sub_users ADD COLUMN password_changed_at TEXT;
ALTER TABLE sub_users ADD COLUMN mfa_enabled INTEGER DEFAULT 0;
ALTER TABLE sub_users ADD COLUMN mfa_secret TEXT;
