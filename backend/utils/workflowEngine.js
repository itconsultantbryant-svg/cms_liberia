const db = require('../database');
const { hasPermission } = require('./rbac');

async function getWorkflow(churchId, actionType) {
  const churchWf = await db.getAsync(
    `SELECT * FROM approval_workflows
     WHERE church_id = ? AND action_type = ? AND is_active = 1`,
    [churchId, actionType]
  );
  if (churchWf) return churchWf;

  return db.getAsync(
    `SELECT * FROM approval_workflows
     WHERE church_id IS NULL AND action_type = ? AND is_active = 1`,
    [actionType]
  );
}

async function workflowRequiresApproval(churchId, actionType) {
  const wf = await getWorkflow(churchId, actionType);
  if (!wf) return false;
  return !!wf.require_approval;
}

/**
 * Create a pending (or draft) workflow request.
 */
async function submitWorkflowRequest({
  churchId,
  branchId,
  actionType,
  recordType = null,
  recordId = null,
  payload = null,
  amount = null,
  reason = null,
  documentUrl = null,
  requesterId,
  requesterType = 'branch',
  status = 'pending'
}) {
  const result = await db.runAsync(
    `INSERT INTO workflow_requests (
      church_id, branch_id, action_type, record_type, record_id, payload_json,
      amount, reason, document_url, status, requester_id, requester_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      churchId,
      branchId || null,
      actionType,
      recordType,
      recordId,
      payload ? JSON.stringify(payload) : null,
      amount,
      reason,
      documentUrl,
      status,
      requesterId,
      requesterType
    ]
  );

  return db.getAsync('SELECT * FROM workflow_requests WHERE id = ?', [result.lastID]);
}

async function listWorkflowRequests(churchId, { status, actionType, mineFor } = {}) {
  let sql = `SELECT wr.*,
              b.branchname as branch_name,
              req.branchname as requester_name,
              req.email as requester_email
            FROM workflow_requests wr
            LEFT JOIN branches b ON wr.branch_id = b.id
            LEFT JOIN branches req ON wr.requester_id = req.id AND wr.requester_type = 'branch'
            WHERE wr.church_id = ?`;
  const params = [churchId];
  if (status) {
    sql += ' AND wr.status = ?';
    params.push(status);
  }
  if (actionType) {
    sql += ' AND wr.action_type = ?';
    params.push(actionType);
  }
  if (mineFor) {
    sql += ' AND wr.requester_id = ? AND wr.requester_type = ?';
    params.push(mineFor.id, mineFor.type || 'branch');
  }
  sql += ' ORDER BY wr.requested_at DESC';
  return db.allAsync(sql, params);
}

async function canApproveRequest(user, churchId, request) {
  const wf = await getWorkflow(churchId, request.action_type);
  if (!wf) return false;

  // Self-approval policy
  if (
    !wf.allow_self_approve &&
    Number(user.id) === Number(request.requester_id) &&
    (user.userType || 'branch') === (request.requester_type || 'branch')
  ) {
    return false;
  }

  if (user.isadmin || user.isSuperadmin) return true;

  if (wf.approver_permission) {
    const ok = await hasPermission(user, wf.approver_permission, churchId);
    if (ok) return true;
  }

  if (wf.approver_role_code) {
    const roleCode = user.primaryRole?.role_code;
    if (roleCode === wf.approver_role_code || roleCode === 'PRESIDENT') return true;
  }

  return false;
}

async function executeApprovedAction(request) {
  const payload = request.payload_json ? JSON.parse(request.payload_json) : {};

  switch (request.action_type) {
    case 'member_delete': {
      const memberId = request.record_id || payload.memberId;
      if (!memberId) throw new Error('Missing member id');
      await db.runAsync(
        'DELETE FROM members WHERE id = ? AND church_id = ?',
        [memberId, request.church_id]
      );
      return { executed: 'member_delete', memberId };
    }
    case 'user_delete': {
      const userId = request.record_id || payload.userId;
      if (!userId) throw new Error('Missing user id');
      await db.runAsync(
        'DELETE FROM branches WHERE id = ? AND church_id = ? AND isadmin = 0',
        [userId, request.church_id]
      );
      return { executed: 'user_delete', userId };
    }
    case 'expense_approval':
    case 'financial_adjustment':
    case 'budget_approval':
    case 'role_change':
      // Soft complete — payload retained for audit; callers may extend handlers
      return { executed: request.action_type, payload };
    default:
      return { executed: request.action_type, payload };
  }
}

async function decideRequest(requestId, churchId, user, { action, comments }) {
  const request = await db.getAsync(
    'SELECT * FROM workflow_requests WHERE id = ? AND church_id = ?',
    [requestId, churchId]
  );
  if (!request) {
    throw Object.assign(new Error('Request not found'), { status: 404 });
  }
  if (request.status !== 'pending') {
    throw Object.assign(new Error(`Request is already ${request.status}`), { status: 400 });
  }

  const allowed = await canApproveRequest(user, churchId, request);
  if (!allowed) {
    throw Object.assign(
      new Error('Not allowed to approve this request (check permissions or self-approval policy)'),
      { status: 403 }
    );
  }

  if (action === 'approve') {
    const result = await executeApprovedAction(request);
    await db.runAsync(
      `UPDATE workflow_requests SET
        status = 'approved',
        approver_id = ?,
        approver_type = ?,
        approval_comments = ?,
        actioned_at = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        user.id,
        user.userType || 'branch',
        comments || '',
        new Date().toISOString(),
        requestId
      ]
    );
    return { request: await db.getAsync('SELECT * FROM workflow_requests WHERE id = ?', [requestId]), result };
  }

  if (action === 'reject') {
    await db.runAsync(
      `UPDATE workflow_requests SET
        status = 'rejected',
        approver_id = ?,
        approver_type = ?,
        rejection_comments = ?,
        actioned_at = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        user.id,
        user.userType || 'branch',
        comments || '',
        new Date().toISOString(),
        requestId
      ]
    );
    return { request: await db.getAsync('SELECT * FROM workflow_requests WHERE id = ?', [requestId]) };
  }

  throw Object.assign(new Error('action must be approve or reject'), { status: 400 });
}

async function cancelRequest(requestId, churchId, user) {
  const request = await db.getAsync(
    'SELECT * FROM workflow_requests WHERE id = ? AND church_id = ?',
    [requestId, churchId]
  );
  if (!request) throw Object.assign(new Error('Request not found'), { status: 404 });
  if (request.status !== 'pending' && request.status !== 'draft') {
    throw Object.assign(new Error('Only pending/draft requests can be cancelled'), { status: 400 });
  }
  if (Number(request.requester_id) !== Number(user.id) && !user.isadmin) {
    throw Object.assign(new Error('Only requester or church admin can cancel'), { status: 403 });
  }
  await db.runAsync(
    `UPDATE workflow_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [requestId]
  );
  return db.getAsync('SELECT * FROM workflow_requests WHERE id = ?', [requestId]);
}

module.exports = {
  getWorkflow,
  workflowRequiresApproval,
  submitWorkflowRequest,
  listWorkflowRequests,
  canApproveRequest,
  decideRequest,
  cancelRequest,
  executeApprovedAction
};
