-- Phase 1: Multi-tenant churches foundation
CREATE TABLE IF NOT EXISTS churches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  short_name TEXT,
  slug TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  country TEXT,
  city TEXT,
  address TEXT,
  website_url TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT DEFAULT '#2c3e50',
  secondary_color TEXT DEFAULT '#3498db',
  timezone TEXT DEFAULT 'Africa/Monrovia',
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'archived')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_churches_slug ON churches(slug);
CREATE INDEX IF NOT EXISTS idx_churches_status ON churches(status);

-- Campus / login accounts belong to a church (tenant)
ALTER TABLE branches ADD COLUMN church_id INTEGER REFERENCES churches(id);

CREATE INDEX IF NOT EXISTS idx_branches_church ON branches(church_id);
