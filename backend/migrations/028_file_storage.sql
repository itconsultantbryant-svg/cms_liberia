-- Phase 33: Tenant-scoped file storage registry
CREATE TABLE IF NOT EXISTS stored_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  original_name TEXT,
  stored_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  mime_type TEXT,
  extension TEXT,
  size_bytes INTEGER,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK(visibility IN ('private', 'church', 'public_branding')),
  uploaded_by INTEGER,
  uploaded_by_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (church_id) REFERENCES churches(id)
);

CREATE INDEX IF NOT EXISTS idx_stored_files_church ON stored_files(church_id);
CREATE INDEX IF NOT EXISTS idx_stored_files_category ON stored_files(church_id, category);
