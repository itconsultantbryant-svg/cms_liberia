-- Reports table for department reports
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  department TEXT NOT NULL,
  report_type TEXT NOT NULL, -- 'weekly', 'monthly', 'custom'
  report_period_start DATE NOT NULL,
  report_period_end DATE NOT NULL,
  overview TEXT,
  general_observations TEXT,
  task_completion_rate REAL, -- Percentage
  recommendations TEXT,
  conclusion TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at DATETIME,
  approved_by INTEGER,
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES branches(id) ON DELETE SET NULL
);

-- Staff performance entries within reports
CREATE TABLE IF NOT EXISTS report_staff_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  staff_name TEXT NOT NULL,
  completed_tasks TEXT, -- JSON array or text
  pending_tasks TEXT, -- JSON array or text
  tasks_completed_count INTEGER DEFAULT 0,
  tasks_pending_count INTEGER DEFAULT 0,
  support_needed TEXT,
  remarks TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_reports_branch ON reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_reports_department ON reports(department);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_report_staff_report ON report_staff_performance(report_id);

