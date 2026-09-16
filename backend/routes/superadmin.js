const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireSuperadmin } = require('../middleware/tenant');
const { uniqueChurchSlug, getChurchById, churchSummary } = require('../utils/tenant');
const {
  createChurchAdministrator,
  listChurchAdmins,
  setBranchAdminFlag
} = require('../utils/churchAdmins');
const {
  listPlans,
  getPlan,
  getChurchSubscription,
  assignSubscription,
  updateSubscriptionStatus,
  checkLimits,
  SUB_STATUSES
} = require('../utils/subscriptions');
const { audit } = require('../utils/audit');
const {
  startSupportSession,
  endSupportSession,
  getActiveSession,
  getSessionById,
  listSessionActions
} = require('../utils/supportAccess');
const {
  listDomainsForChurch,
  addChurchDomain,
  setPrimaryDomain,
  deleteChurchDomain,
  markDomainVerified,
  serializeDomain,
  getPlatformDomain
} = require('../utils/domains');

router.use(authMiddleware, requireSuperadmin);

async function churchStats(churchId) {
  const branches = await db.getAsync(
    'SELECT COUNT(*) AS c FROM branches WHERE church_id = ?',
    [churchId]
  );
  const members = await db.getAsync(
    'SELECT COUNT(*) AS c FROM members WHERE church_id = ?',
    [churchId]
  );
  const users = await db.getAsync(
    'SELECT COUNT(*) AS c FROM sub_users WHERE church_id = ?',
    [churchId]
  );
  return {
    branchCount: branches?.c || 0,
    memberCount: members?.c || 0,
    subUserCount: users?.c || 0
  };
}

/** GET /api/superadmin — portal meta */
router.get('/', async (req, res) => {
  res.json({
    portal: 'superadmin',
    phase: 26,
    user: {
      id: req.user.id,
      email: req.user.email,
      isSuperadmin: true
    }
  });
});

