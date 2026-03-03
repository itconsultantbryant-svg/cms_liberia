const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const { authMiddleware } = require('../middleware/auth');
const { requireRole, attachRoleInfo } = require('../middleware/roleAuth');
const RoleManager = require('../utils/roles');

// Get all users (branches) with their roles
router.get('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const users = await db.allAsync(
      `SELECT b.id, b.branchname, b.email, b.branchcode, b.address, b.city, b.state, b.country, b.currency, b.isadmin, b.created_at, b.permissions
      FROM branches b
      ORDER BY b.created_at DESC`
    );

    // Get roles for each user
    const usersWithRoles = await Promise.all(
      users.map(async (user) => {
        const roles = await RoleManager.getUserRoles(user.id, 'branch');
        const primaryRole = await RoleManager.getPrimaryRole(user.id, 'branch');
        return {
          ...user,
          roles: roles,
          primaryRole: primaryRole
        };
      })
    );

    res.json(usersWithRoles);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single user with roles
router.get('/:id', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const user = await db.getAsync(
      'SELECT id, branchname, email, branchcode, address, city, state, country, currency, isadmin, permissions FROM branches WHERE id = ?',
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const roles = await RoleManager.getUserRoles(user.id, 'branch');
    const primaryRole = await RoleManager.getPrimaryRole(user.id, 'branch');
    const accessibleRoles = await RoleManager.getAccessibleRoles(user.id, 'branch');
    const perms = (user.permissions && user.permissions !== '[]')
      ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions)
      : [];
    res.json({
      ...user,
      permissions: Array.isArray(perms) ? perms : [],
      roles: roles,
      primaryRole: primaryRole,
      accessibleRoles: accessibleRoles
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new user account with role assignment
router.post('/', authMiddleware, requireRole('PRESIDENT', 'MISSION_SECRETARY'), async (req, res) => {
  try {
    const {
      branchname,
      branchcode,
      email,
      password,
      address,
      city,
      state,
      country,
      currency,
      roleCode,
      departmentId,
      location,
      permissions
    } = req.body;

    // Validate required fields
    if (!branchname || !email || !password || !roleCode) {
      return res.status(400).json({ error: 'Missing required fields: branchname, email, password, roleCode' });
    }

    // Check if email exists
    const existing = await db.getAsync('SELECT id FROM branches WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const permJson = Array.isArray(permissions) ? JSON.stringify(permissions) : '[]';
    // Create branch/user
    const result = await db.runAsync(
      'INSERT INTO branches (branchname, branchcode, email, password, address, city, state, country, currency, isadmin, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [branchname, branchcode || '', email, hashedPassword, address || '', city || '', state || '', country || '', currency || 'USD', 0, permJson]
    );

    // Assign role
    try {
      await RoleManager.assignRole(result.lastID, 'branch', roleCode, departmentId || null, location || null, req.user.id);
    } catch (error) {
      console.error('Error assigning role:', error);
      // Delete the user if role assignment fails
      await db.runAsync('DELETE FROM branches WHERE id = ?', [result.lastID]);
      return res.status(400).json({ error: 'Failed to assign role: ' + error.message });
    }

    // Create admin member for this branch
    const [firstname, ...lastnameParts] = branchname.split(' ');
    const lastname = lastnameParts.join(' ') || '';

    await db.runAsync(
      'INSERT INTO members (branch_id, firstname, lastname, email, password, isadmin, position, sex, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [result.lastID, firstname, lastname, email, hashedPassword, 1, 'senior pastor', 'male', 'Mr']
    );

    res.json({
      message: 'User account created successfully',
      userId: result.lastID,
      roleAssigned: roleCode
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Update user role assignment
router.put('/:id/role', authMiddleware, requireRole('PRESIDENT', 'MISSION_SECRETARY'), async (req, res) => {
  try {
    const { roleCode, departmentId, location, permissions } = req.body;
    const userId = req.params.id;

    if (!roleCode) {
      return res.status(400).json({ error: 'Role code is required' });
    }

    // Check if user exists
    const user = await db.getAsync('SELECT id FROM branches WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Deactivate existing roles
    await db.runAsync(
      'UPDATE user_roles SET is_active = 0 WHERE user_id = ? AND user_type = ?',
      [userId, 'branch']
    );

    // Assign new role
    await RoleManager.assignRole(userId, 'branch', roleCode, departmentId || null, location || null, req.user.id);

    // Update permissions if provided
    if (Array.isArray(permissions)) {
      await db.runAsync('UPDATE branches SET permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(permissions), userId]);
    }

    res.json({ message: 'Role assigned successfully' });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Add additional role to user (users can have multiple roles)
router.post('/:id/roles', authMiddleware, requireRole('PRESIDENT', 'MISSION_SECRETARY'), async (req, res) => {
  try {
    const { roleCode, departmentId, location } = req.body;
    const userId = req.params.id;

    if (!roleCode) {
      return res.status(400).json({ error: 'Role code is required' });
    }

    // Check if user exists
    const user = await db.getAsync('SELECT id FROM branches WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if role already assigned
    const existing = await db.getAsync(
      'SELECT id FROM user_roles WHERE user_id = ? AND user_type = ? AND role_id = (SELECT id FROM roles WHERE role_code = ?) AND is_active = 1',
      [userId, 'branch', roleCode]
    );

    if (existing) {
      return res.status(400).json({ error: 'Role already assigned to this user' });
    }

    // Assign role
    await RoleManager.assignRole(userId, 'branch', roleCode, departmentId || null, location || null, req.user.id);

    res.json({ message: 'Role added successfully' });
  } catch (error) {
    console.error('Add role error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Remove role from user
router.delete('/:id/roles/:roleId', authMiddleware, requireRole('PRESIDENT', 'MISSION_SECRETARY'), async (req, res) => {
  try {
    await db.runAsync(
      'UPDATE user_roles SET is_active = 0 WHERE user_id = ? AND user_type = ? AND role_id = ?',
      [req.params.id, 'branch', req.params.roleId]
    );

    res.json({ message: 'Role removed successfully' });
  } catch (error) {
    console.error('Remove role error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user account
router.delete('/:id', authMiddleware, requireRole('PRESIDENT', 'MISSION_SECRETARY'), async (req, res) => {
  try {
    const user = await db.getAsync('SELECT branchname FROM branches WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.runAsync('DELETE FROM branches WHERE id = ?', [req.params.id]);
    res.json({ message: `User ${user.branchname} deleted successfully` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

