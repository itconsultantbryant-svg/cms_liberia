-- Phase 6: Branch / campus management
ALTER TABLE branches ADD COLUMN is_headquarters INTEGER DEFAULT 0;
ALTER TABLE branches ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE branches ADD COLUMN phone TEXT;
ALTER TABLE branches ADD COLUMN pastor_name TEXT;
ALTER TABLE branches ADD COLUMN description TEXT;
ALTER TABLE branches ADD COLUMN logo_url TEXT;
ALTER TABLE branches ADD COLUMN is_login_enabled INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS user_branch_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  user_type TEXT NOT NULL CHECK(user_type IN ('branch', 'sub_user')),
  user_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_type, user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_branch_access_user ON user_branch_access(user_type, user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_church ON user_branch_access(church_id);
CREATE INDEX IF NOT EXISTS idx_branches_hq ON branches(church_id, is_headquarters);
