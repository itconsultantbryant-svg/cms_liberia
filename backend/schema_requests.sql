-- Requests table - Stores all requests from Resident Pastors
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  requested_by INTEGER NOT NULL, -- User ID who made the request
  request_type TEXT NOT NULL CHECK(request_type IN ('financial', 'personnel', 'project', 'program', 'other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(15, 2), -- For financial requests
  currency TEXT DEFAULT 'USD' CHECK(currency IN ('USD', 'LRD')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved_by_mission_secretary', 'rejected_by_mission_secretary', 'approved_by_finance', 'rejected_by_finance', 'approved_by_vice_president', 'rejected_by_vice_president', 'approved', 'rejected')),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  department_id INTEGER, -- Related department if applicable
  attachments TEXT, -- JSON array of file paths
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- Request approvals table - Tracks approval workflow
CREATE TABLE IF NOT EXISTS request_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  approved_by INTEGER NOT NULL, -- User ID who approved/rejected
  approval_level TEXT NOT NULL CHECK(approval_level IN ('mission_secretary', 'finance_officer', 'vice_president')),
  action TEXT NOT NULL CHECK(action IN ('approve', 'reject')),
  comments TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES branches(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_requests_branch ON requests(branch_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_type ON requests(request_type);
CREATE INDEX IF NOT EXISTS idx_requests_requested_by ON requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_request_approvals_request ON request_approvals(request_id);

