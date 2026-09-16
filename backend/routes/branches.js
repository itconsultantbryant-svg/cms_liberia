const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { hashPassword, getJwtSecret } = require('../utils/authSecurity');
const jwt = require('jsonwebtoken');
const {
  listChurchBranches,
  getAccessibleBranches,
  getBranchInChurch,
  canAccessBranch,
  setHeadquarters,
  grantBranchAccess,
  BRANCH_SELECT
} = require('../utils/branches');
const { audit } = require('../utils/audit');
const { assertCanCreate } = require('../utils/subscriptions');

function requireChurchAdmin(req, res, next) {
  if (req.user?.isadmin || req.user?.isSuperadmin) return next();
  const code = req.primaryRole?.role_code;
  if (code === 'PRESIDENT' || code === 'MISSION_SECRETARY') return next();
  if (req.userRoles?.some(r => ['PRESIDENT', 'MISSION_SECRETARY'].includes(r.role_code))) {
    return next();
  }
  return res.status(403).json({ error: 'Church administrator access required' });
}

function signUserToken(req, activeBranchId) {
  const u = req.user;
  const base =
    u.userType === 'sub_user'
      ? {
          id: u.id,
          email: u.email,
          branchId: u.homeBranchId || u.branchId,
          churchId: req.churchId,
          userType: 'sub_user',
          permissions: u.permissions,
          tokenVersion: u.tokenVersion ?? 0,
          activeBranchId
        }
      : {
          id: u.id,
          email: u.email,
          isadmin: u.isadmin,
          branchId: u.id,
          churchId: req.churchId,
          userType: 'branch',
          tokenVersion: u.tokenVersion ?? 0,
          isSuperadmin: !!u.isSuperadmin,
          activeBranchId
        };
  return jwt.sign(base, getJwtSecret(), { expiresIn: '7d' });
}

