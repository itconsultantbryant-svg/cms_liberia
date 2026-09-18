const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { getChurchById, churchSummary } = require('../utils/tenant');
const { audit } = require('../utils/audit');
const { getChurchSubscription, checkLimits } = require('../utils/subscriptions');
const {
  createUpload,
  registerStoredFile,
  accessUrl,
  signedUrl,
  ensureChurchRoot
} = require('../utils/fileStorage');

function requireChurchBrandingEditor(req, res, next) {
  if (req.user?.isadmin || req.user?.isSuperadmin) return next();
  const code = req.userRole?.role_code || req.user?.primaryRole?.role_code;
  if (code === 'PRESIDENT' || code === 'MISSION_SECRETARY') return next();
  if (req.userRoles?.some(r => ['PRESIDENT', 'MISSION_SECRETARY'].includes(r.role_code))) {
    return next();
  }
  return res.status(403).json({ error: 'Church admin access required to edit branding' });
}

function resolveAssetUrl(value) {
  if (!value) return null;
  if (String(value).startsWith('http') || String(value).startsWith('/api/files/')) return value;
  // Legacy public path still works for old uploads
  if (String(value).startsWith('/uploads/')) return value;
  return value;
}

router.use(authMiddleware, requireTenant, attachRoleInfo);

