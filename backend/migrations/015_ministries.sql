-- Phase 16: Ministries / groups enhancements
-- Extra columns added via applyMinistries.js

CREATE TABLE IF NOT EXISTS group_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  meeting_date TEXT NOT NULL,
  title TEXT,
  notes TEXT,
  attendance_count INTEGER DEFAULT 0,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT,
  doc_type TEXT DEFAULT 'other',
  uploaded_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ministry_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT
);

INSERT OR IGNORE INTO ministry_templates (code, name, category, description) VALUES
  ('choir', 'Choir', 'choir', 'Music and worship choir'),
  ('youth', 'Youth Ministry', 'youth', 'Youth fellowship and discipleship'),
  ('women', 'Women Ministry', 'women', 'Women fellowship'),
  ('men', 'Men Ministry', 'men', 'Men fellowship'),
  ('children', 'Children''s Ministry', 'children', 'Children and Sunday school'),
  ('evangelism', 'Evangelism', 'evangelism', 'Outreach and evangelism'),
  ('media', 'Media', 'media', 'Media and communications'),
  ('ushering', 'Ushering', 'ushering', 'Ushering and hospitality'),
  ('prayer', 'Prayer Ministry', 'prayer', 'Prayer and intercession');
