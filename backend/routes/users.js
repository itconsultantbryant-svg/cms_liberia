const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const { requireRole, attachRoleInfo } = require('../middleware/roleAuth');
const { requirePermission } = require('../utils/rbac');
const RoleManager = require('../utils/roles');
const { validatePassword, hashPassword } = require('../utils/authSecurity');
const { audit } = require('../utils/audit');

router.use(attachRoleInfo);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../uploads/users');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  }),
  limits: { fileSize: 3 * 1024 * 1024 }
});

const manageUsers = requirePermission('users.manage');
const adminRoles = requireRole('PRESIDENT', 'MISSION_SECRETARY');

function tempPassword() {
  return `Tmp${crypto.randomBytes(4).toString('hex')}A1`;
}

async function enrichBranchUser(user) {
  const roles = await RoleManager.getUserRoles(user.id, 'branch');
  const primaryRole = await RoleManager.getPrimaryRole(user.id, 'branch');
  let perms = user.permissions;
  if (typeof perms === 'string') {
    try {
      perms = JSON.parse(perms);
    } catch (_) {
      perms = [];
    }
  }
  return {
    ...user,
    accountType: 'branch',
    permissions: Array.isArray(perms) ? perms : [],
    roles,
    primaryRole,
    displayName: user.branchname,
    jobTitle: user.job_title || primaryRole?.role_name || null,
    status: user.status || (user.is_login_enabled === 0 ? 'suspended' : 'active')
  };
}

