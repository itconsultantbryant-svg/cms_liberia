/**
 * Ensure Phase 8 approval workflow tables + default templates.
 */
const db = require('../database');

const DEFAULT_WORKFLOWS = [
  {
    action_type: 'member_delete',
    name: 'Member deletion',
    approver_permission: 'members.delete',
    approver_role_code: 'PRESIDENT',
    allow_self_approve: 0
  },
  {
    action_type: 'expense_approval',
    name: 'Expense approval',
    approver_permission: 'expenses.approve',
    approver_role_code: 'FINANCE_OFFICER',
    allow_self_approve: 0
  },
  {
    action_type: 'role_change',
    name: 'Role change',
    approver_permission: 'roles.manage',
    approver_role_code: 'PRESIDENT',
    allow_self_approve: 0
  },
  {
    action_type: 'user_delete',
    name: 'User deletion',
    approver_permission: 'users.manage',
    approver_role_code: 'PRESIDENT',
    allow_self_approve: 0
  },
  {
    action_type: 'financial_adjustment',
    name: 'Financial adjustment',
    approver_permission: 'finance.approve',
    approver_role_code: 'FINANCE_OFFICER',
    allow_self_approve: 0
  },
  {
    action_type: 'budget_approval',
    name: 'Budget approval',
    approver_permission: 'finance.approve',
    approver_role_code: 'PRESIDENT',
    allow_self_approve: 0
  }
];

async function apply() {
  await db.runAsync(`
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
    )
  `);

  await db.runAsync(`
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
    )
  `);

  try {
    await db.runAsync(
      `CREATE INDEX IF NOT EXISTS idx_workflow_requests_church_status ON workflow_requests(church_id, status)`
    );
  } catch (_) { /* ignore */ }

  for (const wf of DEFAULT_WORKFLOWS) {
    const existing = await db.getAsync(
      `SELECT id FROM approval_workflows WHERE church_id IS NULL AND action_type = ?`,
      [wf.action_type]
    );
    if (!existing) {
      await db.runAsync(
        `INSERT INTO approval_workflows
          (church_id, action_type, name, require_approval, allow_self_approve, approver_permission, approver_role_code, is_active)
         VALUES (NULL, ?, ?, 1, ?, ?, ?, 1)`,
        [wf.action_type, wf.name, wf.allow_self_approve, wf.approver_permission, wf.approver_role_code]
      );
    }
  }

  console.log('Approval workflow schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
