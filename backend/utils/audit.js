/**
 * Phase 25 immutable audit logging helpers.
 * Writes only — no update/delete APIs for church admins.
 */
const db = require('../database');

const ACTIONS = [
  'login',
  'logout',
  'login_failed',
  'create',
  'update',
  'delete',
  'approve',
  'reject',
  'submit',
  'activate',
  'suspend',
  'permission_change',
  'role_change',
  'financial_change',
  'church_change',
  'branch_change',
  'support_access_start',
  'support_access_end',
  'other'
];

function clientMeta(req) {
  if (!req) return { ipAddress: null, userAgent: null };
  const xf = req.headers?.['x-forwarded-for'];
  const ip =
    (typeof xf === 'string' && xf.split(',')[0].trim()) ||
    req.ip ||
    req.connection?.remoteAddress ||
    null;
  const userAgent = req.headers?.['user-agent'] || null;
  return { ipAddress: ip, userAgent };
}

function safeJson(value) {
  if (value == null) return null;
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

/**
 * Persist an audit row. Never throws to callers (logs errors).
 */
async function writeAuditLog({
  req = null,
  churchId = null,
  branchId = null,
  userId = null,
  userType = null,
  userEmail = null,
  action,
  resource = null,
  resourceId = null,
  summary = null,
  previousValues = null,
  newValues = null,
  ipAddress = null,
  userAgent = null,
  supportSessionId = null
} = {}) {
  try {
    if (!action) return null;
    const meta = clientMeta(req);
    const u = req?.user;

    // Attribute to real actor; never rewrite as church admin during support mode
    let summaryText = summary;
    if (u?.supportMode && summaryText && !String(summaryText).includes('[Support]')) {
      summaryText = `[Support] ${summaryText}`;
    }

    const row = {
      churchId: churchId ?? req?.churchId ?? u?.churchId ?? u?.church_id ?? null,
      branchId:
        branchId ??
        req?.activeBranchId ??
        u?.activeBranchId ??
        u?.branchId ??
        u?.branch_id ??
        null,
      userId: userId ?? u?.id ?? null,
      userType: userType ?? u?.userType ?? (u ? 'branch' : null),
      userEmail: userEmail ?? u?.email ?? null,
      action: ACTIONS.includes(action) ? action : 'other',
      resource,
      resourceId: resourceId != null ? String(resourceId) : null,
      summary: summaryText,
      previousValues: safeJson(previousValues),
      newValues: safeJson(newValues),
      ipAddress: ipAddress ?? meta.ipAddress,
      userAgent: userAgent ?? meta.userAgent,
      supportSessionId:
        supportSessionId ?? u?.supportSessionId ?? req?.supportSessionId ?? null
    };

    const result = await db.runAsync(
      `INSERT INTO audit_logs (
        church_id, branch_id, user_id, user_type, user_email,
        action, resource, resource_id, summary,
        previous_values, new_values, ip_address, user_agent, support_session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.churchId,
        row.branchId,
        row.userId,
        row.userType,
        row.userEmail,
        row.action,
        row.resource,
        row.resourceId,
        row.summary,
        row.previousValues,
        row.newValues,
        row.ipAddress,
        row.userAgent,
        row.supportSessionId
      ]
    );
    return result.lastID;
  } catch (error) {
    // Fallback without support_session_id if column missing
    try {
      if (String(error.message || '').includes('support_session_id')) {
        const meta = clientMeta(req);
        const u = req?.user;
        const result = await db.runAsync(
          `INSERT INTO audit_logs (
            church_id, branch_id, user_id, user_type, user_email,
            action, resource, resource_id, summary,
            previous_values, new_values, ip_address, user_agent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            churchId ?? req?.churchId ?? u?.churchId ?? null,
            branchId ?? req?.activeBranchId ?? u?.activeBranchId ?? u?.branchId ?? null,
            userId ?? u?.id ?? null,
            userType ?? u?.userType ?? 'branch',
            userEmail ?? u?.email ?? null,
            ACTIONS.includes(action) ? action : 'other',
            resource,
            resourceId != null ? String(resourceId) : null,
            summary,
            safeJson(previousValues),
            safeJson(newValues),
            ipAddress ?? meta.ipAddress,
            userAgent ?? meta.userAgent
          ]
        );
        return result.lastID;
      }
    } catch (_) { /* ignore */ }
    console.error('[audit] write failed:', error.message);
    return null;
  }
}

/** Convenience: audit from an Express request */
function audit(req, opts) {
  return writeAuditLog({ req, ...opts });
}

module.exports = {
  ACTIONS,
  writeAuditLog,
  audit,
  clientMeta,
  safeJson
};
