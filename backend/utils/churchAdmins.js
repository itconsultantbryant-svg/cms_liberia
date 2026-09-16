const db = require('../database');
const RoleManager = require('./roles');
const { validatePassword, hashPassword } = require('./authSecurity');

/**
 * Create an HQ / campus branch login as Church Admin (isadmin=1 + PRESIDENT).
 */
async function createChurchAdministrator({
  churchId,
  email,
  password,
  branchname,
  branchcode = 'HQ',
  address = '',
  city = '',
  state = '',
  country = '',
  currency = 'USD'
}) {
  if (!churchId || !email || !password || !branchname) {
    throw Object.assign(new Error('churchId, email, password, and branchname are required'), { status: 400 });
  }

  const pw = validatePassword(password);
  if (!pw.ok) {
    throw Object.assign(new Error(pw.error), { status: 400 });
  }

  const existingBranch = await db.getAsync('SELECT id FROM branches WHERE email = ?', [email]);
  const existingSub = await db.getAsync('SELECT id FROM sub_users WHERE email = ?', [email]);
  if (existingBranch || existingSub) {
    throw Object.assign(new Error('Email already exists'), { status: 400 });
  }

  const hashed = await hashPassword(password);
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO branches (
      branchname, branchcode, email, password, address, city, state, country, currency,
      isadmin, church_id, permissions, token_version, password_changed_at, failed_login_attempts,
      is_headquarters, status, is_login_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, '[]', 0, ?, 0, ?, 'active', 1)`,
    [
      branchname,
      branchcode,
      email,
      hashed,
      address,
      city,
      state,
      country,
      currency,
      churchId,
      now,
      branchcode === 'HQ' ? 1 : 0
    ]
  );

  if (branchcode === 'HQ') {
    await db.runAsync(
      'UPDATE branches SET is_headquarters = 0 WHERE church_id = ? AND id != ?',
      [churchId, result.lastID]
    );
  }

  const [firstname, ...rest] = branchname.split(' ');
  await db.runAsync(
    `INSERT INTO members (branch_id, church_id, firstname, lastname, email, password, isadmin, position, sex, title)
     VALUES (?, ?, ?, ?, ?, ?, 1, 'senior pastor', 'male', 'Mr')`,
    [result.lastID, churchId, firstname, rest.join(' ') || '', email, hashed]
  );

  try {
    await RoleManager.assignRole(result.lastID, 'branch', 'PRESIDENT', null, null, null);
  } catch (e) {
    console.warn('[createChurchAdministrator] role assign:', e.message);
  }

  return {
    id: result.lastID,
    email,
    branchname,
    churchId,
    isadmin: 1
  };
}

async function listChurchAdmins(churchId) {
  return db.allAsync(
    `SELECT id, branchname, branchcode, email, city, country, isadmin, created_at
     FROM branches
     WHERE church_id = ? AND isadmin = 1
     ORDER BY id ASC`,
    [churchId]
  );
}

async function setBranchAdminFlag(churchId, branchId, isAdmin) {
  const branch = await db.getAsync(
    'SELECT id, church_id, isadmin FROM branches WHERE id = ?',
    [branchId]
  );
  if (!branch || Number(branch.church_id) !== Number(churchId)) {
    throw Object.assign(new Error('Admin account not found in this church'), { status: 404 });
  }

  if (!isAdmin) {
    const admins = await listChurchAdmins(churchId);
    if (admins.length <= 1 && branch.isadmin) {
      throw Object.assign(new Error('Cannot revoke the last church administrator'), { status: 400 });
    }
  }

  await db.runAsync('UPDATE branches SET isadmin = ? WHERE id = ? AND church_id = ?', [
    isAdmin ? 1 : 0,
    branchId,
    churchId
  ]);

  if (isAdmin) {
    try {
      await RoleManager.assignRole(branchId, 'branch', 'PRESIDENT', null, null, null);
    } catch (_) { /* may already have role */ }
  }

  return db.getAsync(
    'SELECT id, branchname, email, isadmin, church_id FROM branches WHERE id = ?',
    [branchId]
  );
}

module.exports = {
  createChurchAdministrator,
  listChurchAdmins,
  setBranchAdminFlag
};