/** GET /api/church/branding — own tenant branding */
router.get('/branding', async (req, res) => {
  try {
    const church = await db.getAsync('SELECT * FROM churches WHERE id = ?', [req.churchId]);
    if (!church) return res.status(404).json({ error: 'Church not found' });
    res.json({
      branding: {
        ...churchSummary(church),
        faviconUrl: resolveAssetUrl(church.favicon_url),
        websiteUrl: church.website_url || null,
        timezone: church.timezone || null,
        email: church.email || null,
        phone: church.phone || null,
        shortName: church.short_name || null,
        logoUrl: resolveAssetUrl(church.logo_url),
        loginBackgroundUrl: resolveAssetUrl(church.login_background_url),
        faviconUrlResolved: resolveAssetUrl(church.favicon_url)
      }
    });
  } catch (error) {
    console.error('[church/branding GET]', error);
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/church/branding */
router.patch('/branding', requireChurchBrandingEditor, async (req, res) => {
  try {
    const fields = {
      name: req.body.name,
      short_name: req.body.shortName ?? req.body.short_name,
      website_url: req.body.websiteUrl ?? req.body.website_url,
      primary_color: req.body.primaryColor ?? req.body.primary_color,
      secondary_color: req.body.secondaryColor ?? req.body.secondary_color,
      timezone: req.body.timezone,
      phone: req.body.phone,
      email: req.body.email
    };

    const hex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
    if (fields.primary_color != null && !hex.test(fields.primary_color)) {
      return res.status(400).json({ error: 'primaryColor must be a hex color like #2c3e50' });
    }
    if (fields.secondary_color != null && !hex.test(fields.secondary_color)) {
      return res.status(400).json({ error: 'secondaryColor must be a hex color like #3498db' });
    }

    const sets = [];
    const params = [];
    for (const [col, val] of Object.entries(fields)) {
      if (val !== undefined) {
        sets.push(`${col} = ?`);
        params.push(val);
      }
    }
    if (!sets.length) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.churchId);
    await db.runAsync(`UPDATE churches SET ${sets.join(', ')} WHERE id = ?`, params);

    const church = await getChurchById(req.churchId);
    const full = await db.getAsync('SELECT * FROM churches WHERE id = ?', [req.churchId]);
    await audit(req, {
      action: 'church_change',
      resource: 'church',
      resourceId: req.churchId,
      summary: 'Church branding/settings updated',
      newValues: fields
    });
    res.json({
      message: 'Branding updated',
      branding: {
        ...churchSummary(church),
        faviconUrl: resolveAssetUrl(full.favicon_url),
        logoUrl: resolveAssetUrl(full.logo_url),
        timezone: full.timezone,
        email: full.email,
        phone: full.phone
      }
    });
  } catch (error) {
    console.error('[church/branding PATCH]', error);
    res.status(500).json({ error: error.message });
  }
});

function uploadHandler(kind) {
  const uploadMw = createUpload({ category: 'branding', field: 'file' });
  return [
    requireChurchBrandingEditor,
    (req, res, next) => {
      ensureChurchRoot(req.churchId);
      req.uploadKind = kind;
      next();
    },
    (req, res, next) => {
      uploadMw(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
      });
    },
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }
        const stored = await registerStoredFile(req, req.file, 'branding', {
          visibility: 'public_branding'
        });
        const url = signedUrl(stored, 86400 * 7);
        let column = 'logo_url';
        if (kind === 'favicon') column = 'favicon_url';
        else if (kind === 'login-background' || kind === 'login_background') column = 'login_background_url';
        else column = 'logo_url';
        await db.runAsync(
          `UPDATE churches SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [url, req.churchId]
        );
        const church = await getChurchById(req.churchId);
        const full = await db.getAsync('SELECT * FROM churches WHERE id = ?', [req.churchId]);
        res.json({
          message: `${kind} uploaded`,
          url,
          fileId: stored.id,
          accessUrl: accessUrl(stored),
          branding: {
            ...churchSummary(church),
            logoUrl: resolveAssetUrl(full.logo_url),
            faviconUrl: resolveAssetUrl(full.favicon_url)
          }
        });
      } catch (error) {
        console.error(`[church/branding ${kind}]`, error);
        res.status(error.status || 500).json({ error: error.message });
      }
    }
  ];
}

router.post('/branding/logo', ...uploadHandler('logo'));
router.post('/branding/favicon', ...uploadHandler('favicon'));
router.post('/branding/login-background', ...uploadHandler('login-background'));

const {
  createChurchAdministrator,
  listChurchAdmins,
  setBranchAdminFlag
} = require('../utils/churchAdmins');

function requireChurchAdmin(req, res, next) {
  if (req.user?.isadmin || req.user?.isSuperadmin) return next();
  if (req.userRoles?.some(r => ['PRESIDENT', 'MISSION_SECRETARY'].includes(r.role_code))) {
    return next();
  }
  const code = req.primaryRole?.role_code;
  if (code === 'PRESIDENT' || code === 'MISSION_SECRETARY') return next();
  return res.status(403).json({ error: 'Church administrator access required' });
}

/** GET /api/church/admins */
router.get('/admins', requireChurchAdmin, async (req, res) => {
  try {
    const admins = await listChurchAdmins(req.churchId);
    res.json({ admins });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/church/admins — add co-admin within own church */
router.post('/admins', requireChurchAdmin, async (req, res) => {
  try {
    const { email, password, name, branchcode } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const church = await db.getAsync('SELECT * FROM churches WHERE id = ?', [req.churchId]);
    const admin = await createChurchAdministrator({
      churchId: req.churchId,
      email,
      password,
      branchname: name || `${church?.name || 'Church'} Admin`,
      branchcode: branchcode || 'ADM',
      country: church?.country || '',
      city: church?.city || '',
      currency: church?.currency || 'USD'
    });
    res.status(201).json({ message: 'Church Admin created', admin });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** PATCH /api/church/admins/:branchId */
router.patch('/admins/:branchId', requireChurchAdmin, async (req, res) => {
  try {
    const isAdmin = req.body.isAdmin !== false && req.body.isadmin !== 0;
    // Prevent self-demotion if last admin handled in helper
    if (!isAdmin && Number(req.params.branchId) === Number(req.user.id)) {
      const admins = await listChurchAdmins(req.churchId);
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'Cannot revoke your own admin access as the last administrator' });
      }
    }
    const admin = await setBranchAdminFlag(req.churchId, req.params.branchId, !!isAdmin);
    res.json({ message: isAdmin ? 'Promoted to Church Admin' : 'Admin access revoked', admin });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** GET /api/church/subscription — own plan & usage (read-only for tenant) */
router.get('/subscription', async (req, res) => {
  try {
    const subscription = await getChurchSubscription(req.churchId);
    const limits = await checkLimits(req.churchId);
    res.json({ subscription, limits });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const {
  getChurchSettingsBundle,
  updateChurchSettings
} = require('../utils/churchSettings');

/** GET /api/church/settings — operational settings bundle */
router.get('/settings', async (req, res) => {
  try {
    const bundle = await getChurchSettingsBundle(req.churchId);
    if (!bundle) return res.status(404).json({ error: 'Church not found' });
    res.json(bundle);
  } catch (error) {
    console.error('[church/settings GET]', error);
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/church/settings — update profile & operational settings */
router.patch('/settings', requireChurchAdmin, async (req, res) => {
  try {
    const isSuperadmin = !!(req.user?.isSuperadmin || req.user?.is_superadmin);
    const bundle = await updateChurchSettings(req.churchId, req.body || {}, { isSuperadmin });
    if (req.body?.currency) {
      const { setDefaultForChurch, ensureChurchCurrencies, resolveCurrency } = require('../utils/currencies');
      await ensureChurchCurrencies(req.churchId, req.body.currency);
      const resolved = await resolveCurrency(req.churchId, req.body.currency);
      if (!resolved.ok) {
        return res.status(400).json({ error: resolved.error });
      }
      await setDefaultForChurch(req.churchId, resolved.currency);
    }
    await audit(req, {
      action: 'church_change',
      resource: 'church_settings',
      resourceId: req.churchId,
      summary: 'Church settings updated',
      newValues: req.body
    });
    res.json({ message: 'Settings updated', ...bundle });
  } catch (error) {
    console.error('[church/settings PATCH]', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

const currencies = require('../utils/currencies');

/** GET /api/church/currencies — USD, LRD, and any enabled extras */
router.get('/currencies', async (req, res) => {
  try {
    const list = await currencies.listForChurch(req.churchId);
    const defaultCurrency = await currencies.getDefaultCurrency(req.churchId);
    const catalog = await currencies.listCatalog();
    res.json({ currencies: list, defaultCurrency, catalog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/church/currencies — enable existing or add new currency for this church */
router.post('/currencies', requireChurchAdmin, async (req, res) => {
  try {
    const { code, name, symbol, makeDefault } = req.body || {};
    if (!code) return res.status(400).json({ error: 'code is required' });
    const result = await currencies.addCurrencyForChurch(req.churchId, {
      code,
      name,
      symbol,
      makeDefault
    });
    await audit(req, {
      action: 'create',
      resource: 'currency',
      resourceId: result.currency.code,
      summary: `Currency enabled: ${result.currency.code}`,
      newValues: { code: result.currency.code, name: result.currency.name }
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** PATCH /api/church/currencies/:code — set default */
router.patch('/currencies/:code', requireChurchAdmin, async (req, res) => {
  try {
    if (req.body?.makeDefault || req.body?.isDefault) {
      await currencies.setDefaultForChurch(req.churchId, req.params.code);
    } else if (req.body?.enable) {
      await currencies.enableForChurch(req.churchId, req.params.code);
    }
    res.json({
      currencies: await currencies.listForChurch(req.churchId),
      defaultCurrency: await currencies.getDefaultCurrency(req.churchId)
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** DELETE /api/church/currencies/:code — disable (not USD/LRD) */
router.delete('/currencies/:code', requireChurchAdmin, async (req, res) => {
  try {
    const list = await currencies.disableForChurch(req.churchId, req.params.code);
    res.json({
      currencies: list,
      defaultCurrency: await currencies.getDefaultCurrency(req.churchId)
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
