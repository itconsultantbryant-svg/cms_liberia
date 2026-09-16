const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const RoleManager = require('../utils/roles');
const { uniqueChurchSlug, getChurchById, churchSummary } = require('../utils/tenant');
const {
  getJwtSecret,
  validatePassword,
  isDebugResetEnabled,
  isLocked,
  lockMessage,
  recordFailedLogin,
  clearFailedLogins,
  bumpTokenVersion,
  setPassword,
  createPasswordResetToken,
  consumeResetToken,
  hashPassword
} = require('../utils/authSecurity');
const { audit } = require('../utils/audit');
const { authLimiter } = require('../middleware/rateLimiters');
const { resolveTenantByHost, assertLoginAllowedForHost, normalizeHost } = require('../utils/domains');

function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

async function hostGate(req, churchId, isSuperadmin) {
  const host = normalizeHost(req.headers['x-forwarded-host'] || req.headers.host || '');
  const resolved = req.resolvedTenant || (await resolveTenantByHost(host));
  return assertLoginAllowedForHost(resolved, churchId, { isSuperadmin });
}

/**
 * Register creates a NEW church (tenant) + HQ branch as Church Admin (PRESIDENT).
 */
router.post('/register', authLimiter, async (req, res) => {
  try {
    const {
      churchName,
      churchSlug,
      branchname,
      branchcode,
      email,
      password,
      address,
      city,
      state,
      country,
      currency
    } = req.body;

    const hqName = branchname || churchName;
    if (!hqName || !email || !password) {
      return res.status(400).json({ error: 'Church/branch name, email, and password are required' });
    }

    const pw = validatePassword(password);
    if (!pw.ok) {
      return res.status(400).json({ error: pw.error });
    }

    const existingBranch = await db.getAsync('SELECT id FROM branches WHERE email = ?', [email]);
    if (existingBranch) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const existingSub = await db.getAsync('SELECT id FROM sub_users WHERE email = ?', [email]);
    if (existingSub) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const slug = await uniqueChurchSlug(churchSlug || churchName || hqName);
    const existingSlug = await db.getAsync('SELECT id FROM churches WHERE slug = ?', [slug]);
    if (existingSlug && churchSlug) {
      return res.status(400).json({ error: 'Church slug already taken' });
    }

    const churchResult = await db.runAsync(
      `INSERT INTO churches (name, short_name, slug, email, country, city, address, currency, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        churchName || hqName,
        (churchName || hqName).substring(0, 40),
        slug,
        email,
        country || null,
        city || null,
        address || null,
        currency || 'USD'
      ]
    );
    const churchId = churchResult.lastID;
    try {
      const { ensureChurchCurrencies } = require('../utils/currencies');
      await ensureChurchCurrencies(churchId, currency || 'USD');
    } catch (e) {
      console.warn('[auth/register] currency seed skipped:', e.message);
    }

    const hashedPassword = await hashPassword(password);
    const now = new Date().toISOString();
    const result = await db.runAsync(
      `INSERT INTO branches (branchname, branchcode, email, password, address, city, state, country, currency, isadmin, church_id, permissions, token_version, password_changed_at, failed_login_attempts, is_headquarters, status, is_login_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?, 0, 1, 'active', 1)`,
      [
        hqName,
        branchcode || 'HQ',
        email,
        hashedPassword,
        address || '',
        city || '',
        state || '',
        country || '',
        currency || 'USD',
        churchId,
        '[]',
        now
      ]
    );

    const [firstname, ...lastnameParts] = hqName.split(' ');
    const lastname = lastnameParts.join(' ') || '';

    await db.runAsync(
      `INSERT INTO members (branch_id, church_id, firstname, lastname, email, password, isadmin, position, sex, title)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'senior pastor', 'male', 'Mr')`,
      [result.lastID, churchId, firstname, lastname, email, hashedPassword]
    );

    try {
      await RoleManager.assignRole(result.lastID, 'branch', 'PRESIDENT', null, null, null);
    } catch (error) {
      console.error('Error assigning role:', error);
    }

    await audit(req, {
      churchId,
      branchId: result.lastID,
      userId: result.lastID,
      userType: 'branch',
      userEmail: email,
      action: 'create',
      resource: 'church',
      resourceId: churchId,
      summary: `Church registered: ${churchName || hqName}`,
      newValues: { slug, email, branchId: result.lastID }
    });

    res.json({
      message: 'Church registered successfully',
      churchId,
      churchSlug: slug,
      branchId: result.lastID
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration: ' + error.message });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const subUser = await db.getAsync('SELECT * FROM sub_users WHERE email = ? AND is_active = 1', [email]);

    if (subUser) {
      if (isLocked(subUser)) {
        return res.status(403).json({ error: lockMessage(subUser), lockedUntil: subUser.locked_until });
      }

      const isMatch = await bcrypt.compare(password, subUser.password);
      if (!isMatch) {
        const { lockedUntil } = await recordFailedLogin('sub_users', subUser.id);
        await audit(req, {
          churchId: subUser.church_id,
          branchId: subUser.branch_id,
          userId: subUser.id,
          userType: 'sub_user',
          userEmail: email,
          action: 'login_failed',
          resource: 'auth',
          resourceId: subUser.id,
          summary: 'Failed login (sub_user)'
        });
        if (lockedUntil) {
          return res.status(403).json({ error: `Account locked until ${lockedUntil}. Try again later.`, lockedUntil });
        }
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const branch = await db.getAsync('SELECT * FROM branches WHERE id = ?', [subUser.branch_id]);
      if (!branch) {
        return res.status(400).json({ error: 'Branch not found' });
      }

      const churchId = subUser.church_id || branch.church_id;
      const church = await getChurchById(churchId);
      if (church && (church.status === 'suspended' || church.status === 'archived')) {
        return res.status(403).json({ error: `Church is ${church.status}` });
      }

      const gate = await hostGate(req, churchId, false);
      if (!gate.ok) {
        return res.status(gate.status).json({ error: gate.error, code: gate.code });
      }

      await clearFailedLogins('sub_users', subUser.id);

      const permissions = typeof subUser.permissions === 'string'
        ? JSON.parse(subUser.permissions)
        : subUser.permissions;

      const tokenVersion = subUser.token_version ?? 0;
      const activeBranchId = subUser.branch_id;
      const token = signToken({
        id: subUser.id,
        email: subUser.email,
        branchId: subUser.branch_id,
        churchId,
        userType: 'sub_user',
        permissions,
        tokenVersion,
        activeBranchId
      });

      await audit(req, {
        churchId,
        branchId: activeBranchId,
        userId: subUser.id,
        userType: 'sub_user',
        userEmail: subUser.email,
        action: 'login',
        resource: 'auth',
        resourceId: subUser.id,
        summary: 'User logged in (sub_user)'
      });

      return res.json({
        token,
        user: {
          id: subUser.id,
          email: subUser.email,
          firstname: subUser.firstname,
          lastname: subUser.lastname,
          branchname: `${subUser.firstname} ${subUser.lastname}`,
          position: subUser.position,
          branchId: subUser.branch_id,
          homeBranchId: subUser.branch_id,
          activeBranchId,
          churchId,
          church: churchSummary(church),
          userType: 'sub_user',
          permissions,
          currency: branch.currency || church?.currency || 'USD',
          mfaEnabled: !!(subUser.mfa_enabled),
          isSuperadmin: false
        }
      });
    }

    const branch = await db.getAsync('SELECT * FROM branches WHERE email = ?', [email]);
    if (!branch) {
      await audit(req, {
        action: 'login_failed',
        resource: 'auth',
        userEmail: email,
        summary: 'Failed login (unknown email)'
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (branch.is_login_enabled === 0) {
      return res.status(403).json({ error: 'This branch account cannot log in' });
    }

    if (isLocked(branch)) {
      return res.status(403).json({ error: lockMessage(branch), lockedUntil: branch.locked_until });
    }

    const isMatch = await bcrypt.compare(password, branch.password);
    if (!isMatch) {
      const { lockedUntil } = await recordFailedLogin('branches', branch.id);
      await audit(req, {
        churchId: branch.church_id,
        branchId: branch.id,
        userId: branch.id,
        userType: 'branch',
        userEmail: email,
        action: 'login_failed',
        resource: 'auth',
        resourceId: branch.id,
        summary: 'Failed login (branch)'
      });
      if (lockedUntil) {
        return res.status(403).json({ error: `Account locked until ${lockedUntil}. Try again later.`, lockedUntil });
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const churchId = branch.church_id;
    const church = await getChurchById(churchId);
    if (church && (church.status === 'suspended' || church.status === 'archived')) {
      return res.status(403).json({ error: `Church is ${church.status}` });
    }

    const isSuperadminEarly = !!(branch.is_platform_admin);
    const gate = await hostGate(req, churchId, isSuperadminEarly);
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error, code: gate.code });
    }

    await clearFailedLogins('branches', branch.id);

    let roles = [];
    let primaryRole = null;
    try {
      roles = await RoleManager.getUserRoles(branch.id, 'branch');
      primaryRole = await RoleManager.getPrimaryRole(branch.id, 'branch');
    } catch (error) {
      console.error('[Login] Error fetching roles:', error);
    }

    const tokenVersion = branch.token_version ?? 0;
    const isSuperadmin = !!(branch.is_platform_admin);
    const activeBranchId = branch.id;
    const token = signToken({
      id: branch.id,
      email: branch.email,
      isadmin: branch.isadmin,
      branchId: branch.id,
      churchId,
      userType: 'branch',
      tokenVersion,
      isSuperadmin,
      activeBranchId
    });

    const branchPermissions = (branch.permissions && branch.permissions !== '[]')
      ? (typeof branch.permissions === 'string' ? JSON.parse(branch.permissions) : branch.permissions)
      : [];

    let availableBranches = [];
    try {
      const { getAccessibleBranches } = require('../utils/branches');
      availableBranches = await getAccessibleBranches(
        { id: branch.id, userType: 'branch', isadmin: branch.isadmin, isSuperadmin },
        churchId
      );
    } catch (_) { /* ignore */ }

    await audit(req, {
      churchId,
      branchId: activeBranchId,
      userId: branch.id,
      userType: 'branch',
      userEmail: branch.email,
      action: 'login',
      resource: 'auth',
      resourceId: branch.id,
      summary: 'User logged in'
    });

    res.json({
      token,
      user: {
        id: branch.id,
        email: branch.email,
        branchname: branch.branchname,
        isadmin: branch.isadmin,
        branchId: branch.id,
        homeBranchId: branch.id,
        activeBranchId,
        churchId,
        church: churchSummary(church),
        currency: branch.currency || church?.currency || 'USD',
        permissions: Array.isArray(branchPermissions) ? branchPermissions : [],
        roles: roles || [],
        primaryRole,
        userType: 'branch',
        mfaEnabled: !!(branch.mfa_enabled),
        isSuperadmin,
        availableBranches
      }
    });
  } catch (error) {
    console.error('[Login] error:', error);
    res.status(500).json({ error: 'Server error during login: ' + error.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (req.user.userType === 'sub_user') {
      const subUser = await db.getAsync(
        'SELECT * FROM sub_users WHERE id = ? AND is_active = 1',
        [req.user.id]
      );
      if (!subUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const branch = await db.getAsync('SELECT * FROM branches WHERE id = ?', [subUser.branch_id]);
      const churchId = subUser.church_id || branch?.church_id || req.user.churchId;
      const church = await getChurchById(churchId);
      const permissions = typeof subUser.permissions === 'string'
        ? JSON.parse(subUser.permissions)
        : subUser.permissions;

      return res.json({
        user: {
          id: subUser.id,
          email: subUser.email,
          firstname: subUser.firstname,
          lastname: subUser.lastname,
          branchname: `${subUser.firstname} ${subUser.lastname}`,
          position: subUser.position,
          branchId: subUser.branch_id,
          churchId,
          church: churchSummary(church),
          userType: 'sub_user',
          permissions,
          currency: branch?.currency || church?.currency || 'USD',
          mfaEnabled: !!(subUser.mfa_enabled),
          isSuperadmin: false
        }
      });
    }

    const branch = await db.getAsync(
      'SELECT id, branchname, email, isadmin, branchcode, address, city, state, country, currency, permissions, church_id, mfa_enabled, is_platform_admin FROM branches WHERE id = ?',
      [req.user.id]
    );
    if (!branch) {
      return res.status(404).json({ error: 'User not found' });
    }

    const supportMode = !!req.user.supportMode;
    const churchId = supportMode
      ? req.user.churchId
      : branch.church_id || req.user.churchId;
    const church = await getChurchById(churchId);
    const permissions = supportMode
      ? []
      : (branch.permissions && branch.permissions !== '[]')
        ? (typeof branch.permissions === 'string' ? JSON.parse(branch.permissions) : branch.permissions)
        : [];

    let roles = [];
    let primaryRole = null;
    if (!supportMode) {
      try {
        roles = await RoleManager.getUserRoles(req.user.id, 'branch');
        primaryRole = await RoleManager.getPrimaryRole(req.user.id, 'branch');
      } catch (error) {
        console.error('[Get /me] Error fetching roles:', error);
      }
    }

    let supportSession = null;
    if (supportMode && req.user.supportSessionId) {
      try {
        const { getSessionById } = require('../utils/supportAccess');
        supportSession = await getSessionById(req.user.supportSessionId);
      } catch (_) { /* ignore */ }
    }

    res.json({
      user: {
        ...branch,
        // Never present Superadmin as the church's own administrator
        isadmin: supportMode ? false : branch.isadmin,
        branchId: supportMode ? (req.user.activeBranchId || req.user.branchId) : branch.id,
        homeBranchId: supportMode ? (req.user.activeBranchId || req.user.branchId) : branch.id,
        activeBranchId: supportMode
          ? (req.user.activeBranchId || req.user.branchId)
          : req.user.activeBranchId || branch.id,
        churchId,
        homeChurchId: supportMode ? (req.user.homeChurchId || branch.church_id) : branch.church_id,
        church: churchSummary(church),
        permissions: Array.isArray(permissions) ? permissions : [],
        roles,
        primaryRole,
        userType: 'branch',
        mfaEnabled: !!(branch.mfa_enabled),
        isSuperadmin: !!(branch.is_platform_admin),
        supportMode,
        supportSessionId: req.user.supportSessionId || null,
        supportReason: req.user.supportReason || supportSession?.reason || null,
        supportChurchName: church?.name || supportSession?.church_name || null,
        supportBanner: supportMode
          ? 'You are currently accessing this church as Superadmin.'
          : null,
        availableBranches: await (async () => {
          try {
            const { getAccessibleBranches } = require('../utils/branches');
            return await getAccessibleBranches(
              {
                id: branch.id,
                userType: 'branch',
                isadmin: supportMode ? false : branch.isadmin,
                isSuperadmin: !!(branch.is_platform_admin),
                supportMode
              },
              churchId
            );
          } catch (_) {
            return [];
          }
        })(),
        permissionKeys: await (async () => {
          try {
            const { getUserPermissions } = require('../utils/rbac');
            return await getUserPermissions(
              {
                id: branch.id,
                userType: 'branch',
                isadmin: supportMode ? false : branch.isadmin,
                isSuperadmin: !!(branch.is_platform_admin),
                permissions: supportMode ? [] : branch.permissions,
                primaryRole
              },
              churchId
            );
          } catch (_) {
            return [];
          }
        })()
      }
    });
  } catch (error) {
    console.error('[Get /me] Error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    const pw = validatePassword(newPassword);
    if (!pw.ok) {
      return res.status(400).json({ error: pw.error });
    }

    const isSub = req.user.userType === 'sub_user';
    const table = isSub ? 'sub_users' : 'branches';
    const account = await db.getAsync(`SELECT * FROM ${table} WHERE id = ?`, [req.user.id]);
    if (!account) {
      return res.status(404).json({ error: 'User not found' });
    }

    const match = await bcrypt.compare(currentPassword, account.password);
    if (!match) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashed = await hashPassword(newPassword);
    const tokenVersion = await setPassword(table, account.id, hashed);

    const churchId = isSub
      ? (account.church_id || req.user.churchId)
      : account.church_id;

    const tokenPayload = isSub
      ? {
          id: account.id,
          email: account.email,
          branchId: account.branch_id,
          churchId,
          userType: 'sub_user',
          permissions: typeof account.permissions === 'string'
            ? JSON.parse(account.permissions)
            : account.permissions,
          tokenVersion
        }
      : {
          id: account.id,
          email: account.email,
          isadmin: account.isadmin,
          branchId: account.id,
          churchId,
          userType: 'branch',
          tokenVersion
        };

    const token = signToken(tokenPayload);
    res.json({ message: 'Password changed successfully', token });
  } catch (error) {
    console.error('[change-password]', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

const GENERIC_FORGOT_MSG =
  'If an account exists for that email, password reset instructions have been issued.';

router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    let accountType = null;
    let account = null;

    const subUser = await db.getAsync(
      'SELECT * FROM sub_users WHERE email = ? AND is_active = 1',
      [email]
    );
    if (subUser) {
      accountType = 'sub_user';
      account = subUser;
    } else {
      const branch = await db.getAsync('SELECT * FROM branches WHERE email = ?', [email]);
      if (branch) {
        accountType = 'branch';
        account = branch;
      }
    }

    const response = { message: GENERIC_FORGOT_MSG };

    if (account) {
      const churchId = account.church_id || null;
      const { raw, expiresAt } = await createPasswordResetToken(
        accountType,
        account.id,
        churchId
      );
      console.log(`[forgot-password] Reset token created for ${accountType} id=${account.id} expires=${expiresAt}`);
      if (isDebugResetEnabled()) {
        response.resetToken = raw;
        response.expiresAt = expiresAt;
        response.debug = true;
      }
    }

    res.json(response);
  } catch (error) {
    console.error('[forgot-password]', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    const pw = validatePassword(newPassword);
    if (!pw.ok) {
      return res.status(400).json({ error: pw.error });
    }

    const row = await consumeResetToken(token);
    if (!row) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const table = row.account_type === 'sub_user' ? 'sub_users' : 'branches';
    const account = await db.getAsync(`SELECT id FROM ${table} WHERE id = ?`, [row.account_id]);
    if (!account) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hashed = await hashPassword(newPassword);
    await setPassword(table, account.id, hashed);

    res.json({ message: 'Password has been reset. You can log in with your new password.' });
  } catch (error) {
    console.error('[reset-password]', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const table = req.user.userType === 'sub_user' ? 'sub_users' : 'branches';
    await bumpTokenVersion(table, req.user.id);
    await audit(req, {
      action: 'logout',
      resource: 'auth',
      resourceId: req.user.id,
      summary: 'User logged out'
    });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('[logout]', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;
