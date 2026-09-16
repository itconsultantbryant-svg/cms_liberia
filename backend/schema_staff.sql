-- Staff table - Staff members under Resident Pastors
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  resident_pastor_id INTEGER NOT NULL, -- The Resident Pastor who manages this staff
  firstname TEXT NOT NULL,
  lastname TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  position TEXT NOT NULL, -- e.g., 'Secretary', 'Assistant Pastor', 'Administrative Pastor', 'Finance Officer', etc.
  department_id INTEGER, -- Department assignment
  employment_date DATE,
  salary DECIMAL(15, 2),
  currency TEXT DEFAULT 'USD',
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (resident_pastor_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- Sub-users table - Users created by Resident Pastors (like Secretary)
CREATE TABLE IF NOT EXISTS sub_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL, -- Resident Pastor who created this user
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  firstname TEXT NOT NULL,
  lastname TEXT NOT NULL,
  position TEXT NOT NULL, -- e.g., 'Secretary', 'Assistant', etc.
  permissions TEXT NOT NULL, -- JSON array of permissions: ['add_members', 'record_attendance', 'record_collections', 'view_reports']
  is_active INTEGER DEFAULT 1,
  church_id INTEGER,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  token_version INTEGER DEFAULT 0,
  password_changed_at TEXT,
  mfa_enabled INTEGER DEFAULT 0,
  mfa_secret TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES branches(id) ON DELETE CASCADE
);

-- Pending approvals table - For members, attendance, collections submitted by sub-users
CREATE TABLE IF NOT EXISTS pending_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  submitted_by INTEGER NOT NULL, -- Sub-user or staff who submitted
  submitted_by_type TEXT NOT NULL CHECK(submitted_by_type IN ('sub_user', 'staff', 'branch')),
  approval_type TEXT NOT NULL CHECK(approval_type IN ('member', 'attendance', 'collection', 'financial_report')),
  reference_id INTEGER NOT NULL, -- ID of the member/attendance/collection/report
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  reviewed_by INTEGER, -- Resident Pastor or Finance Officer who reviewed
  review_comments TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES branches(id) ON DELETE SET NULL
);

-- Financial Reports table - Finance reports submitted by sub-users/staff
CREATE TABLE IF NOT EXISTS request_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  submitted_by INTEGER NOT NULL,
  submitted_by_type TEXT NOT NULL CHECK(submitted_by_type IN ('sub_user', 'staff', 'branch')),
  report_type TEXT NOT NULL CHECK(report_type IN ('financial', 'attendance', 'membership', 'general')),
  title TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  content TEXT NOT NULL, -- JSON or text content of the report
  attachments TEXT, -- JSON array of file paths
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved_by_pastor', 'rejected_by_pastor', 'approved_by_mission_secretary', 'rejected_by_mission_secretary', 'approved_by_finance', 'rejected_by_finance', 'approved', 'rejected')),
  reviewed_by INTEGER,
  review_comments TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES branches(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_staff_branch ON staff(branch_id);
CREATE INDEX IF NOT EXISTS idx_staff_pastor ON staff(resident_pastor_id);
CREATE INDEX IF NOT EXISTS idx_sub_users_branch ON sub_users(branch_id);
CREATE INDEX IF NOT EXISTS idx_sub_users_created_by ON sub_users(created_by);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_branch ON pending_approvals(branch_id);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_status ON pending_approvals(status);
CREATE INDEX IF NOT EXISTS idx_request_reports_branch ON request_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_request_reports_status ON request_reports(status);

