-- Add permissions column to branches (JSON array of permission keys assigned by admin)
ALTER TABLE branches ADD COLUMN permissions TEXT DEFAULT '[]';

-- Payroll runs: created by Finance Officer, approved by Admin
CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'submitted', 'approved', 'rejected')),
  total_amount DECIMAL(15, 2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  submitted_by INTEGER,
  submitted_at DATETIME,
  approved_by INTEGER,
  approved_at DATETIME,
  rejection_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES branches(id) ON DELETE SET NULL
);

-- Payroll entries: one per staff per run
CREATE TABLE IF NOT EXISTS payroll_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_run_id INTEGER NOT NULL,
  staff_id INTEGER NOT NULL,
  base_salary DECIMAL(15, 2) NOT NULL,
  allowances DECIMAL(15, 2) DEFAULT 0,
  deductions DECIMAL(15, 2) DEFAULT 0,
  net_amount DECIMAL(15, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  UNIQUE(payroll_run_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_branch ON payroll_runs(branch_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_run ON payroll_entries(payroll_run_id);
