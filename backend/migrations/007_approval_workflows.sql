-- Phase 8: Configurable approval workflow engine
CREATE TABLE IF NOT EXISTS approval_workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER,
  action_type TEXT NOT NULL,
  name TEXT NOT NULL,
  require_approval INTEGER DEFAULT 1,
  allow_self_approve INTEGER DEFAULT 0,
  approver_permission TEXT,
  approver_role_code TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(church_id, action_type)
);

CREATE TABLE IF NOT EXISTS workflow_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  branch_id INTEGER,
  action_type TEXT NOT NULL,
  record_type TEXT,
  record_id INTEGER,
  payload_json TEXT,
  amount REAL,
  reason TEXT,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
  requester_id INTEGER NOT NULL,
  requester_type TEXT NOT NULL DEFAULT 'branch',
  approver_id INTEGER,
  approver_type TEXT,
  approval_comments TEXT,
  rejection_comments TEXT,
  requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  actioned_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_requests_church_status
  ON workflow_requests(church_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_requests_action
  ON workflow_requests(action_type, status);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_action
  ON approval_workflows(action_type);
