/**
 * Phase 40 — resolve tenant from Host / X-Forwarded-Host before auth.
 * Never invents a tenant for unknown hosts.
 */
const { normalizeHost, resolveTenantByHost } = require('../utils/domains');

function extractRequestHost(req) {
  const xf = req.headers['x-forwarded-host'];
  if (xf) return normalizeHost(String(xf).split(',')[0]);
  return normalizeHost(req.headers.host || req.query.host || '');
}

async function resolveDomainTenant(req, res, next) {
  try {
    const host = extractRequestHost(req);
    req.requestHost = host;
    const resolved = await resolveTenantByHost(host, { requireVerified: true });
    req.resolvedTenant = resolved;
    if (resolved.resolved && resolved.church) {
      req.hostChurchId = resolved.church.id;
      req.hostChurch = resolved.church;
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  extractRequestHost,
  resolveDomainTenant
};