/** Meta for user management UI */
router.get('/meta', manageUsers, async (req, res) => {
  try {
    const branches = await db.allAsync(
      `SELECT id, branchname, branchcode, is_headquarters, status
       FROM branches WHERE church_id = ? ORDER BY is_headquarters DESC, branchname`,
      [req.churchId]
    );
    const roles = await db.allAsync(
      `SELECT id, role_code, role_name, scope, level
       FROM roles
       WHERE (church_id IS NULL OR church_id = ?) AND COALESCE(scope, 'church') != 'platform'
       ORDER BY level, role_name`,
      [req.churchId]
    );
    res.json({
      statuses: ['active', 'invited', 'suspended'],
      accountTypes: ['branch', 'sub_user'],
      branches,
      roles
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Unified directory: branch logins + sub-users */
router.get('/directory', manageUsers, async (req, res) => {
  try {
    const branches = await db.allAsync(
      `SELECT id, branchname, email, phone, job_title, photo_url, branchcode, city, country,
              isadmin, status, is_login_enabled, church_id, created_at, permissions
       FROM branches WHERE church_id = ?
       ORDER BY created_at DESC`,
      [req.churchId]
    );
    const branchUsers = await Promise.all(branches.map(enrichBranchUser));

    const subUsers = await db.allAsync(
      `SELECT su.id, su.email, su.firstname, su.lastname, su.phone, su.job_title, su.position,
              su.photo_url, su.status, su.is_active, su.branch_id, su.department_id, su.permissions,
              su.created_at, b.branchname
       FROM sub_users su
       LEFT JOIN branches b ON b.id = su.branch_id
       WHERE su.church_id = ? OR su.branch_id IN (SELECT id FROM branches WHERE church_id = ?)
       ORDER BY su.created_at DESC`,
      [req.churchId, req.churchId]
    );

    const mappedSubs = subUsers.map(su => {
      let perms = su.permissions;
      if (typeof perms === 'string') {
        try {
          perms = JSON.parse(perms);
        } catch (_) {
          perms = [];
        }
      }
      return {
        ...su,
        accountType: 'sub_user',
        displayName: `${su.firstname} ${su.lastname}`.trim(),
        jobTitle: su.job_title || su.position,
        status: su.status || (su.is_active ? 'active' : 'suspended'),
        permissions: Array.isArray(perms) ? perms : []
      };
    });

    let users = [...branchUsers, ...mappedSubs];
    if (req.query.status) {
      users = users.filter(u => u.status === req.query.status);
    }
    if (req.query.q) {
      const q = String(req.query.q).toLowerCase();
      users = users.filter(
        u =>
          String(u.displayName || '').toLowerCase().includes(q) ||
          String(u.email || '').toLowerCase().includes(q)
      );
    }

    res.json({ users, counts: { branch: branchUsers.length, subUser: mappedSubs.length } });
  } catch (error) {
    console.error('Directory error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Invite user (creates account in invited state) */
router.post('/invite', manageUsers, adminRoles, async (req, res) => {
  try {
    const {
      email,
      firstname,
      lastname,
      phone,
      jobTitle,
      branchId,
      departmentId,
      roleCode,
      accountType = 'branch',
      permissions
    } = req.body;

    if (!email || !firstname || !lastname) {
      return res.status(400).json({ error: 'email, firstname, lastname required' });
    }

    const existingBranch = await db.getAsync('SELECT id FROM branches WHERE email = ?', [email]);
    const existingSub = await db.getAsync('SELECT id FROM sub_users WHERE email = ?', [email]);
    if (existingBranch || existingSub) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const targetBranchId = branchId || req.user.branchId;
    const branch = await db.getAsync(
      'SELECT id FROM branches WHERE id = ? AND church_id = ?',
      [targetBranchId, req.churchId]
    );
    if (!branch) return res.status(400).json({ error: 'Invalid branch' });

    const inviteToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const tmp = tempPassword();
    const hashed = await hashPassword(tmp);
    const name = `${firstname} ${lastname}`.trim();
    const title = jobTitle || 'Staff';

    let userId;
    let userType;

    if (accountType === 'sub_user') {
      const result = await db.runAsync(
        `INSERT INTO sub_users (
          branch_id, church_id, created_by, email, password, firstname, lastname,
          position, job_title, phone, permissions, is_active, status, department_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'invited', ?)`,
        [
          targetBranchId,
          req.churchId,
          req.user.id,
          email,
          hashed,
          firstname,
          lastname,
          title,
          title,
          phone || null,
          JSON.stringify(Array.isArray(permissions) ? permissions : ['view_dashboard']),
          departmentId || null
        ]
      );
      userId = result.lastID;
      userType = 'sub_user';
    } else {
      if (!roleCode) return res.status(400).json({ error: 'roleCode required for branch users' });
      const result = await db.runAsync(
        `INSERT INTO branches (
          branchname, branchcode, email, password, phone, job_title, isadmin, permissions,
          church_id, status, is_login_enabled, token_version
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'invited', 0, 0)`,
        [
          name,
          `INV${Date.now().toString().slice(-6)}`,
          email,
          hashed,
          phone || null,
          title,
          JSON.stringify(Array.isArray(permissions) ? permissions : []),
          req.churchId
        ]
      );
      userId = result.lastID;
      userType = 'branch';
      await RoleManager.assignRole(
        userId,
        'branch',
        roleCode,
        departmentId || null,
        null,
        req.user.id
      );
    }

    await db.runAsync(
      `INSERT INTO user_invites (
        church_id, branch_id, email, firstname, lastname, phone, job_title, department_id,
        role_code, account_type, token_hash, status, invited_by, accepted_user_id, accepted_user_type, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        req.churchId,
        targetBranchId,
        email,
        firstname,
        lastname,
        phone || null,
        title,
        departmentId || null,
        roleCode || null,
        accountType,
        tokenHash,
        req.user.id,
        userId,
        userType,
        expires
      ]
    );

    res.status(201).json({
      message: 'User invited',
      userId,
      accountType: userType,
      inviteToken,
      temporaryPassword: tmp,
      expiresAt: expires
    });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function getScopedUser(req, id, accountType = 'branch') {
  if (accountType === 'sub_user') {
    return db.getAsync(
      `SELECT * FROM sub_users WHERE id = ? AND (
        church_id = ? OR branch_id IN (SELECT id FROM branches WHERE church_id = ?)
      )`,
      [id, req.churchId, req.churchId]
    );
  }
  return db.getAsync('SELECT * FROM branches WHERE id = ? AND church_id = ?', [id, req.churchId]);
}

router.post('/:id/activate', manageUsers, adminRoles, async (req, res) => {
  try {
    const accountType = req.body.accountType || 'branch';
    const user = await getScopedUser(req, req.params.id, accountType);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (accountType === 'sub_user') {
      await db.runAsync(
        `UPDATE sub_users SET is_active = 1, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [user.id]
      );
    } else {
      await db.runAsync(
        `UPDATE branches SET status = 'active', is_login_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [user.id]
      );
    }
    await db.runAsync(
      `UPDATE user_invites SET status = 'accepted' WHERE accepted_user_id = ? AND accepted_user_type = ? AND church_id = ?`,
      [user.id, accountType, req.churchId]
    );
    await audit(req, {
      action: 'activate',
      resource: 'user',
      resourceId: user.id,
      summary: `User activated (${accountType})`,
      newValues: { accountType, email: user.email }
    });
    res.json({ message: 'User activated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/suspend', manageUsers, adminRoles, async (req, res) => {
  try {
    const accountType = req.body.accountType || 'branch';
    const user = await getScopedUser(req, req.params.id, accountType);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (accountType === 'branch' && Number(user.id) === Number(req.user.id)) {
      return res.status(400).json({ error: 'Cannot suspend your own account' });
    }

    if (accountType === 'sub_user') {
      await db.runAsync(
        `UPDATE sub_users SET is_active = 0, status = 'suspended', token_version = COALESCE(token_version,0) + 1,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [user.id]
      );
    } else {
      await db.runAsync(
        `UPDATE branches SET status = 'suspended', is_login_enabled = 0,
         token_version = COALESCE(token_version,0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [user.id]
      );
    }
    await audit(req, {
      action: 'suspend',
      resource: 'user',
      resourceId: user.id,
      summary: `User suspended (${accountType})`,
      previousValues: { email: user.email, status: user.status },
      newValues: { accountType, status: 'suspended' }
    });
    res.json({ message: 'User suspended' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/reset-access', manageUsers, adminRoles, async (req, res) => {
  try {
    const accountType = req.body.accountType || 'branch';
    const user = await getScopedUser(req, req.params.id, accountType);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tmp = req.body.password || tempPassword();
    const pw = validatePassword(tmp);
    if (!pw.ok) return res.status(400).json({ error: pw.error });
    const hashed = await hashPassword(tmp);

    if (accountType === 'sub_user') {
      await db.runAsync(
        `UPDATE sub_users SET password = ?, token_version = COALESCE(token_version,0) + 1,
         password_changed_at = CURRENT_TIMESTAMP, failed_login_attempts = 0, locked_until = NULL,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [hashed, user.id]
      );
    } else {
      await db.runAsync(
        `UPDATE branches SET password = ?, token_version = COALESCE(token_version,0) + 1,
         password_changed_at = CURRENT_TIMESTAMP, failed_login_attempts = 0, locked_until = NULL,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [hashed, user.id]
      );
    }
    res.json({ message: 'Access reset', temporaryPassword: tmp });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/branch', manageUsers, adminRoles, async (req, res) => {
  try {
    const accountType = req.body.accountType || 'branch';
    const { branchId } = req.body;
    if (!branchId) return res.status(400).json({ error: 'branchId required' });
    const target = await db.getAsync(
      'SELECT id FROM branches WHERE id = ? AND church_id = ?',
      [branchId, req.churchId]
    );
    if (!target) return res.status(400).json({ error: 'Invalid branch' });

    const user = await getScopedUser(req, req.params.id, accountType);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (accountType === 'sub_user') {
      await db.runAsync('UPDATE sub_users SET branch_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        branchId,
        user.id
      ]);
    } else {
      // Branch accounts ARE the branch — reassignment means updating linked sub-users only
      return res.status(400).json({
        error: 'Branch login accounts are campus identities; assign sub-users to a branch instead'
      });
    }
    res.json({ message: 'Branch assigned' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/profile', manageUsers, adminRoles, async (req, res) => {
  try {
    const accountType = req.body.accountType || 'branch';
    const user = await getScopedUser(req, req.params.id, accountType);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (accountType === 'sub_user') {
      await db.runAsync(
        `UPDATE sub_users SET
          firstname = COALESCE(?, firstname),
          lastname = COALESCE(?, lastname),
          phone = COALESCE(?, phone),
          job_title = COALESCE(?, job_title),
          position = COALESCE(?, position),
          department_id = COALESCE(?, department_id),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          req.body.firstname,
          req.body.lastname,
          req.body.phone,
          req.body.jobTitle,
          req.body.jobTitle || req.body.position,
          req.body.departmentId,
          user.id
        ]
      );
    } else {
      await db.runAsync(
        `UPDATE branches SET
          branchname = COALESCE(?, branchname),
          phone = COALESCE(?, phone),
          job_title = COALESCE(?, job_title),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [req.body.name || req.body.branchname, req.body.phone, req.body.jobTitle, user.id]
      );
    }
    res.json({ message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/photo', manageUsers, adminRoles, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'photo required' });
    const accountType = req.body.accountType || 'branch';
    const user = await getScopedUser(req, req.params.id, accountType);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const url = `/uploads/users/${req.file.filename}`;
    if (accountType === 'sub_user') {
      await db.runAsync('UPDATE sub_users SET photo_url = ? WHERE id = ?', [url, user.id]);
    } else {
      await db.runAsync('UPDATE branches SET photo_url = ? WHERE id = ?', [url, user.id]);
    }
    res.json({ message: 'Photo updated', photoUrl: url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users (branches) in this church only
router.get('/', manageUsers, async (req, res) => {
  try {
    const users = await db.allAsync(
      `SELECT b.id, b.branchname, b.email, b.phone, b.job_title, b.photo_url, b.branchcode, b.address,
              b.city, b.state, b.country, b.currency, b.isadmin, b.created_at, b.permissions,
              b.church_id, b.status, b.is_login_enabled
      FROM branches b
      WHERE b.church_id = ?
      ORDER BY b.created_at DESC`,
      [req.churchId]
    );

    const usersWithRoles = await Promise.all(users.map(enrichBranchUser));
    res.json(usersWithRoles);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', manageUsers, async (req, res) => {
  try {
    const user = await db.getAsync(
      `SELECT id, branchname, email, phone, job_title, photo_url, branchcode, address, city, state,
              country, currency, isadmin, permissions, church_id, status, is_login_enabled
       FROM branches WHERE id = ? AND church_id = ?`,
      [req.params.id, req.churchId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const enriched = await enrichBranchUser(user);
    const accessibleRoles = await RoleManager.getAccessibleRoles(user.id, 'branch');
    res.json({ ...enriched, accessibleRoles });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', manageUsers, adminRoles, async (req, res) => {
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
      permissions,
      phone,
      jobTitle
    } = req.body;

    if (!branchname || !email || !password || !roleCode) {
      return res.status(400).json({ error: 'Missing required fields: branchname, email, password, roleCode' });
    }

    const pw = validatePassword(password);
    if (!pw.ok) return res.status(400).json({ error: pw.error });

    const existing = await db.getAsync('SELECT id FROM branches WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await hashPassword(password);
    const permJson = Array.isArray(permissions) ? JSON.stringify(permissions) : '[]';
    const result = await db.runAsync(
      `INSERT INTO branches (
        branchname, branchcode, email, password, address, city, state, country, currency,
        isadmin, permissions, church_id, phone, job_title, status, is_login_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'active', 1)`,
      [
        branchname,
        branchcode || '',
        email,
        hashedPassword,
        address || '',
        city || '',
        state || '',
        country || '',
        currency || 'USD',
        permJson,
        req.churchId,
        phone || null,
        jobTitle || null
      ]
    );

    try {
      await RoleManager.assignRole(
        result.lastID,
        'branch',
        roleCode,
        departmentId || null,
        location || null,
        req.user.id
      );
    } catch (error) {
      console.error('Error assigning role:', error);
      await db.runAsync('DELETE FROM branches WHERE id = ?', [result.lastID]);
      return res.status(400).json({ error: 'Failed to assign role: ' + error.message });
    }

    const [firstname, ...lastnameParts] = branchname.split(' ');
    const lastname = lastnameParts.join(' ') || '';

    await db.runAsync(
      `INSERT INTO members (branch_id, church_id, firstname, lastname, email, password, isadmin, position, sex, title)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'senior pastor', 'male', 'Mr')`,
      [result.lastID, req.churchId, firstname, lastname, email, hashedPassword]
    );

    res.status(201).json({
      message: 'User account created successfully',
      userId: result.lastID,
      roleAssigned: roleCode
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.put('/:id/role', manageUsers, adminRoles, async (req, res) => {
  try {
    const { roleCode, departmentId, location, permissions } = req.body;
    const userId = req.params.id;

    if (!roleCode) {
      return res.status(400).json({ error: 'Role code is required' });
    }

    const user = await db.getAsync('SELECT id, church_id FROM branches WHERE id = ? AND church_id = ?', [
      userId,
      req.churchId
    ]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.runAsync('UPDATE user_roles SET is_active = 0 WHERE user_id = ? AND user_type = ?', [
      userId,
      'branch'
    ]);

    await RoleManager.assignRole(userId, 'branch', roleCode, departmentId || null, location || null, req.user.id);

    if (Array.isArray(permissions)) {
      await db.runAsync(
        'UPDATE branches SET permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND church_id = ?',
        [JSON.stringify(permissions), userId, req.churchId]
      );
    }

    res.json({ message: 'Role assigned successfully' });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.patch('/:id/permissions', manageUsers, adminRoles, async (req, res) => {
  try {
    const accountType = req.body.accountType || 'branch';
    const permissions = req.body.permissions;
    if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions array required' });
    const user = await getScopedUser(req, req.params.id, accountType);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (accountType === 'sub_user') {
      await db.runAsync('UPDATE sub_users SET permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        JSON.stringify(permissions),
        user.id
      ]);
    } else {
      await db.runAsync(
        'UPDATE branches SET permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND church_id = ?',
        [JSON.stringify(permissions), user.id, req.churchId]
      );
    }
    res.json({ message: 'Permissions updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/roles', manageUsers, adminRoles, async (req, res) => {
  try {
    const { roleCode, departmentId, location } = req.body;
    const userId = req.params.id;

    if (!roleCode) {
      return res.status(400).json({ error: 'Role code is required' });
    }

    const user = await db.getAsync('SELECT id FROM branches WHERE id = ? AND church_id = ?', [
      userId,
      req.churchId
    ]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existing = await db.getAsync(
      'SELECT id FROM user_roles WHERE user_id = ? AND user_type = ? AND role_id = (SELECT id FROM roles WHERE role_code = ?) AND is_active = 1',
      [userId, 'branch', roleCode]
    );

    if (existing) {
      return res.status(400).json({ error: 'Role already assigned to this user' });
    }

    await RoleManager.assignRole(userId, 'branch', roleCode, departmentId || null, location || null, req.user.id);
    res.json({ message: 'Role added successfully' });
  } catch (error) {
    console.error('Add role error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.delete('/:id/roles/:roleId', manageUsers, adminRoles, async (req, res) => {
  try {
    const user = await db.getAsync('SELECT id FROM branches WHERE id = ? AND church_id = ?', [
      req.params.id,
      req.churchId
    ]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
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

router.delete('/:id', manageUsers, adminRoles, async (req, res) => {
  try {
    const user = await db.getAsync('SELECT branchname FROM branches WHERE id = ? AND church_id = ?', [
      req.params.id,
      req.churchId
    ]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (Number(req.params.id) === Number(req.user.id)) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await db.runAsync('DELETE FROM branches WHERE id = ? AND church_id = ?', [req.params.id, req.churchId]);
    res.json({ message: `User ${user.branchname} deleted successfully` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
