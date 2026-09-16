-- Phase 21: Church document library

CREATE TABLE IF NOT EXISTS document_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS church_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  branch_id INTEGER,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  visibility TEXT DEFAULT 'church',
  member_id INTEGER,
  group_id INTEGER,
  event_id INTEGER,
  current_version INTEGER DEFAULT 1,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  uploaded_by INTEGER,
  uploaded_by_type TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  church_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  notes TEXT,
  uploaded_by INTEGER,
  uploaded_by_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES church_documents(id) ON DELETE CASCADE,
  UNIQUE(document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_church_documents_church ON church_documents(church_id);
CREATE INDEX IF NOT EXISTS idx_church_documents_category ON church_documents(category);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id);

INSERT OR IGNORE INTO document_categories (code, name, description) VALUES
  ('church', 'Church documents', 'General church documents'),
  ('policies', 'Policies', 'Policies and guidelines'),
  ('financial', 'Financial documents', 'Finance and accounting documents'),
  ('member', 'Member documents', 'Member-related files'),
  ('minutes', 'Meeting minutes', 'Meeting minutes and records'),
  ('reports', 'Reports', 'Operational and ministry reports'),
  ('certificates', 'Certificates', 'Certificates and credentials'),
  ('evidence', 'Supporting evidence', 'Supporting evidence and attachments');
