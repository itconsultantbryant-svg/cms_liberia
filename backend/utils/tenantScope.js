/**
 * Phase 32 — database tenant isolation helpers.
 * All tenant queries must use authenticated church context — never client-supplied church_id.
 */
const db = require('../database');
const { ApiError } = require('../middleware/errorHandler');
const { canAccessBranch, getAccessibleBranches } = require('./branches');

/**
 * Strip any client attempt to set / override tenant identity.
 */
function scrubClientTenantOverrides(req) {
  if (req.body && typeof req.body === 'object') {
    delete req.body.church_id;
    delete req.body.churchId;
    delete req.body.tenant_id;
    delete req.body.tenantId;
  }
  if (req.query && typeof req.query === 'object') {
    delete req.query.church_id;
    delete req.query.churchId;
    delete req.query.tenant_id;
    delete req.query.tenantId;
  }
  // Never honor spoofed tenant headers
  if (req.headers) {
    delete req.headers['x-church-id'];
    delete req.headers['x-tenant-id'];
  }
}

function requireChurchContext(req) {
  const churchId = req.churchId || req.user?.churchId;
  if (!churchId) {
    throw new ApiError(403, 'No church (tenant) context', 'TENANT_REQUIRED');
  }
  return Number(churchId);
}

function assertSameChurch(req, resourceChurchId) {
  const churchId = requireChurchContext(req);
  if (resourceChurchId == null || Number(resourceChurchId) !== churchId) {
    throw new ApiError(404, 'Resource not found', 'TENANT_ISOLATION');
  }
  return churchId;
}

/**
 * Fetch a single row by id only if it belongs to the authenticated church.
 * Returns null (not throw) when missing — callers map to 404.
 */
async function getInChurch(table, id, churchId, { idColumn = 'id', churchColumn = 'church_id', columns = '*' } = {}) {
  if (!table || !id || !churchId) return null;
  // Whitelist table names to avoid injection via helper misuse
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new ApiError(500, 'Invalid table for tenant query', 'TENANT_QUERY');
  }
  if (columns !== '*' && !/^[a-z0-9_,\s.*]+$/i.test(columns)) {
    throw new ApiError(500, 'Invalid columns for tenant query', 'TENANT_QUERY');
  }
  return db.getAsync(
    `SELECT ${columns} FROM ${table} WHERE ${idColumn} = ? AND ${churchColumn} = ?`,
    [id, churchId]
  );
}

async function deleteInChurch(table, id, churchId, { idColumn = 'id', churchColumn = 'church_id' } = {}) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new ApiError(500, 'Invalid table for tenant query', 'TENANT_QUERY');
  }
  return db.runAsync(
    `DELETE FROM ${table} WHERE ${idColumn} = ? AND ${churchColumn} = ?`,
    [id, churchId]
  );
}

/**
 * SQL fragment helpers — always pair with requireChurchContext params.
 */
function churchFilter(alias = '') {
  const col = alias ? `${alias}.church_id` : 'church_id';
  return `${col} = ?`;
}

async function resolveAuthorizedBranchIds(req) {
  const churchId = requireChurchContext(req);
  const user = req.user;
  if (!user) return [];

  // Church admins / platform support see all branches in church
  if (user.isadmin || user.isSuperadmin || user.supportMode) {
    const rows = await db.allAsync(
      'SELECT id FROM branches WHERE church_id = ?',
      [churchId]
    );
    return rows.map((r) => r.id);
  }

  try {
    const branches = await getAccessibleBranches(user, churchId);
    if (Array.isArray(branches) && branches.length) {
      return branches.map((b) => b.id);
    }
  } catch (_) { /* fall through */ }

  const home = req.activeBranchId || user.activeBranchId || user.branchId || user.id;
  if (home && (await canAccessBranch(user, churchId, home))) {
    return [Number(home)];
  }
  return home ? [Number(home)] : [];
}

/**
 * Branch filter: church_id match AND branch in authorized set (when scoped).
 */
function branchInFilter(alias, branchIds) {
  const col = alias ? `${alias}.branch_id` : 'branch_id';
  if (!branchIds || !branchIds.length) {
    return { sql: '1=0', params: [] };
  }
  const placeholders = branchIds.map(() => '?').join(',');
  return { sql: `${col} IN (${placeholders})`, params: [...branchIds] };
}

/**
 * Attach req.tenant and scrub client overrides. Call after requireTenant.
 */
async function attachTenantScope(req, _res, next) {
  try {
    scrubClientTenantOverrides(req);
    const churchId = requireChurchContext(req);
    const authorizedBranchIds = await resolveAuthorizedBranchIds(req);
    req.tenant = {
      churchId,
      activeBranchId: req.activeBranchId || req.user?.activeBranchId || req.user?.branchId,
      authorizedBranchIds,
      /** Always use this for inserts — never body.church_id */
      churchIdForWrite: churchId
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  scrubClientTenantOverrides,
  requireChurchContext,
  assertSameChurch,
  getInChurch,
  deleteInChurch,
  churchFilter,
  resolveAuthorizedBranchIds,
  branchInFilter,
  attachTenantScope
};
