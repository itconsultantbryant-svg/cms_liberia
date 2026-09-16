const db = require('../database');

/** Sensitive keys: never auto-granted via isadmin / PRESIDENT shortcuts */
function isSensitivePerm(permKey) {
  return (
    String(permKey).startsWith('platform.') || String(permKey).startsWith('pastoral.')
  );
}

/**
 * Resolve effective permission keys for a user within a church.
 */
async function getUserPermissions(user, churchId = null) {
  const set = new Set();

  if (!user) return [];

  // Platform superadmin
  if (user.isSuperadmin || user.is_platform_admin) {
    const rows = await db.allAsync('SELECT perm_key FROM permissions');
    rows.forEach(r => set.add(r.perm_key));
    return [...set];
  }

  // Church admin flag → all non-platform, non-pastoral permissions
  if (user.isadmin) {
    const rows = await db.allAsync(
      `SELECT perm_key FROM permissions
       WHERE perm_key NOT LIKE 'platform.%' AND perm_key NOT LIKE 'pastoral.%'`
    );
    rows.forEach(r => set.add(r.perm_key));
  }

  const userId = user.id;

  // Permissions from assigned roles (system templates + church custom)
  const rolePerms = await db.allAsync(
    `SELECT DISTINCT rp.perm_key
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     JOIN role_permissions rp ON rp.role_id = r.id
     WHERE ur.user_id = ? AND ur.is_active = 1
       AND ur.user_type IN ('branch', 'sub_user', 'member')
       AND (r.church_id IS NULL OR r.church_id = ?)`,
    [userId, churchId]
  );
  rolePerms.forEach(r => set.add(r.perm_key));

  // Legacy JSON permissions on branch/sub_user
  let legacy = user.permissions;
  if (typeof legacy === 'string') {
    try {
      legacy = JSON.parse(legacy);
    } catch (_) {
      legacy = [];
    }
  }
  if (Array.isArray(legacy)) {
    const map = {
      view_members: ['members.view'],
      add_members: ['members.create', 'members.view'],
      record_attendance: ['attendance.manage', 'members.view'],
      record_collections: ['collections.manage'],
      view_reports: ['reports.view'],
      manage_finance: ['finance.view', 'finance.create'],
      manage_staff: ['staff.manage'],
      manage_payroll: ['payroll.manage'],
      user_management: ['users.manage'],
      role_management: ['roles.manage'],
      manage_branding: ['settings.manage'],
      view_dashboard: ['reports.view'],
      view_events: ['events.manage'],
      view_groups: ['groups.manage'],
      view_communications: ['communications.manage'],
      pastoral_care: ['pastoral.view', 'pastoral.manage']
    };
    for (const key of legacy) {
      if (map[key]) map[key].forEach(k => set.add(k));
      else if (String(key).includes('.')) set.add(key);
    }
  }

  return [...set];
}

async function hasPermission(user, permKey, churchId = null) {
  if (!user || !permKey) return false;
  if (user.isSuperadmin || user.is_platform_admin) return true;

  // isadmin / PRESIDENT shortcuts never cover pastoral.* (or platform.*)
  if (user.isadmin && !isSensitivePerm(permKey)) return true;

  const primary = user.primaryRole?.role_code || user.primaryRole?.roleCode || user.primaryRole;
  if (primary === 'PRESIDENT' && !isSensitivePerm(permKey)) return true;

  const perms = await getUserPermissions(user, churchId);
  return perms.includes(permKey);
}

function requirePermission(...permKeys) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      const churchId = req.churchId || req.user.churchId;
      // Attach primary role onto user for permission resolution
      if (req.primaryRole && !req.user.primaryRole) {
        req.user.primaryRole = req.primaryRole;
      }
      for (const key of permKeys) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await hasPermission(req.user, key, churchId);
        if (ok) return next();
      }
      return res.status(403).json({
        error: `Missing permission: ${permKeys.join(' or ')}`
      });
    } catch (error) {
      console.error('[requirePermission]', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

async function createCustomRole({
  churchId,
  roleName,
  roleCode,
  scope = 'church',
  description = '',
  permissions = [],
  level = 10
}) {
  if (!churchId || !roleName) {
    throw Object.assign(new Error('churchId and roleName required'), { status: 400 });
  }
  const code =
    roleCode ||
    `CUSTOM_${String(roleName)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .substring(0, 40)}_${churchId}`;

  const existing = await db.getAsync(
    `SELECT id FROM roles WHERE role_code = ? AND (church_id = ? OR (church_id IS NULL AND is_custom = 0))`,
    [code, churchId]
  );
  if (existing) {
    throw Object.assign(new Error('Role code already exists'), { status: 400 });
  }

  const { withTransaction } = require('./transactions');
  return withTransaction(async (tx) => {
    const result = await tx.runAsync(
      `INSERT INTO roles (role_code, role_name, level, office_type, description, scope, church_id, is_system, is_custom)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`,
      [code, roleName, level, scope, description, scope, churchId]
    );

    for (const key of permissions) {
      await tx.runAsync(
        `INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, ?)`,
        [result.lastID, key]
      );
    }

    return tx.getAsync('SELECT * FROM roles WHERE id = ?', [result.lastID]);
  });
}

async function setRolePermissions(roleId, churchId, permKeys) {
  const role = await db.getAsync('SELECT * FROM roles WHERE id = ?', [roleId]);
  if (!role) throw Object.assign(new Error('Role not found'), { status: 404 });
  if (role.is_system && !role.is_custom) {
    throw Object.assign(new Error('Cannot modify system role permissions'), { status: 403 });
  }
  if (role.church_id && Number(role.church_id) !== Number(churchId)) {
    throw Object.assign(new Error('Role not in this church'), { status: 403 });
  }

  await db.runAsync('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
  for (const key of permKeys || []) {
    await db.runAsync(
      `INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, ?)`,
      [roleId, key]
    );
  }
  return db.allAsync('SELECT perm_key FROM role_permissions WHERE role_id = ?', [roleId]);
}

async function listRolesForChurch(churchId) {
  return db.allAsync(
    `SELECT * FROM roles
     WHERE church_id IS NULL OR church_id = ?
     ORDER BY is_custom ASC, scope, level, role_name`,
    [churchId]
  );
}

async function getRolePermissionKeys(roleId) {
  const rows = await db.allAsync(
    'SELECT perm_key FROM role_permissions WHERE role_id = ? ORDER BY perm_key',
    [roleId]
  );
  return rows.map(r => r.perm_key);
}

module.exports = {
  isSensitivePerm,
  getUserPermissions,
  hasPermission,
  requirePermission,
  createCustomRole,
  setRolePermissions,
  listRolesForChurch,
  getRolePermissionKeys
};
