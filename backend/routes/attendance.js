const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { isSubUser, requireSubUserPermission } = require('../middleware/subUserAuth');

// Mark attendance
router.post('/mark', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { date, member_id, attendance, type } = req.body;
    
    if (new Date(date) > new Date()) {
      return res.status(400).json({ error: "Can't save attendance for a future date" });
    }
    
    const dateStr = new Date(date).toISOString().split('T')[0];
    
    // Check if already marked
    const existing = await db.getAsync(
      'SELECT id FROM member_attendances WHERE date = ? AND member_id = ?',
      [dateStr, member_id]
    );
    
    if (existing) {
      return res.status(400).json({ error: 'Attendance already marked for this date' });
    }
    
    await db.runAsync(
      'INSERT INTO member_attendances (member_id, attendance, date, service_types_id) VALUES (?, ?, ?, ?)',
      [member_id, attendance || 'no', dateStr, type]
    );
    
    res.json({ message: 'Attendance marked successfully' });
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark bulk attendance
router.post('/mark-bulk', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { date, members, type } = req.body;
    
    if (new Date(date) > new Date()) {
      return res.status(400).json({ error: "Can't save attendance for a future date" });
    }
    
    const dateStr = new Date(date).toISOString().split('T')[0];
    
    // Check if already marked
    const existing = await db.getAsync(
      'SELECT id FROM member_attendances WHERE date = ?',
      [dateStr]
    );
    
    if (existing) {
      return res.status(400).json({ error: 'Attendance already marked for this date' });
    }
    
    // Insert all attendances
    for (const member of members) {
      await db.runAsync(
        'INSERT INTO member_attendances (member_id, attendance, date, service_types_id) VALUES (?, ?, ?, ?)',
        [member.id, member.attendance || 'no', dateStr, type]
      );
    }
    
    res.json({ message: 'Attendance marked successfully' });
  } catch (error) {
    console.error('Mark bulk attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save attendance (summary) - supports sub-user submission with approval
router.post('/submit', authMiddleware, isSubUser, requireSubUserPermission('record_attendance'), async (req, res) => {
  try {
    const { date, male, female, children, type } = req.body;
    
    if (new Date(date) > new Date()) {
      return res.status(400).json({ error: "Can't save attendance for a future date" });
    }
    
    const dateStr = new Date(date).toISOString().split('T')[0];
    
    // Check if already exists
    const existing = await db.getAsync(
      'SELECT id FROM attendances WHERE attendance_date = ? AND branch_id = ?',
      [dateStr, req.user.branchId]
    );
    
    if (existing) {
      return res.status(400).json({ error: 'Attendance for this date already exists' });
    }
    
    const result = await db.runAsync(
      'INSERT INTO attendances (branch_id, male, female, children, service_types_id, attendance_date) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.branchId, male || 0, female || 0, children || 0, type, dateStr]
    );
    
    // If submitted by sub-user, create pending approval
    if (req.userType === 'sub_user') {
      await db.runAsync(
        `INSERT INTO pending_approvals (branch_id, submitted_by, submitted_by_type, approval_type, reference_id, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.branchId, req.user.id, 'sub_user', 'attendance', result.lastID, 'pending']
      );
      
      return res.json({ 
        message: 'Attendance submitted successfully. Waiting for Resident Pastor approval.',
        requiresApproval: true
      });
    }
    
    res.json({ message: 'Attendance successfully saved' });
  } catch (error) {
    console.error('Submit attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get attendance by date
router.get('/view/:date', authMiddleware, async (req, res) => {
  try {
    const dateStr = new Date(req.params.date).toISOString().split('T')[0];
    const attendance = await db.getAsync(
      `SELECT a.*, st.name as service_type_name 
      FROM attendances a
      LEFT JOIN service_types st ON a.service_types_id = st.id
      WHERE a.attendance_date = ? AND a.branch_id = ?`,
      [dateStr, req.user.branchId]
    );
    
    if (!attendance) {
      return res.status(404).json({ error: 'No attendance data for this date' });
    }
    
    res.json({ attendance });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all attendances
router.get('/view', authMiddleware, async (req, res) => {
  try {
    const attendances = await db.allAsync(
      `SELECT a.*, st.name as service_type_name 
      FROM attendances a
      LEFT JOIN service_types st ON a.service_types_id = st.id
      WHERE a.branch_id = ? ORDER BY a.attendance_date DESC`,
      [req.user.branchId]
    );
    res.json(attendances);
  } catch (error) {
    console.error('Get attendances error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get attendance analysis
router.get('/analysis', authMiddleware, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    
    // Monthly stats
    const monthly = await db.allAsync(
      `SELECT 
        SUM(male) as male, 
        SUM(female) as female, 
        SUM(children) as children,
        strftime('%m', attendance_date) as month 
      FROM attendances 
      WHERE strftime('%Y', attendance_date) = ? AND branch_id = ? 
      GROUP BY month`,
      [currentYear.toString(), req.user.branchId]
    );
    
    // Weekly stats (last 7 days)
    const weekly = await db.allAsync(
      `SELECT 
        SUM(male) as male, 
        SUM(female) as female, 
        SUM(children) as children,
        strftime('%w', attendance_date) as day 
      FROM attendances 
      WHERE attendance_date >= date('now', '-7 days') AND branch_id = ? 
      GROUP BY day`,
      [req.user.branchId]
    );
    
    res.json({ monthly, weekly });
  } catch (error) {
    console.error('Get attendance analysis error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get attendance stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await db.allAsync(
      `SELECT 
        COUNT(id) as total, 
        SUM(male) as male, 
        SUM(female) as female, 
        SUM(children) as children,
        strftime('%m', attendance_date) as month 
      FROM attendances 
      WHERE attendance_date >= date('now', '-12 months') AND branch_id = ? 
      GROUP BY month`,
      [req.user.branchId]
    );
    
    res.json(stats);
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

