const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo, requireRole } = require('../middleware/roleAuth');
const { isSubUser, requireSubUserPermission } = require('../middleware/subUserAuth');
const { createNotification } = require('./notifications');

// Submit finance report (Sub-user or Staff)
router.post('/', authMiddleware, isSubUser, requireSubUserPermission('submit_financial_reports'), async (req, res) => {
  try {
    const {
      report_type,
      title,
      period_start,
      period_end,
      content
    } = req.body;

    if (!report_type || !title || !period_start || !period_end || !content) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const result = await db.runAsync(
      `INSERT INTO request_reports (branch_id, submitted_by, submitted_by_type, report_type, title, period_start, period_end, content, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        req.user.branchId,
        req.user.id,
        req.userType === 'sub_user' ? 'sub_user' : 'branch',
        report_type,
        title,
        period_start,
        period_end,
        typeof content === 'string' ? content : JSON.stringify(content)
      ]
    );

    res.json({
      message: 'Finance report submitted successfully. Waiting for Resident Pastor approval.',
      reportId: result.lastID,
      requiresApproval: true
    });
  } catch (error) {
    console.error('Submit finance report error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get finance reports (filtered by role)
router.get('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const userRole = req.primaryRole?.role_code;
    const branchId = req.user.branchId;

    let reports;

    if (userRole === 'RESIDENT_PASTOR' || userRole === 'RESIDENT_PASTOR_HQ') {
      // Resident Pastor sees reports from their branch
      reports = await db.allAsync(
        `SELECT rr.*, 
         b.branchname as submitted_by_name,
         su.firstname || ' ' || su.lastname as sub_user_name,
         su.position as sub_user_position
         FROM request_reports rr
         LEFT JOIN branches b ON rr.submitted_by = b.id AND rr.submitted_by_type = 'branch'
         LEFT JOIN sub_users su ON rr.submitted_by = su.id AND rr.submitted_by_type = 'sub_user'
         WHERE rr.branch_id = ?
         ORDER BY rr.created_at DESC`,
        [branchId]
      );
    } else if (userRole === 'MISSION_SECRETARY' || userRole === 'MISSION_SECRETARY_MISSION') {
      // Mission Secretary sees reports approved by Resident Pastor
      reports = await db.allAsync(
        `SELECT rr.*, 
         b.branchname as submitted_by_name,
         su.firstname || ' ' || su.lastname as sub_user_name
         FROM request_reports rr
         LEFT JOIN branches b ON rr.submitted_by = b.id AND rr.submitted_by_type = 'branch'
         LEFT JOIN sub_users su ON rr.submitted_by = su.id AND rr.submitted_by_type = 'sub_user'
         WHERE rr.status IN ('approved_by_pastor', 'approved_by_mission_secretary', 'rejected_by_mission_secretary', 'approved_by_finance', 'rejected_by_finance', 'approved', 'rejected')
         ORDER BY rr.created_at DESC`,
        []
      );
    } else if (userRole === 'FINANCE_OFFICER') {
      // Finance Officer sees reports approved by Mission Secretary
      reports = await db.allAsync(
        `SELECT rr.*, 
         b.branchname as submitted_by_name,
         su.firstname || ' ' || su.lastname as sub_user_name
         FROM request_reports rr
         LEFT JOIN branches b ON rr.submitted_by = b.id AND rr.submitted_by_type = 'branch'
         LEFT JOIN sub_users su ON rr.submitted_by = su.id AND rr.submitted_by_type = 'sub_user'
         WHERE rr.status IN ('approved_by_mission_secretary', 'approved_by_finance', 'rejected_by_finance', 'approved', 'rejected')
         ORDER BY rr.created_at DESC`,
        []
      );
    } else if (userRole === 'PRESIDENT') {
      // Admin sees all reports
      reports = await db.allAsync(
        `SELECT rr.*, 
         b.branchname as submitted_by_name,
         su.firstname || ' ' || su.lastname as sub_user_name
         FROM request_reports rr
         LEFT JOIN branches b ON rr.submitted_by = b.id AND rr.submitted_by_type = 'branch'
         LEFT JOIN sub_users su ON rr.submitted_by = su.id AND rr.submitted_by_type = 'sub_user'
         ORDER BY rr.created_at DESC`,
        []
      );
    } else {
      // Sub-users see only their own reports
      reports = await db.allAsync(
        `SELECT rr.* FROM request_reports rr
         WHERE rr.submitted_by = ? AND rr.submitted_by_type = ?
         ORDER BY rr.created_at DESC`,
        [req.user.id, req.userType === 'sub_user' ? 'sub_user' : 'branch']
      );
    }

    // Parse content JSON
    const reportsWithParsedContent = reports.map(report => ({
      ...report,
      content: typeof report.content === 'string' ? JSON.parse(report.content) : report.content
    }));

    res.json(reportsWithParsedContent);
  } catch (error) {
    console.error('Get finance reports error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Resident Pastor: Approve/Reject finance report
router.post('/:id/approve-pastor', authMiddleware, requireRole('RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'), async (req, res) => {
  try {
    const { action, comments } = req.body;
    const reportId = req.params.id;

    const report = await db.getAsync(
      'SELECT * FROM request_reports WHERE id = ? AND branch_id = ? AND status = ?',
      [reportId, req.user.branchId, 'pending']
    );

    if (!report) {
      return res.status(404).json({ error: 'Report not found or already processed' });
    }

    const newStatus = action === 'approve' 
      ? 'approved_by_pastor' 
      : 'rejected_by_pastor';

    await db.runAsync(
      'UPDATE request_reports SET status = ?, reviewed_by = ?, review_comments = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, req.user.id, comments || '', reportId]
    );

    // Create notifications
    const submitterType = report.submitted_by_type === 'sub_user' ? 'sub_user' : 'branch';
    await createNotification(
      report.submitted_by, submitterType, 'report',
      action === 'approve' ? 'Report Approved' : 'Report Rejected',
      `Your finance report "${report.title}" has been ${action === 'approve' ? 'approved' : 'rejected'} by Resident Pastor.`,
      reportId, 'report'
    );

    if (action === 'approve') {
      // Notify Mission Secretary (reports go to Mission Secretary first)
      const missionSecretaries = await db.allAsync(
        `SELECT b.id FROM branches b
         JOIN user_roles ur ON b.id = ur.user_id
         JOIN roles r ON ur.role_id = r.id
         WHERE r.role_code IN ('MISSION_SECRETARY', 'MISSION_SECRETARY_MISSION') AND ur.user_type = 'branch'`
      );
      for (const ms of missionSecretaries) {
        await createNotification(
          ms.id, 'branch', 'report',
          'Finance Report Pending Review',
          `Finance report "${report.title}" has been approved by Resident Pastor and is pending your review.`,
          reportId, 'report'
        );
      }
    }

    res.json({ 
      message: `Report ${action === 'approve' ? 'approved' : 'rejected'} by Resident Pastor`,
      status: newStatus
    });
  } catch (error) {
    console.error('Pastor approval error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Finance Officer: Approve/Reject finance report
router.post('/:id/approve-finance', authMiddleware, requireRole('FINANCE_OFFICER'), async (req, res) => {
  try {
    const { action, comments } = req.body;
    const reportId = req.params.id;

    const report = await db.getAsync(
      'SELECT * FROM request_reports WHERE id = ? AND status = ?',
      [reportId, 'approved_by_pastor']
    );

    if (!report) {
      return res.status(404).json({ error: 'Report must be approved by Resident Pastor first' });
    }

    const newStatus = action === 'approve' 
      ? 'approved' 
      : 'rejected_by_finance';

    await db.runAsync(
      'UPDATE request_reports SET status = ?, reviewed_by = ?, review_comments = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, req.user.id, comments || '', reportId]
    );

    // Create notifications
    const submitterType = report.submitted_by_type === 'sub_user' ? 'sub_user' : 'branch';
    await createNotification(
      report.submitted_by, submitterType, 'report',
      action === 'approve' ? 'Report Approved by Finance' : 'Report Rejected',
      `Your finance report "${report.title}" has been ${action === 'approve' ? 'approved' : 'rejected'} by Finance Officer.`,
      reportId, 'report'
    );

    res.json({ 
      message: `Report ${action === 'approve' ? 'approved' : 'rejected'} by Finance Officer`,
      status: newStatus
    });
  } catch (error) {
    console.error('Finance approval error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

