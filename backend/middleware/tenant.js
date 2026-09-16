/**
 * Tenant isolation middleware.
 * Always derive churchId from JWT — never trust client-supplied church_id.
 * Also resolves operational branch context (Phase 6).
 * Phase 32: scrub client tenant overrides early.
 */
const { getChurchById } = require('../utils/tenant');
const { canAccessBranch, getBranchInChurch } = require('../utils/branches');
const { scrubClientTenantOverrides } = require('../utils/tenantScope');

const requireTenant = async (req, res, next) => {
  try {
    scrubClientTenantOverrides(req);

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Prefer JWT churchId; fall back to DB lookup for older tokens
    let churchId = req.user.churchId || req.user.church_id || null;

    if (!churchId && req.user.userType === 'sub_user') {
      const sub = await require('../database').getAsync(
        'SELECT church_id, branch_id FROM sub_users WHERE id = ?',
        [req.user.id]
      );
      churchId = sub?.church_id;
      if (!churchId && sub?.branch_id) {
        const b = await require('../database').getAsync(
          'SELECT church_id FROM branches WHERE id = ?',
          [sub.branch_id]
        );
        churchId = b?.church_id;
      }
    } else if (!churchId) {
      const b = await require('../database').getAsync(
        'SELECT church_id FROM branches WHERE id = ?',
        [req.user.branchId || req.user.id]
      );
      churchId = b?.church_id;
    }

    if (!churchId) {
      return res.status(403).json({ error: 'No church (tenant) context. Contact support.' });
    }

    const church = await getChurchById(churchId);
    if (!church) {
      return res.status(403).json({ error: 'Church not found' });
    }

    const inSupportMode = !!(req.user.supportMode && req.user.supportSessionId);
    if (inSupportMode) {
      // Support access may enter suspended churches; never delete data
      if (Number(req.user.churchId) !== Number(churchId)) {
        return res.status(403).json({ error: 'Support session church mismatch' });
      }
      req.supportMode = true;
      req.supportSessionId = req.user.supportSessionId;
    } else if (church.status === 'suspended' || church.status === 'archived') {
      return res.status(403).json({ error: `Church is ${church.status}` });
    }

    req.churchId = churchId;
    req.church = church;
    req.user.churchId = churchId;

    // Phase 6: operational branch context
    const homeBranchId =
      req.user.userType === 'sub_user'
        ? req.user.branchId
        : req.user.branchId || req.user.id;
    let activeBranchId = req.user.activeBranchId || homeBranchId;

    if (activeBranchId && !inSupportMode) {
      const allowed = await canAccessBranch(req.user, churchId, activeBranchId);
      if (!allowed) {
        activeBranchId = homeBranchId;
      }
      const branchRow = await getBranchInChurch(activeBranchId, churchId);
      if (!branchRow || (branchRow.status && branchRow.status !== 'active')) {
        activeBranchId = homeBranchId;
      }
    } else if (inSupportMode && activeBranchId) {
      const branchRow = await getBranchInChurch(activeBranchId, churchId);
      if (!branchRow) {
        const hq = await require('../database').getAsync(
          `SELECT id FROM branches WHERE church_id = ? ORDER BY is_headquarters DESC, id ASC LIMIT 1`,
          [churchId]
        );
        activeBranchId = hq?.id || homeBranchId;
      }
    }

    req.activeBranchId = activeBranchId || homeBranchId;
    req.homeBranchId = homeBranchId;
    // Downstream modules historically use req.user.branchId for ops scoping
    req.user.homeBranchId = homeBranchId;
    req.user.branchId = req.activeBranchId;
    req.user.activeBranchId = req.activeBranchId;
    // Keep support identity clear — never set isadmin true for target church
    if (inSupportMode) {
      req.user.isadmin = false;
      req.user.isSuperadmin = true;
      req.user.supportMode = true;
    }

    next();
  } catch (error) {
    console.error('[requireTenant]', error);
    res.status(500).json({ error: 'Tenant resolution failed' });
  }
};

function assertSameChurch(req, resourceChurchId) {
  if (resourceChurchId == null) return false;
  return Number(resourceChurchId) === Number(req.churchId);
}

/** Platform Superadmin — checks JWT flag and re-validates against DB for branch accounts */
const requireSuperadmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Sub-users cannot be platform superadmins in Phase 3
    if (req.user.userType === 'sub_user') {
      return res.status(403).json({ error: 'Superadmin access required' });
    }

    const branch = await require('../database').getAsync(
      'SELECT id, is_platform_admin FROM branches WHERE id = ?',
      [req.user.id]
    );
    if (!branch || !branch.is_platform_admin) {
      return res.status(403).json({ error: 'Superadmin access required' });
    }

    req.user.isSuperadmin = true;
    req.user.platformRole = 'SUPERADMIN';
    next();
  } catch (error) {
    console.error('[requireSuperadmin]', error);
    res.status(500).json({ error: 'Superadmin check failed' });
  }
};

module.exports = {
  requireTenant,
  assertSameChurch,
  requireSuperadmin
};
