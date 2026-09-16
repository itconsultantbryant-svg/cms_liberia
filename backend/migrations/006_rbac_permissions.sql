-- Phase 7: Granular RBAC
ALTER TABLE roles ADD COLUMN scope TEXT DEFAULT 'church';
ALTER TABLE roles ADD COLUMN church_id INTEGER;
ALTER TABLE roles ADD COLUMN is_system INTEGER DEFAULT 1;
ALTER TABLE roles ADD COLUMN is_custom INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  perm_key TEXT UNIQUE NOT NULL,
  category TEXT,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL,
  perm_key TEXT NOT NULL,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE(role_id, perm_key)
);

CREATE INDEX IF NOT EXISTS idx_roles_church ON roles(church_id);
CREATE INDEX IF NOT EXISTS idx_roles_scope ON roles(scope);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_key ON role_permissions(perm_key);
