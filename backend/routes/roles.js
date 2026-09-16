const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireRole, attachRoleInfo } = require('../middleware/roleAuth');
const RoleManager = require('../utils/roles');
const {
  listRolesForChurch,
  getRolePermissionKeys,
  createCustomRole,
  setRolePermissions,
  getUserPermissions,
  requirePermission
} = require('../utils/rbac');
const { audit } = require('../utils/audit');

// Permission catalog (global)
router.get('/permissions', authMiddleware, async (req, res) => {
  try {
    const permissions = await db.allAsync(
      `SELECT perm_key, category, description FROM permissions ORDER BY category, perm_key`
    );
    res.json({ permissions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all roles visible to this church (templates + custom)
router.get('/', authMiddleware, requireTenant, attachRoleInfo, async (req, res) => {
  try {
    const roles = await listRolesForChurch(req.churchId);
    const withPerms = [];
    for (const role of roles) {
      const permissions = await getRolePermissionKeys(role.id);
      withPerms.push({ ...role, permissions });
    }
    res.json(withPerms);
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create custom church role
router.post(
  '/custom',
  authMiddleware,
  requireTenant,
  attachRoleInfo,
  requirePermission('roles.manage'),
  async (req, res) => {
    try {
      const { roleName, roleCode, description, permissions, scope, level } = req.body;
      const role = await createCustomRole({
        churchId: req.churchId,
        roleName,
        roleCode,
        description,
        permissions: permissions || [],
        scope: scope || 'church',
        level: level || 10
      });
      const perms = await getRolePermissionKeys(role.id);
      await audit(req, {
        action: 'create',
        resource: 'role',
        resourceId: role.id,
        summary: `Custom role created: ${roleName}`,
        newValues: { roleName, roleCode: role.role_code, permissions: perms }
      });
      res.status(201).json({ message: 'Custom role created', role: { ...role, permissions: perms } });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }
);

// Update custom role permissions
router.put(
  '/:id/permissions',
  authMiddleware,
  requireTenant,
  attachRoleInfo,
  requirePermission('roles.manage'),
  async (req, res) => {
    try {
      const permissions = await setRolePermissions(
        req.params.id,
        req.churchId,
        req.body.permissions || []
      );
      await audit(req, {
        action: 'permission_change',
        resource: 'role',
        resourceId: req.params.id,
        summary: 'Role permissions updated',
        newValues: { permissions: req.body.permissions || [] }
      });
      res.json({ message: 'Permissions updated', permissions: permissions.map(p => p.perm_key || p) });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }
);

// Delete custom role
router.delete(
  '/custom/:id',
  authMiddleware,
  requireTenant,
  attachRoleInfo,
  requirePermission('roles.manage'),
  async (req, res) => {
    try {
      const role = await db.getAsync('SELECT * FROM roles WHERE id = ?', [req.params.id]);
      if (!role || !role.is_custom || Number(role.church_id) !== Number(req.churchId)) {
        return res.status(404).json({ error: 'Custom role not found' });
      }
      await db.runAsync('DELETE FROM roles WHERE id = ?', [role.id]);
      res.json({ message: 'Custom role deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

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
router.get('/user/:userId', authMiddleware, requireTenant, async (req, res) => {
  try {
    const roles = await RoleManager.getUserRoles(req.params.userId, 'branch');
    res.json(roles);
  } catch (error) {
    console.error('Get user roles error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user's roles + effective permissions
router.get('/me', authMiddleware, requireTenant, async (req, res) => {
  try {
    const userType = req.user.userType === 'sub_user' ? 'branch' : 'branch';
    const roles = await RoleManager.getUserRoles(req.user.id, userType);
    const primaryRole = await RoleManager.getPrimaryRole(req.user.id, userType);
    const accessibleRoles = await RoleManager.getAccessibleRoles(req.user.id, userType);
    const reportingRoles = await RoleManager.getReportingRoles(req.user.id, userType);
    const permissions = await getUserPermissions(req.user, req.churchId);

    res.json({
      roles,
      primaryRole,
      accessibleRoles,
      reportingRoles,
      permissions
    });
  } catch (error) {
    console.error('Get my roles error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Assign role to user
router.post(
  '/assign',
  authMiddleware,
  requireTenant,
  requirePermission('roles.manage', 'users.manage'),
  async (req, res) => {
    try {
      const { userId, userType, roleCode, roleId, departmentId, location } = req.body;

      let code = roleCode;
      if (roleId && !code) {
        const role = await db.getAsync(
          `SELECT role_code, church_id FROM roles WHERE id = ? AND (church_id IS NULL OR church_id = ?)`,
          [roleId, req.churchId]
        );
        if (!role) return res.status(404).json({ error: 'Role not found' });
        code = role.role_code;
      }

      // Prefer RoleManager for system codes; for custom use role id insert
      const role = await db.getAsync(
        `SELECT id FROM roles WHERE role_code = ? AND (church_id IS NULL OR church_id = ?) ORDER BY church_id DESC LIMIT 1`,
        [code, req.churchId]
      );
      if (!role) return res.status(404).json({ error: 'Role not found' });

      await db.runAsync(
        `INSERT INTO user_roles (user_id, user_type, role_id, department_id, location, assigned_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, userType || 'branch', role.id, departmentId || null, location || null, req.user.id]
      );

      await audit(req, {
        action: 'role_change',
        resource: 'user_role',
        resourceId: userId,
        summary: `Role assigned: ${code}`,
        newValues: { userId, userType: userType || 'branch', roleCode: code, roleId: role.id }
      });

      res.json({ message: 'Role assigned successfully' });
    } catch (error) {
      console.error('Assign role error:', error);
      res.status(500).json({ error: error.message || 'Server error' });
    }
  }
);

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

// Get users by role (scoped to church via branch join)
router.get('/role/:roleCode/users', authMiddleware, requireTenant, async (req, res) => {
  try {
    const users = await db.allAsync(
      `SELECT b.id, b.branchname, b.email, b.country, ur.location, ur.assigned_at
      FROM user_roles ur
      JOIN branches b ON ur.user_id = b.id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.role_code = ? AND ur.user_type = 'branch' AND ur.is_active = 1
        AND b.church_id = ?
      ORDER BY ur.assigned_at DESC`,
      [req.params.roleCode, req.churchId]
    );
    res.json(users);
  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
