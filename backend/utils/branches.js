const db = require('../database');

const BRANCH_SELECT = `
  id, branchname, branchcode, email, phone, address, city, state, country, currency,
  church_id, isadmin, is_headquarters, status, pastor_name, description, logo_url,
  is_login_enabled, created_at
`;

async function getBranchInChurch(branchId, churchId) {
  return db.getAsync(
    `SELECT ${BRANCH_SELECT} FROM branches WHERE id = ? AND church_id = ?`,
    [branchId, churchId]
  );
}

async function listChurchBranches(churchId, { includeInactive = true } = {}) {
  let sql = `SELECT ${BRANCH_SELECT} FROM branches WHERE church_id = ?`;
  if (!includeInactive) {
    sql += ` AND COALESCE(status, 'active') = 'active'`;
  }
  sql += ` ORDER BY is_headquarters DESC, branchname ASC`;
  return db.allAsync(sql, [churchId]);
}

/**
 * Branches the user may operate in.
 * Church admins (isadmin) and platform admins: all church branches.
 * Others: home branch + user_branch_access rows.
 */
async function getAccessibleBranches(user, churchId) {
  if (!user || !churchId) return [];

  if (user.isadmin || user.isSuperadmin || user.is_platform_admin || user.supportMode) {
    return listChurchBranches(churchId, { includeInactive: false });
  }

  const userType = user.userType || 'branch';
  const userId = user.id;
  const homeId = userType === 'sub_user' ? user.branchId : user.id;

  const access = await db.allAsync(
    `SELECT branch_id FROM user_branch_access
     WHERE church_id = ? AND user_type = ? AND user_id = ?`,
    [churchId, userType, userId]
  );
  const ids = new Set([homeId, ...access.map(a => a.branch_id)].filter(Boolean));

  if (!ids.size) return [];

  const placeholders = [...ids].map(() => '?').join(',');
  return db.allAsync(
    `SELECT ${BRANCH_SELECT} FROM branches
     WHERE church_id = ? AND id IN (${placeholders}) AND COALESCE(status, 'active') = 'active'
     ORDER BY is_headquarters DESC, branchname ASC`,
    [churchId, ...ids]
  );
}

async function canAccessBranch(user, churchId, branchId) {
  if (user?.supportMode && user?.isSuperadmin) {
    const row = await getBranchInChurch(branchId, churchId);
    return !!row;
  }
  const list = await getAccessibleBranches(user, churchId);
  return list.some(b => Number(b.id) === Number(branchId));
}

async function setHeadquarters(churchId, branchId) {
  const branch = await getBranchInChurch(branchId, churchId);
  if (!branch) {
    throw Object.assign(new Error('Branch not found'), { status: 404 });
  }
  await db.runAsync(
    'UPDATE branches SET is_headquarters = 0 WHERE church_id = ?',
    [churchId]
  );
  await db.runAsync(
    'UPDATE branches SET is_headquarters = 1, status = COALESCE(status, \'active\') WHERE id = ?',
    [branchId]
  );
  return getBranchInChurch(branchId, churchId);
}

async function grantBranchAccess(churchId, userType, userId, branchId) {
  const branch = await getBranchInChurch(branchId, churchId);
  if (!branch) {
    throw Object.assign(new Error('Branch not found'), { status: 404 });
  }
  await db.runAsync(
    `INSERT OR IGNORE INTO user_branch_access (church_id, user_type, user_id, branch_id)
     VALUES (?, ?, ?, ?)`,
    [churchId, userType, userId, branchId]
  );
}

module.exports = {
  BRANCH_SELECT,
  getBranchInChurch,
  listChurchBranches,
  getAccessibleBranches,
  canAccessBranch,
  setHeadquarters,
  grantBranchAccess
};
