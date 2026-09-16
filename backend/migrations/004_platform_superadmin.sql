-- Phase 3: Platform Superadmin
ALTER TABLE branches ADD COLUMN is_platform_admin INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_branches_platform_admin ON branches(is_platform_admin);
