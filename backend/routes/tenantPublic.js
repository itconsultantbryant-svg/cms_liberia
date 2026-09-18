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
  resolveTenantBySlug,
  normalizeHost,
  listDomainsForChurch,
  addChurchDomain,
  setPrimaryDomain,
  deleteChurchDomain,
  verifyDomainWithToken,
  serializeDomain,
  getPlatformDomain,
  suggestChurchUrls
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
 * Public — resolve Host (or ?host= / ?slug=) to church branding context.
 * Prefer ?slug= on platform hub hosts so /t/:slug/login works without DNS.
 */
router.get('/resolve', async (req, res) => {
  try {
    const slugParam = req.query.slug ? String(req.query.slug).trim() : '';
    if (slugParam) {
      const bySlug = await resolveTenantBySlug(slugParam);
      const payload = {
        ...bySlug,
        platformDomain: getPlatformDomain() || null,
        domain: null
      };
      if (!bySlug.resolved) {
        return res.status(404).json({
          success: false,
          error: 'No church found for this slug',
          code: 'TENANT_SLUG_UNKNOWN',
          data: payload,
          ...payload
        });
      }
      return res.json({ success: true, data: payload, ...payload });
    }

    const host = normalizeHost(req.query.host || extractRequestHost(req));
    const requireVerified = req.query.allowPending !== '1';
    const result = await resolveTenantByHost(host, { requireVerified });

    const payload = {
      ...result,
      platformDomain: getPlatformDomain() || null,
      ...(result.church?.slug ? suggestChurchUrls(result.church.slug) : {}),
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
      if (result.reason === 'platform_root') {
        return res.json({
          success: true,
          data: { ...payload, ...suggestChurchUrls('') },
          ...payload
        });
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

/** Public platform meta for subdomain suggestions */
router.get('/platform', (req, res) => {
  const platformDomain = getPlatformDomain() || null;
  res.json({
    platformDomain,
    ...suggestChurchUrls(req.query.slug || 'example')
  });
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
