const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo, requireRole } = require('../middleware/roleAuth');
const { createNotification } = require('./notifications');

// Get pending approvals for Resident Pastor
router.get('/pending', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const userRole = req.primaryRole?.role_code;
    const branchId = req.user.branchId;

    let approvals;

    if (userRole === 'RESIDENT_PASTOR' || userRole === 'RESIDENT_PASTOR_HQ') {
      // Get pending approvals for this Resident Pastor's branch
      approvals = await db.allAsync(
        `SELECT pa.*, 
         b.branchname as submitted_by_name,
         su.firstname || ' ' || su.lastname as sub_user_name,
         su.position as sub_user_position
         FROM pending_approvals pa
         LEFT JOIN branches b ON pa.submitted_by = b.id AND pa.submitted_by_type = 'branch'
         LEFT JOIN sub_users su ON pa.submitted_by = su.id AND pa.submitted_by_type = 'sub_user'
         WHERE pa.branch_id = ? AND pa.status = 'pending'
         ORDER BY pa.created_at DESC`,
        [branchId]
      );

      // Get details for each approval
      const approvalsWithDetails = await Promise.all(
        approvals.map(async (approval) => {
          let details = null;
          
          if (approval.approval_type === 'member') {
            details = await db.getAsync('SELECT * FROM members WHERE id = ?', [approval.reference_id]);
          } else if (approval.approval_type === 'attendance') {
            details = await db.getAsync('SELECT * FROM attendances WHERE id = ?', [approval.reference_id]);
          } else if (approval.approval_type === 'collection') {
            details = await db.getAsync('SELECT * FROM collections WHERE id = ?', [approval.reference_id]);
          }

          return { ...approval, details };
        })
      );

      res.json(approvalsWithDetails);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Approve or reject pending item
router.post('/:id/review', authMiddleware, requireRole('RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'), async (req, res) => {
  try {
    const { action, comments } = req.body; // action: 'approve' or 'reject'
    const approvalId = req.params.id;

    const approval = await db.getAsync(
      'SELECT * FROM pending_approvals WHERE id = ? AND branch_id = ? AND status = ?',
      [approvalId, req.user.branchId, 'pending']
    );

    if (!approval) {
      return res.status(404).json({ error: 'Approval not found or already processed' });
    }

    if (action === 'approve') {
      // Update the approval status
      await db.runAsync(
        'UPDATE pending_approvals SET status = ?, reviewed_by = ?, review_comments = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['approved', req.user.id, comments || '', approvalId]
      );

      // Create notification for submitter
      const submitterType = approval.submitted_by_type === 'sub_user' ? 'sub_user' : 'branch';
      await createNotification(
        approval.submitted_by, submitterType, approval.approval_type,
        'Item Approved',
        `Your ${approval.approval_type} submission has been approved by Resident Pastor.`,
        approval.reference_id, approval.approval_type
      );

      // The item is already in the database, just marked as pending
      // Now it's approved and will show in the system
      res.json({ message: 'Item approved successfully' });
    } else {
      // Reject - delete the pending item
      await db.runAsync(
        'UPDATE pending_approvals SET status = ?, reviewed_by = ?, review_comments = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['rejected', req.user.id, comments || '', approvalId]
      );

      // Delete the actual record
      if (approval.approval_type === 'member') {
        await db.runAsync('DELETE FROM members WHERE id = ?', [approval.reference_id]);
      } else if (approval.approval_type === 'attendance') {
        await db.runAsync('DELETE FROM attendances WHERE id = ?', [approval.reference_id]);
      } else if (approval.approval_type === 'collection') {
        await db.runAsync('DELETE FROM collections WHERE id = ?', [approval.reference_id]);
      }

      // Create notification for submitter
      const submitterType = approval.submitted_by_type === 'sub_user' ? 'sub_user' : 'branch';
      await createNotification(
        approval.submitted_by, submitterType, approval.approval_type,
        'Item Rejected',
        `Your ${approval.approval_type} submission has been rejected by Resident Pastor.`,
        approval.reference_id, approval.approval_type
      );

      res.json({ message: 'Item rejected and removed' });
    }
  } catch (error) {
    console.error('Review approval error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

