/**
 * Phase 40 — custom domain & subdomain tenant resolution.
 *
 * Resolution order for a Host:
 *  1. Exact match on church_domains.domain (verified, or pending if allowPending)
 *  2. Subdomain of PLATFORM_DOMAIN → churches.slug
 *  3. Platform root hosts (APP_URL / localhost) → no tenant (multi-tenant hub)
 *  4. Unknown → unresolved (NEVER default to another church)
 */
const crypto = require('crypto');
const db = require('../database');
const { getChurchById, churchSummary, slugify } = require('./tenant');

const VERIFICATION_STATUSES = ['pending', 'verified', 'failed'];
const SSL_STATUSES = ['pending', 'active', 'none', 'error'];

function normalizeHost(raw) {
  if (!raw) return '';
  let h = String(raw).trim().toLowerCase();
  // strip scheme if passed
  h = h.replace(/^https?:\/\//, '');
  // strip path/query
  h = h.split('/')[0];
  // strip port
  h = h.split(':')[0];
  // strip trailing dot
  h = h.replace(/\.$/, '');
  // www. alias for lookup of apex custom domains is handled separately
  return h;
}

function platformRootHosts() {
  const set = new Set(['localhost', '127.0.0.1']);
  const appUrl = process.env.APP_URL || '';
  try {
    if (appUrl) set.add(normalizeHost(new URL(appUrl).host));
  } catch (_) { /* */ }
  const extras = String(process.env.PLATFORM_ROOT_HOSTS || '')
    .split(',')
    .map(s => normalizeHost(s))
    .filter(Boolean);
  extras.forEach(h => set.add(h));
  const platformDomain = normalizeHost(process.env.PLATFORM_DOMAIN || '');
  if (platformDomain) set.add(platformDomain);
  return set;
}

function getPlatformDomain() {
  return normalizeHost(process.env.PLATFORM_DOMAIN || '');
}

function isPlatformRootHost(host) {
  const h = normalizeHost(host);
  if (!h) return true;
  return platformRootHosts().has(h);
}

/**
 * Extract slug from {slug}.platformdomain.com
 */
function subdomainSlug(host, platformDomain = getPlatformDomain()) {
  const h = normalizeHost(host);
  const base = normalizeHost(platformDomain);
  if (!h || !base) return null;
  if (h === base) return null;
  if (!h.endsWith(`.${base}`)) return null;
  const sub = h.slice(0, -(base.length + 1));
  if (!sub || sub.includes('.')) return null; // only one label
  if (sub === 'www' || sub === 'api' || sub === 'app' || sub === 'admin') return null;
  return slugify(sub);
}

async function getDomainRow(domain) {
  const d = normalizeHost(domain);
  if (!d) return null;
  return db.getAsync('SELECT * FROM church_domains WHERE domain = ? COLLATE NOCASE', [d]);
}

async function listDomainsForChurch(churchId) {
  return db.allAsync(
    `SELECT * FROM church_domains WHERE church_id = ? ORDER BY is_primary DESC, id ASC`,
    [churchId]
  );
}

async function addChurchDomain(churchId, domain, { isPrimary = false, notes = null } = {}) {
  const d = normalizeHost(domain);
  if (!d || d.length < 3 || !d.includes('.')) {
    const err = new Error('Invalid domain');
    err.status = 400;
    err.code = 'DOMAIN_INVALID';
    throw err;
  }
  if (isPlatformRootHost(d)) {
    const err = new Error('Cannot claim a platform root host as a church domain');
    err.status = 400;
    err.code = 'DOMAIN_RESERVED';
    throw err;
  }
  const platformDomain = getPlatformDomain();
  if (platformDomain && (d === platformDomain || d.endsWith(`.${platformDomain}`))) {
    const err = new Error('Use church slug subdomains on the platform domain; do not register them as custom domains');
    err.status = 400;
    err.code = 'DOMAIN_USE_SUBDOMAIN';
    throw err;
  }

  const existing = await getDomainRow(d);
  if (existing) {
    const err = new Error('Domain already registered');
    err.status = 409;
    err.code = 'DOMAIN_TAKEN';
    throw err;
  }

  const token = `cms-verify-${crypto.randomBytes(16).toString('hex')}`;
  if (isPrimary) {
    await db.runAsync('UPDATE church_domains SET is_primary = 0 WHERE church_id = ?', [churchId]);
  }
  const result = await db.runAsync(
    `INSERT INTO church_domains (
      church_id, domain, verification_status, ssl_status, is_primary, verification_token, notes
    ) VALUES (?, ?, 'pending', 'pending', ?, ?, ?)`,
    [churchId, d, isPrimary ? 1 : 0, token, notes]
  );
  return db.getAsync('SELECT * FROM church_domains WHERE id = ?', [result.lastID]);
}

async function setPrimaryDomain(churchId, domainId) {
  const row = await db.getAsync(
    'SELECT * FROM church_domains WHERE id = ? AND church_id = ?',
    [domainId, churchId]
  );
  if (!row) {
    const err = new Error('Domain not found');
    err.status = 404;
    err.code = 'DOMAIN_NOT_FOUND';
    throw err;
  }
  await db.runAsync('UPDATE church_domains SET is_primary = 0 WHERE church_id = ?', [churchId]);
  await db.runAsync(
    `UPDATE church_domains SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [domainId]
  );
  return db.getAsync('SELECT * FROM church_domains WHERE id = ?', [domainId]);
}

async function deleteChurchDomain(churchId, domainId) {
  const result = await db.runAsync(
    'DELETE FROM church_domains WHERE id = ? AND church_id = ?',
    [domainId, churchId]
  );
  return result.changes > 0;
}

/**
 * Mark verified (DNS check or Superadmin override).
 */
async function markDomainVerified(domainId, { sslStatus = 'active', method = 'manual' } = {}) {
  await db.runAsync(
    `UPDATE church_domains
     SET verification_status = 'verified',
         ssl_status = ?,
         verified_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP,
         notes = COALESCE(notes, '') || ?
     WHERE id = ?`,
    [sslStatus, `\nverified_via=${method}`, domainId]
  );
  return db.getAsync('SELECT * FROM church_domains WHERE id = ?', [domainId]);
}

async function markDomainFailed(domainId, reason = 'verification failed') {
  await db.runAsync(
    `UPDATE church_domains
     SET verification_status = 'failed', updated_at = CURRENT_TIMESTAMP, notes = ?
     WHERE id = ?`,
    [reason, domainId]
  );
  return db.getAsync('SELECT * FROM church_domains WHERE id = ?', [domainId]);
}

/**
 * Local/dev verification: confirm token presented matches stored token.
 * Production should replace with real DNS TXT lookup.
 */
async function verifyDomainWithToken(churchId, domainId, presentedToken) {
  const row = await db.getAsync(
    'SELECT * FROM church_domains WHERE id = ? AND church_id = ?',
    [domainId, churchId]
  );
  if (!row) {
    const err = new Error('Domain not found');
    err.status = 404;
    throw err;
  }
  if (presentedToken && presentedToken === row.verification_token) {
    return markDomainVerified(domainId, { method: 'token' });
  }
  // In non-production, allow VERIFY_DOMAINS_SKIP_DNS=1 to accept without DNS
  if (
    process.env.VERIFY_DOMAINS_SKIP_DNS === '1' ||
    process.env.NODE_ENV === 'development'
  ) {
    return markDomainVerified(domainId, { method: 'dev_skip_dns' });
  }
  return markDomainFailed(domainId, 'DNS TXT token mismatch or missing');
}

/**
 * Resolve host → church tenant.
 * @returns {{ resolved: boolean, reason: string, host: string, mode?: string, church?: object, domain?: object }}
 */
async function resolveTenantByHost(rawHost, { requireVerified = true } = {}) {
  const host = normalizeHost(rawHost);
  if (!host) {
    return { resolved: false, reason: 'missing_host', host: '' };
  }

  if (isPlatformRootHost(host)) {
    return { resolved: false, reason: 'platform_root', host, mode: 'platform' };
  }

  // 1) Custom domain mapping
  let domainRow = await getDomainRow(host);
  if (!domainRow && host.startsWith('www.')) {
    domainRow = await getDomainRow(host.slice(4));
  }
  if (domainRow) {
    if (requireVerified && domainRow.verification_status !== 'verified') {
      return {
        resolved: false,
        reason: 'domain_unverified',
        host,
        mode: 'custom',
        domain: serializeDomain(domainRow)
      };
    }
    const church = await getChurchById(domainRow.church_id);
    if (!church || church.status === 'archived') {
      return { resolved: false, reason: 'church_unavailable', host, mode: 'custom' };
    }
    return {
      resolved: true,
      reason: 'custom_domain',
      host,
      mode: 'custom',
      church: churchSummary(church),
      domain: serializeDomain(domainRow)
    };
  }

  // 2) Platform subdomain → slug
  const slug = subdomainSlug(host);
  if (slug) {
    const church = await db.getAsync(
      `SELECT id, name, short_name, slug, email, phone, website_url, logo_url, favicon_url,
              primary_color, secondary_color, timezone, currency, status
       FROM churches WHERE slug = ?`,
      [slug]
    );
    if (!church) {
      return { resolved: false, reason: 'unknown_subdomain', host, mode: 'subdomain', slug };
    }
    if (church.status === 'archived') {
      return { resolved: false, reason: 'church_unavailable', host, mode: 'subdomain', slug };
    }
    return {
      resolved: true,
      reason: 'platform_subdomain',
      host,
      mode: 'subdomain',
      church: churchSummary(church),
      slug
    };
  }

  // 3) Unknown — never default
  return { resolved: false, reason: 'unknown_host', host };
}

function serializeDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    domain: row.domain,
    verificationStatus: row.verification_status,
    sslStatus: row.ssl_status,
    isPrimary: !!row.is_primary,
    verificationToken: row.verification_token,
    verifiedAt: row.verified_at,
    createdAt: row.created_at
  };
}

/**
 * If the request host resolves to a tenant, the authenticated user's church
 * must match (Superadmins exempt). Unknown/platform hosts do not constrain.
 */
function assertLoginAllowedForHost(resolved, userChurchId, { isSuperadmin = false } = {}) {
  if (!resolved || !resolved.resolved || !resolved.church) {
    return { ok: true };
  }
  if (isSuperadmin) return { ok: true };
  if (Number(userChurchId) !== Number(resolved.church.id)) {
    return {
      ok: false,
      status: 403,
      code: 'TENANT_HOST_MISMATCH',
      error: 'This account does not belong to the church for this domain'
    };
  }
  return { ok: true };
}

module.exports = {
  VERIFICATION_STATUSES,
  SSL_STATUSES,
  normalizeHost,
  platformRootHosts,
  getPlatformDomain,
  isPlatformRootHost,
  subdomainSlug,
  getDomainRow,
  listDomainsForChurch,
  addChurchDomain,
  setPrimaryDomain,
  deleteChurchDomain,
  markDomainVerified,
  markDomainFailed,
  verifyDomainWithToken,
  resolveTenantByHost,
  serializeDomain,
  assertLoginAllowedForHost
};
