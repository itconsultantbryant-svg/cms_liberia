-- Phase 11: Visitors & follow-up
CREATE TABLE IF NOT EXISTS visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  branch_id INTEGER,
  firstname TEXT NOT NULL,
  middlename TEXT,
  lastname TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  sex TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  first_visit_date TEXT,
  invited_by TEXT,
  invited_by_member_id INTEGER,
  service_attended TEXT,
  prayer_request TEXT,
  follow_up_status TEXT NOT NULL DEFAULT 'New'
    CHECK(follow_up_status IN ('New', 'Contacted', 'Follow-up', 'Interested', 'Converted', 'Closed')),
  assigned_to INTEGER,
  notes TEXT,
  converted_member_id INTEGER,
  converted_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visitor_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  visitor_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_visitors_church_status ON visitors(church_id, follow_up_status);
CREATE INDEX IF NOT EXISTS idx_visitor_followups_visitor ON visitor_followups(visitor_id);