/** GET /api/superadmin/churches */
router.get('/churches', async (req, res) => {
  try {
    const { status, q } = req.query;
    let sql = `SELECT c.id, c.name, c.short_name, c.slug, c.email, c.phone, c.country, c.city, c.address,
                      c.website_url, c.currency, c.timezone, c.status, c.created_at, c.updated_at,
                      c.subscription_status, c.subscription_plan_id,
                      p.code as plan_code, p.name as plan_name,
                      cs.status as sub_status
               FROM churches c
               LEFT JOIN subscription_plans p ON p.id = c.subscription_plan_id
               LEFT JOIN church_subscriptions cs ON cs.church_id = c.id
               WHERE 1=1`;
    const params = [];
    if (status) {
      sql += ' AND c.status = ?';
      params.push(status);
    }
    if (req.query.subscriptionStatus) {
      sql += ' AND COALESCE(cs.status, c.subscription_status) = ?';
      params.push(req.query.subscriptionStatus);
    }
    if (q) {
      sql += ' AND (c.name LIKE ? OR c.slug LIKE ? OR c.email LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY c.created_at DESC';

    const churches = await db.allAsync(sql, params);
    const withStats = [];
    for (const c of churches) {
      const stats = await churchStats(c.id);
      withStats.push({ ...c, ...stats, summary: churchSummary(c) });
    }
    res.json({ churches: withStats, total: withStats.length });
  } catch (error) {
    console.error('[superadmin/churches]', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/superadmin/churches/:id */
router.get('/churches/:id', async (req, res) => {
  try {
    const church = await db.getAsync('SELECT * FROM churches WHERE id = ?', [req.params.id]);
    if (!church) {
      return res.status(404).json({ error: 'Church not found' });
    }
    const stats = await churchStats(church.id);
    const branches = await db.allAsync(
      `SELECT id, branchname, branchcode, email, city, country, isadmin, is_platform_admin, created_at
       FROM branches WHERE church_id = ? ORDER BY id ASC`,
      [church.id]
    );
    const subscription = await getChurchSubscription(church.id);
    const limits = await checkLimits(church.id);
    res.json({
      church,
      stats,
      branches,
      subscription,
      limits,
      summary: churchSummary(church)
    });
  } catch (error) {
    console.error('[superadmin/churches/:id]', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/superadmin/churches — create tenant; optionally first Church Admin */
router.post('/churches', async (req, res) => {
  try {
    const {
      name,
      shortName,
      slug,
      email,
      phone,
      country,
      city,
      address,
      currency,
      timezone,
      adminEmail,
      adminPassword,
      adminName
    } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Church name is required' });
    }
    const finalSlug = await uniqueChurchSlug(slug || name);
    const result = await db.runAsync(
      `INSERT INTO churches (name, short_name, slug, email, phone, country, city, address, currency, timezone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        name,
        shortName || name.substring(0, 40),
        finalSlug,
        email || adminEmail || null,
        phone || null,
        country || null,
        city || null,
        address || null,
        currency || 'USD',
        timezone || 'Africa/Monrovia'
      ]
    );
    const churchId = result.lastID;
    try {
      const { ensureChurchCurrencies } = require('../utils/currencies');
      await ensureChurchCurrencies(churchId, currency || 'USD');
    } catch (e) {
      console.warn('[superadmin] currency seed skipped:', e.message);
    }
    let admin = null;

    if (adminEmail && adminPassword) {
      try {
        admin = await createChurchAdministrator({
          churchId,
          email: adminEmail,
          password: adminPassword,
          branchname: adminName || `${name} HQ`,
          branchcode: 'HQ',
          country: country || '',
          city: city || '',
          address: address || '',
          currency: currency || 'USD'
        });
      } catch (e) {
        // Roll back church if admin creation fails
        await db.runAsync('DELETE FROM churches WHERE id = ?', [churchId]);
        return res.status(e.status || 400).json({ error: e.message });
      }
    }

    const church = await getChurchById(churchId);
    try {
      const trial = await getPlan('trial');
      if (trial) {
        await assignSubscription(churchId, { planId: trial.id, status: 'trial' });
      }
    } catch (e) {
      console.warn('[superadmin] trial assign skipped:', e.message);
    }
    res.status(201).json({
      message: admin ? 'Church and Church Admin created' : 'Church created',
      church: churchSummary(church),
      id: churchId,
      admin,
      subscription: await getChurchSubscription(churchId)
    });
  } catch (error) {
    console.error('[superadmin create church]', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/superadmin/churches/:id/admins */
router.get('/churches/:id/admins', async (req, res) => {
  try {
    const church = await db.getAsync('SELECT id FROM churches WHERE id = ?', [req.params.id]);
    if (!church) return res.status(404).json({ error: 'Church not found' });
    const admins = await listChurchAdmins(church.id);
    res.json({ admins });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/superadmin/churches/:id/admins — add another Church Admin */
router.post('/churches/:id/admins', async (req, res) => {
  try {
    const church = await db.getAsync('SELECT * FROM churches WHERE id = ?', [req.params.id]);
    if (!church) return res.status(404).json({ error: 'Church not found' });
    const { email, password, name, branchcode } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const admin = await createChurchAdministrator({
      churchId: church.id,
      email,
      password,
      branchname: name || `${church.name} Admin`,
      branchcode: branchcode || 'ADM',
      country: church.country || '',
      city: church.city || '',
      currency: church.currency || 'USD'
    });
    res.status(201).json({ message: 'Church Admin created', admin });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** PATCH /api/superadmin/churches/:id/admins/:branchId — promote/revoke isadmin */
router.patch('/churches/:id/admins/:branchId', async (req, res) => {
  try {
    const isAdmin = req.body.isAdmin !== false && req.body.isadmin !== 0;
    const admin = await setBranchAdminFlag(req.params.id, req.params.branchId, !!isAdmin);
    res.json({ message: isAdmin ? 'Promoted to Church Admin' : 'Admin access revoked', admin });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** PATCH /api/superadmin/churches/:id — update profile fields */
router.patch('/churches/:id', async (req, res) => {
  try {
    const church = await db.getAsync('SELECT * FROM churches WHERE id = ?', [req.params.id]);
    if (!church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    const fields = {
      name: req.body.name,
      short_name: req.body.shortName ?? req.body.short_name,
      email: req.body.email,
      phone: req.body.phone,
      country: req.body.country,
      city: req.body.city,
      address: req.body.address,
      website_url: req.body.websiteUrl ?? req.body.website_url,
      currency: req.body.currency,
      timezone: req.body.timezone,
      primary_color: req.body.primaryColor ?? req.body.primary_color,
      secondary_color: req.body.secondaryColor ?? req.body.secondary_color
    };

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
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(req.params.id);
    await db.runAsync(`UPDATE churches SET ${sets.join(', ')} WHERE id = ?`, params);

    const updated = await db.getAsync('SELECT * FROM churches WHERE id = ?', [req.params.id]);
    res.json({ message: 'Church updated', church: updated, summary: churchSummary(updated) });
  } catch (error) {
    console.error('[superadmin patch church]', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/superadmin/churches/:id/settings */
router.get('/churches/:id/settings', async (req, res) => {
  try {
    const {
      getChurchSettingsBundle
    } = require('../utils/churchSettings');
    const bundle = await getChurchSettingsBundle(Number(req.params.id));
    if (!bundle) return res.status(404).json({ error: 'Church not found' });
    res.json(bundle);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/superadmin/churches/:id/settings — lock fields / override settings */
router.patch('/churches/:id/settings', async (req, res) => {
  try {
    const {
      updateChurchSettings
    } = require('../utils/churchSettings');
    const churchId = Number(req.params.id);
    const church = await db.getAsync('SELECT id FROM churches WHERE id = ?', [churchId]);
    if (!church) return res.status(404).json({ error: 'Church not found' });
    const bundle = await updateChurchSettings(churchId, req.body || {}, { isSuperadmin: true });
    res.json({ message: 'Church settings updated', ...bundle });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** PATCH /api/superadmin/churches/:id/status */
router.patch('/churches/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['active', 'suspended', 'archived'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
    }

    const church = await db.getAsync('SELECT * FROM churches WHERE id = ?', [req.params.id]);
    if (!church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    await db.runAsync(
      `UPDATE churches SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, req.params.id]
    );

    const updated = await db.getAsync('SELECT * FROM churches WHERE id = ?', [req.params.id]);
    res.json({
      message: `Church marked as ${status}`,
      church: updated,
      summary: churchSummary(updated)
    });
  } catch (error) {
    console.error('[superadmin status]', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/superadmin/stats — platform overview */
router.get('/stats', async (req, res) => {
  try {
    const totals = await db.getAsync(`
      SELECT
        (SELECT COUNT(*) FROM churches) AS churches,
        (SELECT COUNT(*) FROM churches WHERE status = 'active') AS activeChurches,
        (SELECT COUNT(*) FROM churches WHERE status = 'suspended') AS suspendedChurches,
        (SELECT COUNT(*) FROM churches WHERE status = 'archived') AS archivedChurches,
        (SELECT COUNT(*) FROM branches) AS branches,
        (SELECT COUNT(*) FROM members) AS members,
        (SELECT COUNT(*) FROM church_subscriptions WHERE status = 'trial') AS trialSubs,
        (SELECT COUNT(*) FROM church_subscriptions WHERE status = 'active') AS activeSubs,
        (SELECT COUNT(*) FROM church_subscriptions WHERE status IN ('past_due','grace_period')) AS atRiskSubs,
        (SELECT COUNT(*) FROM church_subscriptions WHERE status = 'suspended') AS suspendedSubs
    `);
    res.json({ stats: totals });
  } catch (error) {
    console.error('[superadmin/stats]', error);
    res.status(500).json({ error: error.message });
  }
});

/** ——— Subscription plans ——— */
router.get('/plans', async (req, res) => {
  try {
    const plans = await listPlans({ activeOnly: req.query.activeOnly === '1' });
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/plans', async (req, res) => {
  try {
    const {
      code,
      name,
      description,
      priceMonthly,
      maxMembers,
      maxUsers,
      maxBranches,
      storageMb,
      featureFinance,
      featureReporting,
      featureCommunications,
      featureAdvanced,
      trialDays,
      sortOrder
    } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code and name required' });

    const result = await db.runAsync(
      `INSERT INTO subscription_plans (
        code, name, description, price_monthly, currency,
        max_members, max_users, max_branches, storage_mb,
        feature_finance, feature_reporting, feature_communications, feature_advanced,
        trial_days, is_active, sort_order
      ) VALUES (?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        String(code).toLowerCase(),
        name,
        description || null,
        Number(priceMonthly) || 0,
        maxMembers ?? null,
        maxUsers ?? null,
        maxBranches ?? null,
        storageMb ?? null,
        featureFinance === false || featureFinance === 0 ? 0 : 1,
        featureReporting === false || featureReporting === 0 ? 0 : 1,
        featureCommunications === false || featureCommunications === 0 ? 0 : 1,
        featureAdvanced ? 1 : 0,
        Number(trialDays) || 0,
        Number(sortOrder) || 99
      ]
    );
    await audit(req, {
      action: 'create',
      resource: 'subscription_plan',
      resourceId: result.lastID,
      summary: `Plan created: ${code}`,
      churchId: null
    });
    res.status(201).json({ message: 'Plan created', plan: await getPlan(result.lastID) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/plans/:id', async (req, res) => {
  try {
    const plan = await getPlan(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const map = {
      name: req.body.name,
      description: req.body.description,
      price_monthly: req.body.priceMonthly,
      max_members: req.body.maxMembers,
      max_users: req.body.maxUsers,
      max_branches: req.body.maxBranches,
      storage_mb: req.body.storageMb,
      feature_finance: req.body.featureFinance,
      feature_reporting: req.body.featureReporting,
      feature_communications: req.body.featureCommunications,
      feature_advanced: req.body.featureAdvanced,
      trial_days: req.body.trialDays,
      is_active: req.body.isActive,
      sort_order: req.body.sortOrder
    };

    const sets = [];
    const params = [];
    for (const [col, val] of Object.entries(map)) {
      if (val === undefined) continue;
      let v = val;
      if (col.startsWith('feature_') || col === 'is_active') {
        v = val === false || val === 0 || val === '0' ? 0 : 1;
      }
      sets.push(`${col} = ?`);
      params.push(v);
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(plan.id);
    await db.runAsync(`UPDATE subscription_plans SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Plan updated', plan: await getPlan(plan.id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Assign / change church subscription plan */
router.put('/churches/:id/subscription', async (req, res) => {
  try {
    const church = await db.getAsync('SELECT id, name FROM churches WHERE id = ?', [req.params.id]);
    if (!church) return res.status(404).json({ error: 'Church not found' });

    const { planId, planCode, status, notes } = req.body;
    const plan = await getPlan(planId || planCode);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const subscription = await assignSubscription(church.id, {
      planId: plan.id,
      status: status || (plan.code === 'trial' ? 'trial' : 'active'),
      notes
    });

    await audit(req, {
      action: 'update',
      resource: 'church_subscription',
      resourceId: church.id,
      churchId: church.id,
      summary: `Subscription set to ${plan.code} (${subscription.status})`,
      newValues: { planId: plan.id, status: subscription.status }
    });

    res.json({
      message: 'Subscription updated (church data preserved)',
      subscription,
      limits: await checkLimits(church.id)
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** Change subscription status only (never deletes church data) */
router.patch('/churches/:id/subscription/status', async (req, res) => {
  try {
    const { status, notes, graceDays } = req.body;
    if (!SUB_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `status must be one of: ${SUB_STATUSES.join(', ')}`
      });
    }
    const subscription = await updateSubscriptionStatus(req.params.id, status, {
      notes,
      graceDays
    });
    await audit(req, {
      action: status === 'suspended' ? 'suspend' : 'update',
      resource: 'church_subscription',
      resourceId: req.params.id,
      churchId: Number(req.params.id),
      summary: `Subscription status → ${status}`,
      newValues: { status, notes }
    });
    res.json({
      message: `Subscription marked ${status}. Church data was not deleted.`,
      subscription,
      limits: await checkLimits(req.params.id)
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/churches/:id/subscription', async (req, res) => {
  try {
    const subscription = await getChurchSubscription(req.params.id);
    if (!subscription) return res.status(404).json({ error: 'No subscription' });
    res.json({ subscription, limits: await checkLimits(req.params.id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** ——— Support access (Phase 27) ——— */
router.get('/support-access/active', async (req, res) => {
  try {
    const session = await getActiveSession(req.user.id);
    res.json({ session: session || null, supportMode: !!req.user.supportMode });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/churches/:id/support-access', async (req, res) => {
  try {
    const result = await startSupportSession({
      superadmin: req.user,
      churchId: Number(req.params.id),
      reason: req.body.reason,
      req
    });

    await audit(req, {
      action: 'support_access_start',
      resource: 'support_session',
      resourceId: result.session.id,
      churchId: Number(req.params.id),
      supportSessionId: result.session.id,
      summary: `Support access started: ${result.session.reason}`,
      newValues: {
        churchId: Number(req.params.id),
        reason: result.session.reason,
        actorId: req.user.id,
        actorEmail: req.user.email
      }
    });

    res.status(201).json({
      message: 'Support access started',
      banner: result.banner,
      token: result.token,
      user: result.user,
      session: result.session,
      church: result.church
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/support-access/end', async (req, res) => {
  try {
    const activeId = req.user.supportSessionId;
    const result = await endSupportSession({ superadmin: req.user, req });

    await audit(req, {
      action: 'support_access_end',
      resource: 'support_session',
      resourceId: result.session.id,
      churchId: result.session.church_id,
      supportSessionId: result.session.id,
      summary: 'Support access ended',
      previousValues: { started_at: result.session.started_at, reason: result.session.reason }
    });

    let actions = [];
    try {
      actions = await listSessionActions(result.session.id, result.session.church_id);
    } catch (_) { /* ignore */ }

    res.json({
      message: 'Support access ended',
      token: result.token,
      user: result.user,
      session: result.session,
      actions,
      priorSessionId: activeId
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/support-access/sessions/:id', async (req, res) => {
  try {
    const session = await getSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const actions = await listSessionActions(session.id, session.church_id);
    res.json({ session, actions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const {
  createFullBackup,
  createChurchBackup,
  listBackupJobs,
  getBackupJob,
  verifyBackup,
  recoveryRunbook,
  configSnapshot,
  RETENTION_DAYS,
  MAX_BACKUPS
} = require('../utils/backup');
const {
  buildSecurityChecklist,
  assessJwtSecret,
  scanForHardcodedSecrets
} = require('../utils/securityHardening');
const path = require('path');

/** GET /api/superadmin/security/status — Phase 35 checklist */
router.get('/security/status', async (req, res) => {
  try {
    const root = path.join(__dirname, '../..');
    const findings = scanForHardcodedSecrets([
      path.join(root, 'frontend/src'),
      path.join(root, 'backend/routes'),
      path.join(root, 'backend/utils')
    ]);
    const checklist = buildSecurityChecklist({
      dependencyScan: 'Run: cd backend && npm run security:audit',
      hardcodedSecretFindings: findings.length,
      findings: findings.slice(0, 20)
    });
    res.json({
      checklist,
      jwt: assessJwtSecret(),
      ok: findings.length === 0 && assessJwtSecret().severity !== 'critical'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/superadmin/backups/policy */
router.get('/backups/policy', async (req, res) => {
  res.json({
    retentionDays: RETENTION_DAYS,
    maxCount: MAX_BACKUPS,
    configSnapshot: configSnapshot(),
    runbook: recoveryRunbook()
  });
});

/** GET /api/superadmin/backups */
router.get('/backups', async (req, res) => {
  try {
    const backups = await listBackupJobs({
      limit: req.query.limit,
      kind: req.query.kind || null,
      churchId: req.query.churchId || null
    });
    res.json({ backups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/superadmin/backups — create full or church backup */
router.post('/backups', async (req, res) => {
  try {
    const kind = req.body.kind || 'full';
    let job;
    if (kind === 'church') {
      if (!req.body.churchId) {
        return res.status(400).json({ error: 'churchId required for church backup' });
      }
      job = await createChurchBackup(req.body.churchId, { createdBy: req.user.id });
    } else if (kind === 'full') {
      job = await createFullBackup({ createdBy: req.user.id });
    } else {
      return res.status(400).json({ error: 'kind must be full or church' });
    }
    await audit(req, {
      action: 'backup_create',
      resource: 'backup',
      resourceId: job.id,
      summary: `Backup created (${job.kind})`
    });
    res.status(201).json({ message: 'Backup completed', backup: job });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** GET /api/superadmin/backups/:id */
router.get('/backups/:id', async (req, res) => {
  try {
    const backup = await getBackupJob(req.params.id);
    if (!backup) return res.status(404).json({ error: 'Backup not found' });
    let manifest = null;
    try {
      manifest = backup.manifest_json ? JSON.parse(backup.manifest_json) : null;
    } catch (_) { /* ignore */ }
    res.json({ backup, manifest, runbook: recoveryRunbook() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/superadmin/backups/:id/verify — restore test (non-destructive) */
router.post('/backups/:id/verify', async (req, res) => {
  try {
    const result = await verifyBackup(req.params.id);
    await audit(req, {
      action: 'backup_verify',
      resource: 'backup',
      resourceId: req.params.id,
      summary: 'Backup integrity verified'
    });
    res.json({ message: 'Backup verified', ...result });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details
    });
  }
});

/** Phase 40 — church custom domains (platform admin) */
router.get('/churches/:id/domains', async (req, res) => {
  try {
    const church = await getChurchById(req.params.id);
    if (!church) return res.status(404).json({ error: 'Church not found' });
    const rows = await listDomainsForChurch(church.id);
    res.json({
      church: churchSummary(church),
      domains: rows.map(serializeDomain),
      platformDomain: getPlatformDomain() || null,
      subdomainUrl: getPlatformDomain() ? `${church.slug}.${getPlatformDomain()}` : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/churches/:id/domains', async (req, res) => {
  try {
    const church = await getChurchById(req.params.id);
    if (!church) return res.status(404).json({ error: 'Church not found' });
    const row = await addChurchDomain(church.id, req.body.domain, {
      isPrimary: !!req.body.isPrimary,
      notes: req.body.notes || 'added_by_superadmin'
    });
    if (req.body.verified) {
      await markDomainVerified(row.id, { method: 'superadmin' });
    }
    const fresh = await listDomainsForChurch(church.id);
    const created = fresh.find(d => d.id === row.id) || row;
    res.status(201).json({ domain: serializeDomain(created) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

router.post('/churches/:id/domains/:domainId/verify', async (req, res) => {
  try {
    const rows = await listDomainsForChurch(req.params.id);
    const row = rows.find(d => String(d.id) === String(req.params.domainId));
    if (!row) return res.status(404).json({ error: 'Domain not found' });
    const updated = await markDomainVerified(row.id, {
      sslStatus: req.body.sslStatus || 'active',
      method: 'superadmin'
    });
    res.json({ domain: serializeDomain(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/churches/:id/domains/:domainId/primary', async (req, res) => {
  try {
    const updated = await setPrimaryDomain(req.params.id, req.params.domainId);
    res.json({ domain: serializeDomain(updated) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

router.delete('/churches/:id/domains/:domainId', async (req, res) => {
  try {
    const okDel = await deleteChurchDomain(req.params.id, req.params.domainId);
    if (!okDel) return res.status(404).json({ error: 'Domain not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const currencies = require('../utils/currencies');

/** GET /api/superadmin/currencies — global catalog */
router.get('/currencies', async (req, res) => {
  try {
    const list = await currencies.listCatalog({ includeInactive: true });
    res.json({ currencies: list, system: currencies.SYSTEM_CODES });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/superadmin/currencies — add currency to platform catalog */
router.post('/currencies', async (req, res) => {
  try {
    const { code, name, symbol, decimalPlaces } = req.body || {};
    const row = await currencies.upsertCatalogCurrency({ code, name, symbol, decimalPlaces });
    res.status(201).json({ currency: row });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** PATCH /api/superadmin/currencies/:code */
router.patch('/currencies/:code', async (req, res) => {
  try {
    const row = await currencies.upsertCatalogCurrency({
      code: req.params.code,
      name: req.body?.name,
      symbol: req.body?.symbol,
      decimalPlaces: req.body?.decimalPlaces,
      isActive: req.body?.isActive
    });
    res.json({ currency: row });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** DELETE /api/superadmin/currencies/:code — deactivate (not USD/LRD) */
router.delete('/currencies/:code', async (req, res) => {
  try {
    const row = await currencies.deactivateCatalogCurrency(req.params.code);
    res.json({ currency: row });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
