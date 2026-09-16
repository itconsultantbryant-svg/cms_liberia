const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requirePermission } = require('../utils/rbac');
const {
  getWorkflow,
  submitWorkflowRequest,
  listWorkflowRequests,
  decideRequest,
  cancelRequest,
  canApproveRequest
} = require('../utils/workflowEngine');
const { createNotification, notifyChurchAdmins } = require('../utils/notifications');
const { audit } = require('../utils/audit');

router.use(authMiddleware, requireTenant, attachRoleInfo);

/** List workflows (templates + church overrides) */
router.get('/definitions', async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT * FROM approval_workflows
       WHERE church_id IS NULL OR church_id = ?
       ORDER BY action_type, church_id DESC`,
      [req.churchId]
    );
    res.json({ workflows: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Upsert church workflow override */
router.put(
  '/definitions/:actionType',
  requirePermission('settings.manage', 'roles.manage'),
  async (req, res) => {
    try {
      const actionType = req.params.actionType;
      const {
        name,
        requireApproval,
        allowSelfApprove,
        approverPermission,
        approverRoleCode,
        isActive
      } = req.body;

      const existing = await db.getAsync(
        `SELECT id FROM approval_workflows WHERE church_id = ? AND action_type = ?`,
        [req.churchId, actionType]
      );

      if (existing) {
        await db.runAsync(
          `UPDATE approval_workflows SET
            name = COALESCE(?, name),
            require_approval = COALESCE(?, require_approval),
            allow_self_approve = COALESCE(?, allow_self_approve),
            approver_permission = COALESCE(?, approver_permission),
            approver_role_code = COALESCE(?, approver_role_code),
            is_active = COALESCE(?, is_active),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            name ?? null,
            requireApproval == null ? null : requireApproval ? 1 : 0,
            allowSelfApprove == null ? null : allowSelfApprove ? 1 : 0,
            approverPermission ?? null,
            approverRoleCode ?? null,
            isActive == null ? null : isActive ? 1 : 0,
            existing.id
          ]
        );
      } else {
        const template = await getWorkflow(req.churchId, actionType);
        await db.runAsync(
          `INSERT INTO approval_workflows
            (church_id, action_type, name, require_approval, allow_self_approve, approver_permission, approver_role_code, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.churchId,
            actionType,
            name || template?.name || actionType,
            requireApproval === false ? 0 : 1,
            allowSelfApprove ? 1 : 0,
            approverPermission || template?.approver_permission || null,
            approverRoleCode || template?.approver_role_code || null,
            isActive === false ? 0 : 1
          ]
        );
      }

      const wf = await getWorkflow(req.churchId, actionType);
      res.json({ message: 'Workflow updated', workflow: wf });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/** List requests */
router.get('/requests', async (req, res) => {
  try {
    const { status, actionType, mine } = req.query;
    const rows = await listWorkflowRequests(req.churchId, {
      status: status || undefined,
      actionType: actionType || undefined,
      mineFor: mine === '1' ? { id: req.user.id, type: req.user.userType || 'branch' } : undefined
    });

    // Annotate whether current user can approve
    const annotated = [];
    for (const row of rows) {
      const canApprove =
        row.status === 'pending' ? await canApproveRequest(req.user, req.churchId, row) : false;
      annotated.push({ ...row, canApprove });
    }
    res.json({ requests: annotated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Submit a generic workflow request */
router.post('/requests', async (req, res) => {
  try {
    const {
      actionType,
      recordType,
      recordId,
      payload,
      amount,
      reason,
      documentUrl,
      status
    } = req.body;
    if (!actionType) return res.status(400).json({ error: 'actionType is required' });

    const request = await submitWorkflowRequest({
      churchId: req.churchId,
      branchId: req.activeBranchId || req.user.branchId,
      actionType,
      recordType,
      recordId,
      payload,
      amount,
      reason,
      documentUrl,
      requesterId: req.user.id,
      requesterType: req.user.userType || 'branch',
      status: status === 'draft' ? 'draft' : 'pending'
    });

    if (request.status === 'pending') {
      await notifyChurchAdmins(
        req.churchId,
        'approval',
        'Approval request',
        `New ${String(actionType).replace(/_/g, ' ')} request awaiting review.`,
        request.id,
        'workflow_request'
      );
    }

    await audit(req, {
      action: 'submit',
      resource: 'workflow_request',
      resourceId: request.id,
      summary: `Workflow submitted: ${actionType}`,
      newValues: { actionType, status: request.status, recordId }
    });

    res.status(201).json({ message: 'Workflow request submitted', request });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Approve / reject */
router.post('/requests/:id/decide', async (req, res) => {
  try {
    const { action, comments } = req.body;
    const result = await decideRequest(req.params.id, req.churchId, req.user, {
      action,
      comments
    });

    const decided = result.request;
    if (decided?.requester_id) {
      await createNotification(
        decided.requester_id,
        decided.requester_type || 'branch',
        'approval',
        action === 'approve' ? 'Request approved' : 'Request rejected',
        `Your ${decided.action_type?.replace(/_/g, ' ') || 'workflow'} request was ${action === 'approve' ? 'approved' : 'rejected'}.${comments ? ` Comment: ${comments}` : ''}`,
        decided.id,
        'workflow_request',
        req.churchId
      );
    }

    await audit(req, {
      action: action === 'approve' ? 'approve' : 'reject',
      resource: 'workflow_request',
      resourceId: decided?.id || req.params.id,
      summary: `Workflow ${action}: ${decided?.action_type || ''}`,
      newValues: { action, comments: comments || null }
    });

    res.json({
      message: action === 'approve' ? 'Request approved' : 'Request rejected',
      ...result
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** Cancel */
router.post('/requests/:id/cancel', async (req, res) => {
  try {
    const request = await cancelRequest(req.params.id, req.churchId, req.user);
    res.json({ message: 'Request cancelled', request });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** Get one */
router.get('/requests/:id', async (req, res) => {
  try {
    const request = await db.getAsync(
      'SELECT * FROM workflow_requests WHERE id = ? AND church_id = ?',
      [req.params.id, req.churchId]
    );
    if (!request) return res.status(404).json({ error: 'Not found' });
    const canApprove =
      request.status === 'pending'
        ? await canApproveRequest(req.user, req.churchId, request)
        : false;
    res.json({ request, canApprove });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
