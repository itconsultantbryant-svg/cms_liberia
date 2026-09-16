-- Phase 18: Confidential pastoral care

CREATE TABLE IF NOT EXISTS pastoral_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  case_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  member_id INTEGER,
  subject_name TEXT,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  confidentiality TEXT DEFAULT 'confidential',
  assigned_to_user_id INTEGER,
  assigned_to_user_type TEXT,
  follow_up_date TEXT,
  created_by INTEGER,
  created_by_type TEXT,
  closed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pastoral_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  case_id INTEGER NOT NULL,
  note_type TEXT DEFAULT 'note',
  body TEXT NOT NULL,
  is_sensitive INTEGER DEFAULT 1,
  created_by INTEGER,
  created_by_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES pastoral_cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pastoral_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  case_id INTEGER NOT NULL,
  visit_type TEXT NOT NULL,
  visit_date TEXT NOT NULL,
  visit_time TEXT,
  location TEXT,
  notes TEXT,
  visited_by_user_id INTEGER,
  visited_by_user_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES pastoral_cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pastoral_cases_church ON pastoral_cases(church_id);
CREATE INDEX IF NOT EXISTS idx_pastoral_cases_status ON pastoral_cases(status);
CREATE INDEX IF NOT EXISTS idx_pastoral_cases_type ON pastoral_cases(case_type);
CREATE INDEX IF NOT EXISTS idx_pastoral_notes_case ON pastoral_notes(case_id);
CREATE INDEX IF NOT EXISTS idx_pastoral_visits_case ON pastoral_visits(case_id);
