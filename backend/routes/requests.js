const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo, requireRole } = require('../middleware/roleAuth');
const { createNotification } = require('./notifications');

// Create a new request (Resident Pastor)
router.post('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const {
      request_type,
      title,
      description,
      amount,
      currency,
      priority,
      department_id
    } = req.body;

    if (!request_type || !title || !description) {
      return res.status(400).json({ error: 'Request type, title, and description are required' });
    }

    const result = await db.runAsync(
      `INSERT INTO requests (branch_id, requested_by, request_type, title, description, amount, currency, priority, department_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        req.user.branchId,
        req.user.id,
        request_type,
        title,
        description,
        amount || null,
        currency || 'USD',
        priority || 'normal',
        department_id || null
      ]
    );

    res.json({
      message: 'Request submitted successfully',
      requestId: result.lastID
    });
  } catch (error) {
    console.error('Create request error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get all requests (filtered by role)
router.get('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    if (!req.user) {
      console.error('[Get Requests] No user object in request');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userRole = req.primaryRole?.role_code;
    const branchId = req.user.branchId || req.user.id;
    
    // Debug logging
    console.log('[Get Requests] User ID:', req.user.id, 'Role:', userRole, 'Primary Role:', req.primaryRole);

    let requests;
    
    if (userRole === 'PRESIDENT') {
      // Admin/President sees ONLY fully approved requests (viewing only)
      requests = await db.allAsync(
        `SELECT r.*, 
         b.branchname as requested_by_name,
         d.department_name
         FROM requests r
         JOIN branches b ON r.requested_by = b.id
         LEFT JOIN departments d ON r.department_id = d.id
         WHERE r.status = 'approved'
         ORDER BY r.created_at DESC`,
        []
      );
      console.log(`[Get Requests] Admin/President - Found ${requests.length} fully approved requests`);
    } else if (userRole === 'RESIDENT_PASTOR' || userRole === 'RESIDENT_PASTOR_HQ') {
      // Resident Pastors see ALL request history (all statuses) - their own requests plus all others for history
      requests = await db.allAsync(
        `SELECT r.*, 
         b.branchname as requested_by_name,
         d.department_name
         FROM requests r
         JOIN branches b ON r.requested_by = b.id
         LEFT JOIN departments d ON r.department_id = d.id
         ORDER BY r.created_at DESC`,
        []
      );
      console.log(`[Get Requests] Resident Pastor - Found ${requests.length} requests (full history)`);
    } else if (userRole === 'MISSION_SECRETARY' || userRole === 'MISSION_SECRETARY_MISSION') {
      // Mission Secretary sees ALL request history (all statuses)
      requests = await db.allAsync(
        `SELECT r.*, 
         b.branchname as requested_by_name,
         d.department_name
         FROM requests r
         JOIN branches b ON r.requested_by = b.id
         LEFT JOIN departments d ON r.department_id = d.id
         ORDER BY r.created_at DESC`,
        []
      );
      console.log(`[Get Requests] Mission Secretary - Found ${requests.length} requests (full history)`);
    } else if (userRole === 'FINANCE_OFFICER') {
      // Finance Officer sees ALL request history (all statuses)
      console.log('[Get Requests] Finance Officer role detected. Fetching all request history...');
      requests = await db.allAsync(
        `SELECT r.*, 
         b.branchname as requested_by_name,
         d.department_name
         FROM requests r
         JOIN branches b ON r.requested_by = b.id
         LEFT JOIN departments d ON r.department_id = d.id
         ORDER BY r.created_at DESC`,
        []
      );
      console.log(`[Get Requests] Finance Officer - Found ${requests.length} requests (full history)`);
      if (requests.length > 0) {
        console.log(`[Get Requests] Finance Officer - Request statuses:`, [...new Set(requests.map(r => r.status))]);
      }
    } else if (userRole === 'VICE_PRESIDENT_MA' || userRole === 'VICE_PRESIDENT_MISSION') {
      // Vice President sees ALL request history (all statuses)
      console.log('[VP Query] Fetching all request history for Vice President role:', userRole);
      
      requests = await db.allAsync(
        `SELECT DISTINCT r.*, 
         b.branchname as requested_by_name,
         d.department_name
         FROM requests r
         JOIN branches b ON r.requested_by = b.id
         LEFT JOIN departments d ON r.department_id = d.id
         ORDER BY r.created_at DESC`,
        []
      );
      
      console.log('[VP Query] Returning', requests.length, 'requests (full history)');
    } else {
      // Default: All users see ALL request history (all statuses)
      requests = await db.allAsync(
        `SELECT r.*, 
         b.branchname as requested_by_name,
         d.department_name
         FROM requests r
         JOIN branches b ON r.requested_by = b.id
         LEFT JOIN departments d ON r.department_id = d.id
         ORDER BY r.created_at DESC`,
        []
      );
      console.log(`[Get Requests] Default user - Found ${requests.length} requests (full history)`);
    }

    // Get approvals for each request
    const requestsWithApprovals = await Promise.all(
      requests.map(async (request) => {
        const approvals = await db.allAsync(
          `SELECT ra.*, b.branchname as approved_by_name
           FROM request_approvals ra
           JOIN branches b ON ra.approved_by = b.id
           WHERE ra.request_id = ?
           ORDER BY ra.created_at ASC`,
          [request.id]
        );
        
        // Check for status mismatch: if finance officer approved but status is wrong, fix it
        const hasFinanceApproval = approvals.some(a => 
          a.approval_level === 'finance_officer' && a.action === 'approve'
        );
        if (hasFinanceApproval) {
          const correctStatuses = ['approved_by_finance', 'approved', 'approved_by_vice_president', 'rejected_by_vice_president'];
          if (!correctStatuses.includes(request.status)) {
            console.log(`[Get Requests] Fixing status mismatch for request ${request.id}: ${request.status} -> approved_by_finance`);
            // Fix status mismatch
            await db.runAsync(
              'UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              ['approved_by_finance', request.id]
            );
            request.status = 'approved_by_finance';
          }
        }
        
        return { ...request, approvals };
      })
    );

    // Debug logging for Finance Officer role
    if (req.primaryRole?.role_code === 'FINANCE_OFFICER') {
      const pendingForFinance = requestsWithApprovals.filter(r => r.status === 'approved_by_mission_secretary');
      console.log(`[Get Requests] Finance Officer Dashboard - Total requests: ${requestsWithApprovals.length}, Pending for Finance: ${pendingForFinance.length}`);
      console.log(`[Get Requests] Finance Officer - All request statuses:`, requestsWithApprovals.map(r => ({ id: r.id, title: r.title, status: r.status })));
      pendingForFinance.forEach(r => {
        console.log(`  - Request ID: ${r.id}, Title: ${r.title}, Status: ${r.status}, Has Mission Secretary Approval: ${r.approvals?.some(a => a.approval_level === 'mission_secretary' && a.action === 'approve')}`);
      });
    }

    // Debug logging for VP role
    if (req.primaryRole?.role_code === 'VICE_PRESIDENT_MA' || req.primaryRole?.role_code === 'VICE_PRESIDENT_MISSION') {
      const pendingForVP = requestsWithApprovals.filter(r => r.status === 'approved_by_finance');
      console.log(`[Get Requests] VP Dashboard - Total requests: ${requestsWithApprovals.length}, Pending for VP: ${pendingForVP.length}`);
      pendingForVP.forEach(r => {
        console.log(`  - Request ID: ${r.id}, Title: ${r.title}, Status: ${r.status}, Has Finance Approval: ${r.approvals?.some(a => a.approval_level === 'finance_officer' && a.action === 'approve')}`);
      });
    }

    res.json(requestsWithApprovals);
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get single request with full details
router.get('/:id', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const request = await db.getAsync(
      `SELECT r.*, 
       b.branchname as requested_by_name,
       d.department_name
       FROM requests r
       JOIN branches b ON r.requested_by = b.id
       LEFT JOIN departments d ON r.department_id = d.id
       WHERE r.id = ?`,
      [req.params.id]
    );

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const approvals = await db.allAsync(
      `SELECT ra.*, b.branchname as approved_by_name
       FROM request_approvals ra
       JOIN branches b ON ra.approved_by = b.id
       WHERE ra.request_id = ?
       ORDER BY ra.created_at ASC`,
      [req.params.id]
    );

    res.json({ ...request, approvals });
  } catch (error) {
    console.error('Get request error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Mission Secretary: Approve/Reject request (FIRST APPROVER - after Resident Pastor)
router.post('/:id/approve-mission-secretary', authMiddleware, requireRole('MISSION_SECRETARY', 'MISSION_SECRETARY_MISSION'), async (req, res) => {
  try {
    const { action, comments } = req.body; // action: 'approve' or 'reject'
    const requestId = req.params.id;

    const request = await db.getAsync('SELECT * FROM requests WHERE id = ?', [requestId]);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Mission Secretary is FIRST approver - check for 'pending' status
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request must be in pending status. Current status: ' + request.status });
    }

    const newStatus = action === 'approve' 
      ? 'approved_by_mission_secretary' 
      : 'rejected_by_mission_secretary';

    // Update request status
    await db.runAsync(
      'UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, requestId]
    );

    // Check if approval already exists to avoid duplicates
    const existingApproval = await db.getAsync(
      'SELECT * FROM request_approvals WHERE request_id = ? AND approval_level = ? AND approved_by = ?',
      [requestId, 'mission_secretary', req.user.id]
    );

    if (!existingApproval) {
      // Insert approval record
      await db.runAsync(
        'INSERT INTO request_approvals (request_id, approved_by, approval_level, action, comments) VALUES (?, ?, ?, ?, ?)',
        [requestId, req.user.id, 'mission_secretary', action, comments || '']
      );
    } else {
      // Update existing approval
      await db.runAsync(
        'UPDATE request_approvals SET action = ?, comments = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?',
        [action, comments || '', existingApproval.id]
      );
    }

    // Create notifications
    if (action === 'approve') {
      // Notify Finance Officer (next in workflow)
      console.log(`[Mission Secretary Approval] ✅ Request ${requestId} approved. Status: ${newStatus}. Submitting to Finance Officer...`);
      const financeOfficers = await db.allAsync(
        `SELECT b.id FROM branches b
         JOIN user_roles ur ON b.id = ur.user_id
         JOIN roles r ON ur.role_id = r.id
         WHERE r.role_code = 'FINANCE_OFFICER' AND ur.user_type = 'branch'`
      );
      console.log(`[Mission Secretary Approval] Found ${financeOfficers.length} Finance Officer(s) to notify`);
      for (const fo of financeOfficers) {
        await createNotification(
          fo.id, 'branch', 'request',
          'Request Pending Your Review',
          `Request "${request.title}" has been approved by Mission Secretary and is pending your review.`,
          requestId, 'request'
        );
        console.log(`[Mission Secretary Approval] ✅ Notification sent to Finance Officer (ID: ${fo.id})`);
      }
    } else {
      // Notify requester
      await createNotification(
        request.requested_by, 'branch', 'request',
        'Request Rejected',
        `Your request "${request.title}" has been rejected by Mission Secretary.`,
        requestId, 'request'
      );
    }

    res.json({ 
      message: `Request ${action === 'approve' ? 'approved' : 'rejected'} by Mission Secretary`,
      status: newStatus
    });
  } catch (error) {
    console.error('Mission Secretary approval error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Finance Officer: Approve/Reject request (SECOND APPROVER - after Mission Secretary)
router.post('/:id/approve-finance', authMiddleware, requireRole('FINANCE_OFFICER'), async (req, res) => {
  try {
    const { action, comments } = req.body;
    const requestId = req.params.id;

    const request = await db.getAsync('SELECT * FROM requests WHERE id = ?', [requestId]);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Finance Officer is SECOND approver - check for 'approved_by_mission_secretary' status
    if (request.status !== 'approved_by_mission_secretary') {
      return res.status(400).json({ error: 'Request must be approved by Mission Secretary first. Current status: ' + request.status });
    }

    const newStatus = action === 'approve' 
      ? 'approved_by_finance' 
      : 'rejected_by_finance';

    // Update request status
    await db.runAsync(
      'UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, requestId]
    );

    // Check if approval already exists to avoid duplicates
    const existingApproval = await db.getAsync(
      'SELECT * FROM request_approvals WHERE request_id = ? AND approval_level = ? AND approved_by = ?',
      [requestId, 'finance_officer', req.user.id]
    );

    if (!existingApproval) {
      // Insert approval record
      const approvalResult = await db.runAsync(
        'INSERT INTO request_approvals (request_id, approved_by, approval_level, action, comments) VALUES (?, ?, ?, ?, ?)',
        [requestId, req.user.id, 'finance_officer', action, comments || '']
      );
      console.log(`[Finance Approval] ✅ Created approval record for request ${requestId}, approval ID: ${approvalResult.lastID}`);
    } else {
      // Update existing approval
      await db.runAsync(
        'UPDATE request_approvals SET action = ?, comments = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?',
        [action, comments || '', existingApproval.id]
      );
      console.log(`[Finance Approval] ✅ Updated existing approval record for request ${requestId}`);
    }
    
    // Verify the status update
    const verifyRequest = await db.getAsync('SELECT status FROM requests WHERE id = ?', [requestId]);
    console.log(`[Finance Approval] ✅ Request ${requestId} status after approval: ${verifyRequest.status}`);
    
    // Verify the approval record
    const verifyApproval = await db.getAsync(
      'SELECT * FROM request_approvals WHERE request_id = ? AND approval_level = ? ORDER BY created_at DESC LIMIT 1',
      [requestId, 'finance_officer']
    );
    console.log(`[Finance Approval] ✅ Approval record exists:`, verifyApproval ? 'YES' : 'NO');

    // Create notifications
    if (action === 'approve') {
      // Notify Vice President (next in workflow)
      console.log(`[Finance Officer Approval] ✅ Request ${requestId} approved. Status: ${newStatus}. Submitting to Vice President...`);
      const vicePresidents = await db.allAsync(
        `SELECT b.id FROM branches b
         JOIN user_roles ur ON b.id = ur.user_id
         JOIN roles r ON ur.role_id = r.id
         WHERE r.role_code IN ('VICE_PRESIDENT_MA', 'VICE_PRESIDENT_MISSION') AND ur.user_type = 'branch'`
      );
      console.log(`[Finance Officer Approval] Found ${vicePresidents.length} Vice President(s) to notify`);
      for (const vp of vicePresidents) {
        await createNotification(
          vp.id, 'branch', 'request',
          'Request Pending Final Approval',
          `Request "${request.title}" has been approved by Finance Officer and is pending your final approval.`,
          requestId, 'request'
        );
        console.log(`[Finance Officer Approval] ✅ Notification sent to Vice President (ID: ${vp.id})`);
      }
    } else {
      // Notify requester
      await createNotification(
        request.requested_by, 'branch', 'request',
        'Request Rejected',
        `Your request "${request.title}" has been rejected by Finance Officer.`,
        requestId, 'request'
      );
    }

    res.json({ 
      message: `Request ${action === 'approve' ? 'approved' : 'rejected'} by Finance Officer`,
      status: newStatus
    });
  } catch (error) {
    console.error('Finance Officer approval error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Vice President: Final approval
router.post('/:id/approve-vice-president', authMiddleware, requireRole('VICE_PRESIDENT_MA', 'VICE_PRESIDENT_MISSION'), async (req, res) => {
  try {
    const { action, comments } = req.body;
    const requestId = req.params.id;

    const request = await db.getAsync('SELECT * FROM requests WHERE id = ?', [requestId]);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Vice President is THIRD approver - check for 'approved_by_finance' status
    if (request.status !== 'approved_by_finance') {
      return res.status(400).json({ error: 'Request must be approved by Finance Officer first. Current status: ' + request.status });
    }

    const newStatus = action === 'approve' 
      ? 'approved' 
      : 'rejected_by_vice_president';

    await db.runAsync(
      'UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, requestId]
    );

    await db.runAsync(
      'INSERT INTO request_approvals (request_id, approved_by, approval_level, action, comments) VALUES (?, ?, ?, ?, ?)',
      [requestId, req.user.id, 'vice_president', action, comments || '']
    );

    console.log(`[Vice President Approval] ✅ Request ${requestId} ${action === 'approve' ? 'fully approved' : 'rejected'}. Status: ${newStatus}`);

    // Create notifications
    await createNotification(
      request.requested_by, 'branch', 'request',
      action === 'approve' ? 'Request Fully Approved' : 'Request Rejected',
      `Your request "${request.title}" has been ${action === 'approve' ? 'fully approved' : 'rejected'} by Vice President.`,
      requestId, 'request'
    );

    // Notify President (admin)
    const presidents = await db.allAsync(
      `SELECT b.id FROM branches b
       JOIN user_roles ur ON b.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.role_code = 'PRESIDENT' AND ur.user_type = 'branch'`
    );
    for (const pres of presidents) {
      await createNotification(
        pres.id, 'branch', 'request',
        `Request ${action === 'approve' ? 'Approved' : 'Rejected'}`,
        `Request "${request.title}" has been ${action === 'approve' ? 'fully approved' : 'rejected'} by Vice President.`,
        requestId, 'request'
      );
    }

    res.json({ 
      message: `Request ${action === 'approve' ? 'finally approved' : 'rejected'} by Vice President`,
      status: newStatus
    });
  } catch (error) {
    console.error('Vice President approval error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Update request (only by requester if pending)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const request = await db.getAsync('SELECT * FROM requests WHERE id = ? AND requested_by = ?', [req.params.id, req.user.id]);
    if (!request) {
      return res.status(404).json({ error: 'Request not found or unauthorized' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot update request that has been processed' });
    }

    const { title, description, amount, priority, department_id } = req.body;
    
    await db.runAsync(
      `UPDATE requests 
       SET title = COALESCE(?, title),
           description = COALESCE(?, description),
           amount = COALESCE(?, amount),
           priority = COALESCE(?, priority),
           department_id = COALESCE(?, department_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [title, description, amount, priority, department_id, req.params.id]
    );

    res.json({ message: 'Request updated successfully' });
  } catch (error) {
    console.error('Update request error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Delete request (only by requester if pending)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const request = await db.getAsync('SELECT * FROM requests WHERE id = ? AND requested_by = ?', [req.params.id, req.user.id]);
    if (!request) {
      return res.status(404).json({ error: 'Request not found or unauthorized' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot delete request that has been processed' });
    }

    await db.runAsync('DELETE FROM requests WHERE id = ?', [req.params.id]);
    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    console.error('Delete request error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

