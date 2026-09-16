-- Phase 9: Member documents (profile columns added by applyMemberManagement.js)
CREATE TABLE IF NOT EXISTS member_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT,
  doc_type TEXT DEFAULT 'other',
  uploaded_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_documents_member ON member_documents(member_id);
