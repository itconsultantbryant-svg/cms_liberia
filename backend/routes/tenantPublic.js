/**
 * Phase 40 — public tenant resolution + church domain management.
 */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { attachRoleInfo } = require('../middleware/roleAuth');
const {
  resolveTenantByHost,
  normalizeHost,
  listDomainsForChurch,
  addChurchDomain,
  setPrimaryDomain,
  deleteChurchDomain,
  verifyDomainWithToken,
  serializeDomain,
  getPlatformDomain
} = require('../utils/domains');
const { extractRequestHost } = require('../middleware/domainTenant');

function requireChurchAdmin(req, res, next) {
  if (req.user?.isadmin || req.user?.isSuperadmin) return next();
  if (req.userRoles?.some(r => ['PRESIDENT', 'MISSION_SECRETARY'].includes(r.role_code))) {
    return next();
  }
  const code = req.primaryRole?.role_code;
  if (code === 'PRESIDENT' || code === 'MISSION_SECRETARY') return next();
  return res.status(403).json({ error: 'Church administrator access required' });
}
/**
 * GET /api/tenant/resolve
 * Public — resolve Host (or ?host=) to church branding context.
 * Unknown hosts return 404 with resolved:false (never another church).
 */
router.get('/resolve', async (req, res) => {
  try {
    const host = normalizeHost(req.query.host || extractRequestHost(req));
    const requireVerified = req.query.allowPending !== '1';
    const result = await resolveTenantByHost(host, { requireVerified });

    const payload = {
      ...result,
      platformDomain: getPlatformDomain() || null,
      // Never leak verification tokens on public resolve for unverified? include for owner UX via auth route
      domain: result.domain
        ? {
            domain: result.domain.domain,
            verificationStatus: result.domain.verificationStatus,
            sslStatus: result.domain.sslStatus,
            isPrimary: result.domain.isPrimary
          }
        : null
    };

    if (!result.resolved) {
      // platform_root is ok (hub login) — 200 with resolved false
      if (result.reason === 'platform_root') {
        return res.json({ success: true, data: payload, ...payload });
      }
      return res.status(404).json({
        success: false,
        error: 'No church is mapped to this domain',
        code: 'TENANT_HOST_UNKNOWN',
        data: payload,
        ...payload
      });
    }

    res.json({ success: true, data: payload, ...payload });
  } catch (error) {
    console.error('[tenant/resolve]', error);
    res.status(500).json({ error: error.message });
  }
});

/** Authenticated church-admin domain CRUD */
router.get(
  '/domains',
  authMiddleware,
  requireTenant,
  attachRoleInfo,
  requireChurchAdmin,
  async (req, res) => {
    try {
      const rows = await listDomainsForChurch(req.churchId);
      res.json({
        domains: rows.map(serializeDomain),
        platformDomain: getPlatformDomain() || null,
        subdomainHint: getPlatformDomain()
          ? `${req.church?.slug || 'your-slug'}.${getPlatformDomain()}`
          : null
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  '/domains',
  authMiddleware,
  requireTenant,
  attachRoleInfo,
  requireChurchAdmin,
  async (req, res) => {
    try {
      const row = await addChurchDomain(req.churchId, req.body.domain, {
        isPrimary: !!req.body.isPrimary,
        notes: req.body.notes || null
      });
      res.status(201).json({
        domain: serializeDomain(row),
        instructions: {
          dnsTxt: `Add TXT record: cms-verify=${row.verification_token}`,
          orCname: 'Point CNAME/A to the platform edge, then call POST /api/tenant/domains/:id/verify'
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message, code: error.code });
    }
  }
);

router.post(
  '/domains/:id/primary',
  authMiddleware,
  requireTenant,
  attachRoleInfo,
  requireChurchAdmin,
  async (req, res) => {
    try {
      const row = await setPrimaryDomain(req.churchId, req.params.id);
      res.json({ domain: serializeDomain(row) });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message, code: error.code });
    }
  }
);

router.post(
  '/domains/:id/verify',
  authMiddleware,
  requireTenant,
  attachRoleInfo,
  requireChurchAdmin,
  async (req, res) => {
    try {
      const row = await verifyDomainWithToken(
        req.churchId,
        req.params.id,
        req.body.token || req.body.verificationToken
      );
      res.json({ domain: serializeDomain(row) });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message, code: error.code });
    }
  }
);

router.delete(
  '/domains/:id',
  authMiddleware,
  requireTenant,
  attachRoleInfo,
  requireChurchAdmin,
  async (req, res) => {
    try {
      const ok = await deleteChurchDomain(req.churchId, req.params.id);
      if (!ok) return res.status(404).json({ error: 'Domain not found' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
