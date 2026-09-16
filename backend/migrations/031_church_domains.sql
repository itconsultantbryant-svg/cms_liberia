-- Phase 40: Custom domains & subdomain tenant mapping
CREATE TABLE IF NOT EXISTS church_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  domain TEXT NOT NULL COLLATE NOCASE,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(verification_status IN ('pending', 'verified', 'failed')),
  ssl_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(ssl_status IN ('pending', 'active', 'none', 'error')),
  is_primary INTEGER NOT NULL DEFAULT 0,
  verification_token TEXT,
  verified_at TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(domain),
  FOREIGN KEY (church_id) REFERENCES churches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_church_domains_church ON church_domains(church_id);
CREATE INDEX IF NOT EXISTS idx_church_domains_status ON church_domains(verification_status);
