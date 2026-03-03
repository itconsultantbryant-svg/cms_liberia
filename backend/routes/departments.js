const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo, requireRole } = require('../middleware/roleAuth');

// Get all departments
router.get('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const departments = await db.allAsync(
      `SELECT d.*, 
       pd.department_name as parent_department_name,
       COUNT(DISTINCT ur.user_id) as assigned_users_count
       FROM departments d
       LEFT JOIN departments pd ON d.parent_department_id = pd.id
       LEFT JOIN user_roles ur ON d.id = ur.department_id AND ur.is_active = 1
       GROUP BY d.id
       ORDER BY d.department_name ASC`
    );

    res.json(departments);
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get single department
router.get('/:id', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const department = await db.getAsync(
      `SELECT d.*, pd.department_name as parent_department_name
       FROM departments d
       LEFT JOIN departments pd ON d.parent_department_id = pd.id
       WHERE d.id = ?`,
      [req.params.id]
    );

    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Get users assigned to this department
    const users = await db.allAsync(
      `SELECT b.id, b.branchname, b.email, ur.role_id, r.role_name
       FROM user_roles ur
       JOIN branches b ON ur.user_id = b.id
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.department_id = ? AND ur.is_active = 1 AND ur.user_type = 'branch'`,
      [req.params.id]
    );

    res.json({ ...department, users });
  } catch (error) {
    console.error('Get department error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Create department (Admin/President only)
router.post('/', authMiddleware, requireRole('PRESIDENT'), async (req, res) => {
  try {
    const {
      department_code,
      department_name,
      parent_department_id,
      office_type,
      location,
      description
    } = req.body;

    if (!department_code || !department_name || !office_type) {
      return res.status(400).json({ error: 'Department code, name, and office type are required' });
    }

    const result = await db.runAsync(
      `INSERT INTO departments (department_code, department_name, parent_department_id, office_type, location, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        department_code,
        department_name,
        parent_department_id || null,
        office_type,
        location || null,
        description || null
      ]
    );

    res.json({
      message: 'Department created successfully',
      departmentId: result.lastID
    });
  } catch (error) {
    console.error('Create department error:', error);
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Department code already exists' });
    }
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Update department (Admin/President only)
router.put('/:id', authMiddleware, requireRole('PRESIDENT'), async (req, res) => {
  try {
    const {
      department_code,
      department_name,
      parent_department_id,
      office_type,
      location,
      description
    } = req.body;

    const department = await db.getAsync('SELECT id FROM departments WHERE id = ?', [req.params.id]);
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    await db.runAsync(
      `UPDATE departments 
       SET department_code = COALESCE(?, department_code),
           department_name = COALESCE(?, department_name),
           parent_department_id = ?,
           office_type = COALESCE(?, office_type),
           location = ?,
           description = ?
       WHERE id = ?`,
      [
        department_code,
        department_name,
        parent_department_id || null,
        office_type,
        location || null,
        description || null,
        req.params.id
      ]
    );

    res.json({ message: 'Department updated successfully' });
  } catch (error) {
    console.error('Update department error:', error);
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Department code already exists' });
    }
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Delete department (Admin/President only)
router.delete('/:id', authMiddleware, requireRole('PRESIDENT'), async (req, res) => {
  try {
    const department = await db.getAsync('SELECT department_name FROM departments WHERE id = ?', [req.params.id]);
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Check if department has users assigned
    const usersCount = await db.getAsync(
      'SELECT COUNT(*) as count FROM user_roles WHERE department_id = ? AND is_active = 1',
      [req.params.id]
    );

    if (usersCount.count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete department. ${usersCount.count} user(s) are assigned to this department.` 
      });
    }

    await db.runAsync('DELETE FROM departments WHERE id = ?', [req.params.id]);
    res.json({ message: `Department ${department.department_name} deleted successfully` });
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

