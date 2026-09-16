/**
 * Phase 27 — controlled Superadmin support access into a church tenant.
 * Actions remain attributed to the Superadmin (never disguised as church admin).
 */
const db = require('../database');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('./authSecurity');
const { getChurchById, churchSummary } = require('./tenant');
const { clientMeta } = require('./audit');

async function getActiveSession(superadminId) {
  return db.getAsync(
    `SELECT ss.*, c.name as church_name, c.slug as church_slug
     FROM support_sessions ss
     JOIN churches c ON c.id = ss.church_id
     WHERE ss.superadmin_id = ? AND ss.status = 'active'
     ORDER BY ss.id DESC LIMIT 1`,
    [superadminId]
  );
}

async function getSessionById(id) {
  return db.getAsync(
    `SELECT ss.*, c.name as church_name, c.slug as church_slug
     FROM support_sessions ss
     JOIN churches c ON c.id = ss.church_id
     WHERE ss.id = ?`,
    [id]
  );
}

async function endActiveSessions(superadminId) {
  await db.runAsync(
    `UPDATE support_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP
     WHERE superadmin_id = ? AND status = 'active'`,
    [superadminId]
  );
}

async function startSupportSession({ superadmin, churchId, reason, req }) {
  const reasonText = String(reason || '').trim();
  if (!reasonText || reasonText.length < 5) {
    throw Object.assign(new Error('A support reason is required (min 5 characters)'), {
      status: 400
    });
  }

  const church = await getChurchById(churchId);
  if (!church) {
    throw Object.assign(new Error('Church not found'), { status: 404 });
  }

  // End any prior open session for this superadmin
  await endActiveSessions(superadmin.id);

  const meta = clientMeta(req);
  const result = await db.runAsync(
    `INSERT INTO support_sessions (
      superadmin_id, superadmin_email, church_id, reason, status, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    [
      superadmin.id,
      superadmin.email || null,
      churchId,
      reasonText,
      meta.ipAddress,
      meta.userAgent
    ]
  );

  const session = await getSessionById(result.lastID);

  // Prefer HQ branch of target church for operational context
  const hq = await db.getAsync(
    `SELECT id FROM branches WHERE church_id = ? AND is_headquarters = 1 LIMIT 1`,
    [churchId]
  );
  const anyBranch = hq || (await db.getAsync(
    `SELECT id FROM branches WHERE church_id = ? ORDER BY id LIMIT 1`,
    [churchId]
  ));

  const branch = await db.getAsync(
    'SELECT id, token_version, church_id, email, branchname FROM branches WHERE id = ?',
    [superadmin.id]
  );

  const token = jwt.sign(
    {
      id: superadmin.id,
      email: superadmin.email || branch?.email,
      // Explicitly NOT a church admin of the target tenant
      isadmin: false,
      isSuperadmin: true,
      supportMode: true,
      supportSessionId: session.id,
      supportReason: reasonText,
      churchId: Number(churchId),
      homeChurchId: branch?.church_id || superadmin.churchId || null,
      branchId: anyBranch?.id || null,
      activeBranchId: anyBranch?.id || null,
      userType: 'branch',
      tokenVersion: branch?.token_version ?? superadmin.tokenVersion ?? 0
    },
    getJwtSecret(),
    { expiresIn: '4h' }
  );

  return {
    token,
    session,
    church: churchSummary(church),
    banner: 'You are currently accessing this church as Superadmin.',
    user: {
      id: superadmin.id,
      email: superadmin.email || branch?.email,
      branchname: branch?.branchname || 'Platform Superadmin',
      isadmin: false,
      isSuperadmin: true,
      supportMode: true,
      supportSessionId: session.id,
      supportReason: reasonText,
      supportChurchName: church.name,
      churchId: Number(churchId),
      homeChurchId: branch?.church_id || superadmin.churchId || null,
      branchId: anyBranch?.id || null,
      homeBranchId: anyBranch?.id || null,
      activeBranchId: anyBranch?.id || null,
      church: churchSummary(church),
      userType: 'branch',
      permissions: [],
      roles: []
    }
  };
}

async function endSupportSession({ superadmin, req }) {
  const active = await getActiveSession(superadmin.id);
  if (!active) {
    throw Object.assign(new Error('No active support session'), { status: 400 });
  }

  await db.runAsync(
    `UPDATE support_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [active.id]
  );

  const branch = await db.getAsync(
    'SELECT id, email, branchname, church_id, token_version, isadmin, is_platform_admin FROM branches WHERE id = ?',
    [superadmin.id]
  );
  if (!branch || !branch.is_platform_admin) {
    throw Object.assign(new Error('Superadmin account not found'), { status: 403 });
  }

  const church = await getChurchById(branch.church_id);
  const token = jwt.sign(
    {
      id: branch.id,
      email: branch.email,
      isadmin: branch.isadmin,
      isSuperadmin: true,
      supportMode: false,
      churchId: branch.church_id,
      branchId: branch.id,
      activeBranchId: branch.id,
      userType: 'branch',
      tokenVersion: branch.token_version ?? 0
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );

  const ended = await getSessionById(active.id);

  return {
    token,
    session: ended,
    user: {
      id: branch.id,
      email: branch.email,
      branchname: branch.branchname,
      isadmin: branch.isadmin,
      isSuperadmin: true,
      supportMode: false,
      churchId: branch.church_id,
      branchId: branch.id,
      homeBranchId: branch.id,
      activeBranchId: branch.id,
      church: churchSummary(church),
      userType: 'branch'
    }
  };
}

async function listSessionActions(sessionId, churchId) {
  return db.allAsync(
    `SELECT id, action, resource, resource_id, summary, created_at, user_email
     FROM audit_logs
     WHERE support_session_id = ? AND (church_id = ? OR church_id IS NULL)
     ORDER BY created_at ASC, id ASC`,
    [sessionId, churchId]
  );
}

module.exports = {
  getActiveSession,
  getSessionById,
  startSupportSession,
  endSupportSession,
  listSessionActions,
  endActiveSessions
};
