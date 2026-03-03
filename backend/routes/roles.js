const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireRole, attachRoleInfo } = require('../middleware/roleAuth');
const RoleManager = require('../utils/roles');

// Get all roles
router.get('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const roles = await db.allAsync('SELECT * FROM roles ORDER BY level, role_name');
    res.json(roles);
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get role hierarchy
router.get('/hierarchy', authMiddleware, async (req, res) => {
  try {
    const { role_code } = req.query;
    const hierarchy = await RoleManager.getRoleHierarchy(role_code);
    res.json(hierarchy);
  } catch (error) {
    console.error('Get hierarchy error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's roles
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const roles = await RoleManager.getUserRoles(req.params.userId, 'branch');
    res.json(roles);
  } catch (error) {
    console.error('Get user roles error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user's roles
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const roles = await RoleManager.getUserRoles(req.user.id, 'branch');
    const primaryRole = await RoleManager.getPrimaryRole(req.user.id, 'branch');
    const accessibleRoles = await RoleManager.getAccessibleRoles(req.user.id, 'branch');
    const reportingRoles = await RoleManager.getReportingRoles(req.user.id, 'branch');
    
    res.json({
      roles,
      primaryRole,
      accessibleRoles,
      reportingRoles
    });
  } catch (error) {
    console.error('Get my roles error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Assign role to user (only President and Mission Secretary can do this)
router.post('/assign', authMiddleware, requireRole('PRESIDENT', 'MISSION_SECRETARY'), async (req, res) => {
  try {
    const { userId, userType, roleCode, departmentId, location } = req.body;
    
    await RoleManager.assignRole(userId, userType, roleCode, departmentId, location, req.user.id);
    res.json({ message: 'Role assigned successfully' });
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Get all departments
router.get('/departments', authMiddleware, async (req, res) => {
  try {
    const departments = await db.allAsync(
      `SELECT d.*, 
       (SELECT COUNT(*) FROM user_roles ur WHERE ur.department_id = d.id AND ur.is_active = 1) as user_count
      FROM departments d
      ORDER BY d.office_type, d.department_name`
    );
    res.json(departments);
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get users by role
router.get('/role/:roleCode/users', authMiddleware, async (req, res) => {
  try {
    const users = await db.allAsync(
      `SELECT b.id, b.branchname, b.email, b.country, ur.location, ur.assigned_at
      FROM user_roles ur
      JOIN branches b ON ur.user_id = b.id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.role_code = ? AND ur.user_type = 'branch' AND ur.is_active = 1
      ORDER BY ur.assigned_at DESC`,
      [req.params.roleCode]
    );
    res.json(users);
  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check access
router.post('/check-access', authMiddleware, async (req, res) => {
  try {
    const { targetRoleCode } = req.body;
    const hasAccess = await RoleManager.hasAccess(req.user.id, 'branch', targetRoleCode);
    res.json({ hasAccess });
  } catch (error) {
    console.error('Check access error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