/** GET /api/branches — all campuses in church (admins) or accessible list */
router.get('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const isAdmin =
      req.user.isadmin ||
      req.user.isSuperadmin ||
      ['PRESIDENT', 'MISSION_SECRETARY'].includes(req.primaryRole?.role_code);

    const branches = isAdmin
      ? await listChurchBranches(req.churchId, { includeInactive: true })
      : await getAccessibleBranches(req.user, req.churchId);

    res.json({
      branches,
      activeBranchId: req.activeBranchId || req.user.activeBranchId,
      homeBranchId: req.homeBranchId || req.user.homeBranchId
    });
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** GET /api/branches/accessible — for branch selector */
router.get('/accessible', authMiddleware, async (req, res) => {
  try {
    const branches = await getAccessibleBranches(req.user, req.churchId);
    res.json({
      branches,
      activeBranchId: req.activeBranchId,
      homeBranchId: req.homeBranchId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/branches/select — switch operational context */
router.post('/select', authMiddleware, async (req, res) => {
  try {
    const branchId = Number(req.body.branchId);
    if (!branchId) {
      return res.status(400).json({ error: 'branchId is required' });
    }
    const allowed = await canAccessBranch(req.user, req.churchId, branchId);
    if (!allowed) {
      return res.status(403).json({ error: 'You do not have access to this branch' });
    }
    const branch = await getBranchInChurch(branchId, req.churchId);
    if (!branch || (branch.status && branch.status !== 'active')) {
      return res.status(400).json({ error: 'Branch is not active' });
    }

    const token = signUserToken(req, branchId);
    res.json({
      message: 'Branch context updated',
      token,
      activeBranchId: branchId,
      branch
    });
  } catch (error) {
    console.error('[branches/select]', error);
    res.status(500).json({ error: error.message });
  }
});

// ——— legacy tools (must be before /:id) ———

router.get('/tools/service-type', authMiddleware, async (req, res) => {
  try {
    const types = await db.allAsync('SELECT * FROM service_types WHERE branch_id = ?', [req.user.branchId]);
    res.json(types);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/tools/collection-type', authMiddleware, async (req, res) => {
  try {
    const types = await db.allAsync('SELECT * FROM collections_types WHERE branch_id = ?', [req.user.branchId]);
    res.json(types);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/tools/service-type', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id, name } = req.body;
    if (id) {
      await db.runAsync('UPDATE service_types SET name = ? WHERE id = ? AND branch_id = ?', [
        name,
        id,
        req.user.branchId
      ]);
      res.json({ message: 'Service type updated' });
    } else {
      const result = await db.runAsync('INSERT INTO service_types (branch_id, name) VALUES (?, ?)', [
        req.user.branchId,
        name
      ]);
      res.json({ message: 'Service type created', id: result.lastID });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/tools/collection-type', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id, name } = req.body;
    if (id) {
      await db.runAsync('UPDATE collections_types SET name = ? WHERE id = ? AND branch_id = ?', [
        name,
        id,
        req.user.branchId
      ]);
      res.json({ message: 'Collection type updated' });
    } else {
      const result = await db.runAsync('INSERT INTO collections_types (branch_id, name) VALUES (?, ?)', [
        req.user.branchId,
        name
      ]);
      res.json({ message: 'Collection type created', id: result.lastID });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/tools/service-type/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.runAsync('DELETE FROM service_types WHERE id = ? AND branch_id = ?', [
      req.params.id,
      req.user.branchId
    ]);
    res.json({ message: 'Service type deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/tools/collection-type/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.runAsync('DELETE FROM collections_types WHERE id = ? AND branch_id = ?', [
      req.params.id,
      req.user.branchId
    ]);
    res.json({ message: 'Collection type deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

/** GET /api/branches/:id */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const branch = await getBranchInChurch(req.params.id, req.churchId);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    const allowed = await canAccessBranch(req.user, req.churchId, branch.id);
    if (!allowed && !(req.user.isadmin || req.user.isSuperadmin)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ branch });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/branches — create campus */
router.post('/', authMiddleware, attachRoleInfo, requireChurchAdmin, async (req, res) => {
  try {
    const {
      branchname,
      branchcode,
      email,
      password,
      phone,
      address,
      city,
      state,
      country,
      currency,
      pastor_name,
      pastorName,
      description,
      status,
      is_headquarters,
      isHeadquarters,
      enableLogin
    } = req.body;

    if (!branchname) {
      return res.status(400).json({ error: 'Branch name is required' });
    }

    const limitErr = await assertCanCreate(req.churchId, 'branch');
    if (limitErr) return res.status(403).json({ error: limitErr });

    const pastor = pastorName || pastor_name || null;
    const wantHq = !!(isHeadquarters ?? is_headquarters);
    const loginEnabled = enableLogin === true || (!!email && !!password);

    let finalEmail = email;
    let finalPasswordHash;
    let isLoginEnabled = 0;

    if (loginEnabled) {
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password required when enableLogin is true' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const exists = await db.getAsync('SELECT id FROM branches WHERE email = ?', [email]);
      if (exists) return res.status(400).json({ error: 'Email already exists' });
      finalEmail = email;
      finalPasswordHash = await hashPassword(password);
      isLoginEnabled = 1;
    } else {
      finalEmail = `campus+${req.churchId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@internal.local`;
      finalPasswordHash = await hashPassword(crypto.randomBytes(24).toString('hex'));
      isLoginEnabled = 0;
    }

    const result = await db.runAsync(
      `INSERT INTO branches (
        branchname, branchcode, email, password, phone, address, city, state, country, currency,
        isadmin, church_id, permissions, is_headquarters, status, pastor_name, description,
        is_login_enabled, token_version, failed_login_attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '[]', 0, ?, ?, ?, ?, 0, 0)`,
      [
        branchname,
        branchcode || null,
        finalEmail,
        finalPasswordHash,
        phone || null,
        address || '',
        city || '',
        state || '',
        country || '',
        currency || 'USD',
        req.churchId,
        status || 'active',
        pastor,
        description || null,
        isLoginEnabled
      ]
    );

    if (wantHq) {
      await setHeadquarters(req.churchId, result.lastID);
    }

    const branch = await getBranchInChurch(result.lastID, req.churchId);
    await audit(req, {
      action: 'branch_change',
      resource: 'branch',
      resourceId: result.lastID,
      summary: `Branch created: ${branch?.branchname || result.lastID}`,
      newValues: branch
    });
    res.status(201).json({ message: 'Branch created', branch });
  } catch (error) {
    console.error('[create branch]', error);
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/branches/:id */
router.patch('/:id', authMiddleware, attachRoleInfo, requireChurchAdmin, async (req, res) => {
  try {
    const branch = await getBranchInChurch(req.params.id, req.churchId);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    const map = {
      branchname: req.body.branchname,
      branchcode: req.body.branchcode,
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      country: req.body.country,
      currency: req.body.currency,
      pastor_name: req.body.pastorName ?? req.body.pastor_name,
      description: req.body.description,
      status: req.body.status,
      logo_url: req.body.logoUrl ?? req.body.logo_url
    };

    if (map.status && !['active', 'inactive', 'archived'].includes(map.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const sets = [];
    const params = [];
    for (const [col, val] of Object.entries(map)) {
      if (val !== undefined) {
        sets.push(`${col} = ?`);
        params.push(val);
      }
    }
    if (!sets.length && req.body.isHeadquarters === undefined && req.body.is_headquarters === undefined) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    if (sets.length) {
      sets.push('updated_at = CURRENT_TIMESTAMP');
      params.push(branch.id);
      await db.runAsync(`UPDATE branches SET ${sets.join(', ')} WHERE id = ?`, params);
    }

    if (req.body.isHeadquarters === true || req.body.is_headquarters === 1) {
      await setHeadquarters(req.churchId, branch.id);
    }

    const updated = await getBranchInChurch(branch.id, req.churchId);
    await audit(req, {
      action: 'branch_change',
      resource: 'branch',
      resourceId: branch.id,
      summary: `Branch updated: ${updated?.branchname || branch.id}`,
      previousValues: { branchname: branch.branchname, status: branch.status },
      newValues: updated
    });
    res.json({ message: 'Branch updated', branch: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/branches/:id/headquarters */
router.post('/:id/headquarters', authMiddleware, attachRoleInfo, requireChurchAdmin, async (req, res) => {
  try {
    const branch = await setHeadquarters(req.churchId, req.params.id);
    res.json({ message: 'Headquarters updated', branch });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** POST /api/branches/:id/access — assign user to branch */
router.post('/:id/access', authMiddleware, attachRoleInfo, requireChurchAdmin, async (req, res) => {
  try {
    const { userId, userType = 'branch' } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    await grantBranchAccess(req.churchId, userType, userId, req.params.id);
    res.json({ message: 'Branch access granted' });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
