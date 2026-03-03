const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo, requireRole } = require('../middleware/roleAuth');

// Get all sub-users for a Resident Pastor
router.get('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const userRole = req.primaryRole?.role_code;
    const branchId = req.user.branchId;

    let subUsers;
    
    if (userRole === 'RESIDENT_PASTOR' || userRole === 'RESIDENT_PASTOR_HQ') {
      // Resident Pastor sees their own sub-users
      subUsers = await db.allAsync(
        `SELECT id, email, firstname, lastname, position, permissions, is_active, created_at
         FROM sub_users
         WHERE created_by = ? AND branch_id = ?
         ORDER BY created_at DESC`,
        [req.user.id, branchId]
      );
    } else if (userRole === 'PRESIDENT' || userRole === 'MISSION_SECRETARY') {
      // Admin can see all sub-users
      subUsers = await db.allAsync(
        `SELECT su.*, b.branchname as pastor_name
         FROM sub_users su
         JOIN branches b ON su.created_by = b.id
         ORDER BY su.created_at DESC`,
        []
      );
    } else {
      // Sub-users see only themselves
      subUsers = await db.allAsync(
        'SELECT id, email, firstname, lastname, position, permissions, is_active FROM sub_users WHERE id = ?',
        [req.user.id]
      );
    }

    // Parse permissions JSON
    const subUsersWithParsedPermissions = subUsers.map(user => ({
      ...user,
      permissions: typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions
    }));

    res.json(subUsersWithParsedPermissions);
  } catch (error) {
    console.error('Get sub-users error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Create sub-user (Resident Pastor only)
router.post('/', authMiddleware, requireRole('RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'), async (req, res) => {
  try {
    const {
      email,
      password,
      firstname,
      lastname,
      position,
      permissions
    } = req.body;

    if (!email || !password || !firstname || !lastname || !position || !permissions) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate permissions
    const validPermissions = ['add_members', 'record_attendance', 'record_collections', 'view_reports', 'submit_financial_reports'];
    const permissionsArray = Array.isArray(permissions) ? permissions : [permissions];
    const invalidPermissions = permissionsArray.filter(p => !validPermissions.includes(p));
    
    if (invalidPermissions.length > 0) {
      return res.status(400).json({ error: `Invalid permissions: ${invalidPermissions.join(', ')}` });
    }

    // Check if email exists
    const existing = await db.getAsync('SELECT id FROM sub_users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.runAsync(
      `INSERT INTO sub_users (branch_id, created_by, email, password, firstname, lastname, position, permissions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.branchId,
        req.user.id,
        email,
        hashedPassword,
        firstname,
        lastname,
        position,
        JSON.stringify(permissionsArray)
      ]
    );

    res.json({
      message: 'Sub-user created successfully',
      userId: result.lastID
    });
  } catch (error) {
    console.error('Create sub-user error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Update sub-user
router.put('/:id', authMiddleware, requireRole('RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'), async (req, res) => {
  try {
    const subUser = await db.getAsync(
      'SELECT * FROM sub_users WHERE id = ? AND created_by = ?',
      [req.params.id, req.user.id]
    );

    if (!subUser) {
      return res.status(404).json({ error: 'Sub-user not found or unauthorized' });
    }

    const {
      email,
      password,
      firstname,
      lastname,
      position,
      permissions,
      is_active
    } = req.body;

    let updateFields = [];
    let updateValues = [];

    if (email) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push('password = ?');
      updateValues.push(hashedPassword);
    }
    if (firstname) {
      updateFields.push('firstname = ?');
      updateValues.push(firstname);
    }
    if (lastname) {
      updateFields.push('lastname = ?');
      updateValues.push(lastname);
    }
    if (position) {
      updateFields.push('position = ?');
      updateValues.push(position);
    }
    if (permissions) {
      const validPermissions = ['add_members', 'record_attendance', 'record_collections', 'view_reports', 'submit_financial_reports'];
      const permissionsArray = Array.isArray(permissions) ? permissions : [permissions];
      const invalidPermissions = permissionsArray.filter(p => !validPermissions.includes(p));
      
      if (invalidPermissions.length > 0) {
        return res.status(400).json({ error: `Invalid permissions: ${invalidPermissions.join(', ')}` });
      }
      
      updateFields.push('permissions = ?');
      updateValues.push(JSON.stringify(permissionsArray));
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(req.params.id);

    await db.runAsync(
      `UPDATE sub_users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    res.json({ message: 'Sub-user updated successfully' });
  } catch (error) {
    console.error('Update sub-user error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Delete sub-user
router.delete('/:id', authMiddleware, requireRole('RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'), async (req, res) => {
  try {
    const subUser = await db.getAsync(
      'SELECT * FROM sub_users WHERE id = ? AND created_by = ?',
      [req.params.id, req.user.id]
    );

    if (!subUser) {
      return res.status(404).json({ error: 'Sub-user not found or unauthorized' });
    }

    await db.runAsync('UPDATE sub_users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    res.json({ message: 'Sub-user deactivated successfully' });
  } catch (error) {
    console.error('Delete sub-user error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

