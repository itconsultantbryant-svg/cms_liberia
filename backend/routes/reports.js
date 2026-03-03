const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');

// Get all reports (filtered by user's department/role)
router.get('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    let reports;
    
    // President can see all reports
    if (req.primaryRole?.role_code === 'PRESIDENT') {
      reports = await db.allAsync(
        `SELECT r.*, b.branchname as submitted_by_name
        FROM reports r
        LEFT JOIN branches b ON r.branch_id = b.id
        ORDER BY r.created_at DESC`
      );
    } else {
      // Others see only their own reports or reports from their department
      const userDepartment = req.primaryRole?.department || '';
      reports = await db.allAsync(
        `SELECT r.*, b.branchname as submitted_by_name
        FROM reports r
        LEFT JOIN branches b ON r.branch_id = b.id
        WHERE r.branch_id = ? OR r.department = ?
        ORDER BY r.created_at DESC`,
        [req.user.branchId, userDepartment]
      );
    }

    // Get staff performance for each report
    const reportsWithStaff = await Promise.all(
      reports.map(async (report) => {
        const staffPerformance = await db.allAsync(
          'SELECT * FROM report_staff_performance WHERE report_id = ?',
          [report.id]
        );
        return {
          ...report,
          staffPerformance: staffPerformance
        };
      })
    );

    res.json(reportsWithStaff);
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single report
router.get('/:id', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const report = await db.getAsync(
      `SELECT r.*, b.branchname as submitted_by_name
      FROM reports r
      LEFT JOIN branches b ON r.branch_id = b.id
      WHERE r.id = ?`,
      [req.params.id]
    );

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check access (user's own report or President)
    if (report.branch_id !== req.user.branchId && req.primaryRole?.role_code !== 'PRESIDENT') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const staffPerformance = await db.allAsync(
      'SELECT * FROM report_staff_performance WHERE report_id = ? ORDER BY id',
      [req.params.id]
    );

    res.json({
      ...report,
      staffPerformance: staffPerformance
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new report
router.post('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const {
      department,
      report_type,
      report_period_start,
      report_period_end,
      overview,
      general_observations,
      task_completion_rate,
      recommendations,
      conclusion,
      staffPerformance
    } = req.body;

    if (!department || !report_type || !report_period_start || !report_period_end) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create report
    const result = await db.runAsync(
      `INSERT INTO reports (
        branch_id, department, report_type, report_period_start, report_period_end,
        overview, general_observations, task_completion_rate, recommendations, conclusion, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.branchId,
        department,
        report_type,
        report_period_start,
        report_period_end,
        overview || '',
        general_observations || '',
        task_completion_rate || 0,
        recommendations || '',
        conclusion || '',
        'draft'
      ]
    );

    // Add staff performance entries
    if (Array.isArray(staffPerformance) && staffPerformance.length > 0) {
      for (const staff of staffPerformance) {
        await db.runAsync(
          `INSERT INTO report_staff_performance (
            report_id, staff_name, completed_tasks, pending_tasks,
            tasks_completed_count, tasks_pending_count, support_needed, remarks
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            result.lastID,
            staff.staff_name || '',
            typeof staff.completed_tasks === 'string' ? staff.completed_tasks : JSON.stringify(staff.completed_tasks || []),
            typeof staff.pending_tasks === 'string' ? staff.pending_tasks : JSON.stringify(staff.pending_tasks || []),
            staff.tasks_completed_count || 0,
            staff.tasks_pending_count || 0,
            staff.support_needed || '',
            staff.remarks || ''
          ]
        );
      }
    }

    res.json({
      message: 'Report created successfully',
      reportId: result.lastID
    });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Update report
router.put('/:id', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const report = await db.getAsync('SELECT branch_id, status FROM reports WHERE id = ?', [req.params.id]);
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check access
    if (report.branch_id !== req.user.branchId && req.primaryRole?.role_code !== 'PRESIDENT') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Can't edit submitted/approved reports
    if (report.status !== 'draft' && req.primaryRole?.role_code !== 'PRESIDENT') {
      return res.status(400).json({ error: 'Cannot edit submitted or approved reports' });
    }

    const {
      overview,
      general_observations,
      task_completion_rate,
      recommendations,
      conclusion,
      staffPerformance
    } = req.body;

    // Update report
    await db.runAsync(
      `UPDATE reports SET
        overview = ?, general_observations = ?, task_completion_rate = ?,
        recommendations = ?, conclusion = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        overview || '',
        general_observations || '',
        task_completion_rate || 0,
        recommendations || '',
        conclusion || '',
        req.params.id
      ]
    );

    // Update staff performance
    if (Array.isArray(staffPerformance)) {
      // Delete existing staff performance
      await db.runAsync('DELETE FROM report_staff_performance WHERE report_id = ?', [req.params.id]);

      // Insert updated staff performance
      for (const staff of staffPerformance) {
        await db.runAsync(
          `INSERT INTO report_staff_performance (
            report_id, staff_name, completed_tasks, pending_tasks,
            tasks_completed_count, tasks_pending_count, support_needed, remarks
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.params.id,
            staff.staff_name || '',
            typeof staff.completed_tasks === 'string' ? staff.completed_tasks : JSON.stringify(staff.completed_tasks || []),
            typeof staff.pending_tasks === 'string' ? staff.pending_tasks : JSON.stringify(staff.pending_tasks || []),
            staff.tasks_completed_count || 0,
            staff.tasks_pending_count || 0,
            staff.support_needed || '',
            staff.remarks || ''
          ]
        );
      }
    }

    res.json({ message: 'Report updated successfully' });
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Submit report
router.post('/:id/submit', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const report = await db.getAsync('SELECT branch_id, status FROM reports WHERE id = ?', [req.params.id]);
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (report.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (report.status !== 'draft') {
      return res.status(400).json({ error: 'Report already submitted' });
    }

    await db.runAsync(
      'UPDATE reports SET status = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['submitted', req.params.id]
    );

    res.json({ message: 'Report submitted successfully' });
  } catch (error) {
    console.error('Submit report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve/Reject report (President only)
router.post('/:id/approve', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    if (req.primaryRole?.role_code !== 'PRESIDENT') {
      return res.status(403).json({ error: 'Only President can approve reports' });
    }

    const { status } = req.body; // 'approved' or 'rejected'

    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }

    await db.runAsync(
      'UPDATE reports SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, req.user.branchId, req.params.id]
    );

    res.json({ message: `Report ${status} successfully` });
  } catch (error) {
    console.error('Approve report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete report
router.delete('/:id', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const report = await db.getAsync('SELECT branch_id, status FROM reports WHERE id = ?', [req.params.id]);
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Only owner or President can delete
    if (report.branch_id !== req.user.branchId && req.primaryRole?.role_code !== 'PRESIDENT') {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.runAsync('DELETE FROM reports WHERE id = ?', [req.params.id]);
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
