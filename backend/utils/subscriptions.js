/**
 * Phase 26 subscription helpers — plans, limits, status (never deletes church data).
 */
const db = require('../database');

const SUB_STATUSES = ['trial', 'active', 'grace_period', 'past_due', 'suspended', 'cancelled'];

async function listPlans({ activeOnly = false } = {}) {
  let sql = 'SELECT * FROM subscription_plans';
  if (activeOnly) sql += ' WHERE is_active = 1';
  sql += ' ORDER BY sort_order, id';
  return db.allAsync(sql);
}

async function getPlan(idOrCode) {
  if (idOrCode == null) return null;
  if (Number.isFinite(Number(idOrCode)) && String(idOrCode).match(/^\d+$/)) {
    return db.getAsync('SELECT * FROM subscription_plans WHERE id = ?', [idOrCode]);
  }
  return db.getAsync('SELECT * FROM subscription_plans WHERE code = ?', [idOrCode]);
}

async function getChurchSubscription(churchId) {
  return db.getAsync(
    `SELECT cs.*, p.code as plan_code, p.name as plan_name, p.price_monthly,
            p.max_members, p.max_users, p.max_branches, p.storage_mb,
            p.feature_finance, p.feature_reporting, p.feature_communications, p.feature_advanced,
            p.trial_days, p.currency as plan_currency
     FROM church_subscriptions cs
     JOIN subscription_plans p ON p.id = cs.plan_id
     WHERE cs.church_id = ?`,
    [churchId]
  );
}

async function syncChurchDenorm(churchId, planId, status) {
  await db.runAsync(
    `UPDATE churches SET subscription_status = ?, subscription_plan_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, planId, churchId]
  );
}

async function assignSubscription(churchId, { planId, status, notes, trialDays } = {}) {
  const plan = await getPlan(planId);
  if (!plan) {
    throw Object.assign(new Error('Plan not found'), { status: 404 });
  }
  const nextStatus = SUB_STATUSES.includes(status) ? status : plan.code === 'trial' ? 'trial' : 'active';
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  let trialEnds = null;
  if (nextStatus === 'trial') {
    trialEnds = new Date(now);
    trialEnds.setDate(trialEnds.getDate() + (trialDays ?? plan.trial_days ?? 14));
  }

  const existing = await db.getAsync(
    'SELECT id FROM church_subscriptions WHERE church_id = ?',
    [churchId]
  );

  if (existing) {
    await db.runAsync(
      `UPDATE church_subscriptions SET
        plan_id = ?, status = ?, notes = COALESCE(?, notes),
        trial_ends_at = ?, current_period_start = ?, current_period_end = ?,
        cancelled_at = CASE WHEN ? = 'cancelled' THEN ? ELSE cancelled_at END,
        updated_at = CURRENT_TIMESTAMP
       WHERE church_id = ?`,
      [
        plan.id,
        nextStatus,
        notes ?? null,
        trialEnds ? trialEnds.toISOString() : null,
        now.toISOString(),
        (trialEnds || periodEnd).toISOString(),
        nextStatus,
        now.toISOString(),
        churchId
      ]
    );
  } else {
    await db.runAsync(
      `INSERT INTO church_subscriptions (
        church_id, plan_id, status, started_at, trial_ends_at,
        current_period_start, current_period_end, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        churchId,
        plan.id,
        nextStatus,
        now.toISOString(),
        trialEnds ? trialEnds.toISOString() : null,
        now.toISOString(),
        (trialEnds || periodEnd).toISOString(),
        notes || null
      ]
    );
  }

  await syncChurchDenorm(churchId, plan.id, nextStatus);

  // Restoring a paid/trial plan re-opens the tenant without deleting any data
  if (['active', 'trial', 'grace_period'].includes(nextStatus)) {
    await db.runAsync(
      `UPDATE churches SET status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'suspended'`,
      [churchId]
    );
  }

  return getChurchSubscription(churchId);
}

async function updateSubscriptionStatus(churchId, status, { notes, graceDays = 7 } = {}) {
  if (!SUB_STATUSES.includes(status)) {
    throw Object.assign(new Error(`Invalid status: ${status}`), { status: 400 });
  }
  const sub = await getChurchSubscription(churchId);
  if (!sub) {
    throw Object.assign(new Error('Church has no subscription'), { status: 404 });
  }

  const now = new Date();
  let graceEnds = null;
  if (status === 'grace_period') {
    graceEnds = new Date(now);
    graceEnds.setDate(graceEnds.getDate() + graceDays);
  }

  await db.runAsync(
    `UPDATE church_subscriptions SET
      status = ?,
      notes = COALESCE(?, notes),
      grace_ends_at = ?,
      cancelled_at = CASE WHEN ? = 'cancelled' THEN ? ELSE cancelled_at END,
      updated_at = CURRENT_TIMESTAMP
     WHERE church_id = ?`,
    [
      status,
      notes ?? null,
      graceEnds ? graceEnds.toISOString() : null,
      status,
      now.toISOString(),
      churchId
    ]
  );

  // Suspended/cancelled: mark church operational status carefully — do NOT delete data.
  // Only mirror subscription_status denorm; church.status stays unless explicitly suspended.
  await syncChurchDenorm(churchId, sub.plan_id, status);

  if (status === 'suspended') {
    // Soft-block tenant login via church.status without deleting data
    await db.runAsync(
      `UPDATE churches SET status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`,
      [churchId]
    );
  } else if (status === 'active' || status === 'trial' || status === 'grace_period') {
    await db.runAsync(
      `UPDATE churches SET status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'suspended'`,
      [churchId]
    );
  }

  return getChurchSubscription(churchId);
}

async function usageForChurch(churchId) {
  const members = await db.getAsync(
    'SELECT COUNT(*) as c FROM members WHERE church_id = ?',
    [churchId]
  );
  const branches = await db.getAsync(
    'SELECT COUNT(*) as c FROM branches WHERE church_id = ?',
    [churchId]
  );
  const branchUsers = await db.getAsync(
    `SELECT COUNT(*) as c FROM branches WHERE church_id = ? AND is_login_enabled = 1`,
    [churchId]
  );
  const subUsers = await db.getAsync(
    'SELECT COUNT(*) as c FROM sub_users WHERE church_id = ?',
    [churchId]
  );
  return {
    members: members?.c || 0,
    branches: branches?.c || 0,
    users: (branchUsers?.c || 0) + (subUsers?.c || 0)
  };
}

function withinLimit(used, max) {
  if (max == null) return true;
  return Number(used) <= Number(max);
}

async function checkLimits(churchId) {
  const sub = await getChurchSubscription(churchId);
  const usage = await usageForChurch(churchId);
  if (!sub) {
    return { ok: true, usage, limits: null, subscription: null, violations: [] };
  }
  const violations = [];
  if (!withinLimit(usage.members, sub.max_members)) {
    violations.push({ resource: 'members', used: usage.members, max: sub.max_members });
  }
  if (!withinLimit(usage.users, sub.max_users)) {
    violations.push({ resource: 'users', used: usage.users, max: sub.max_users });
  }
  if (!withinLimit(usage.branches, sub.max_branches)) {
    violations.push({ resource: 'branches', used: usage.branches, max: sub.max_branches });
  }
  return {
    ok: violations.length === 0,
    usage,
    limits: {
      max_members: sub.max_members,
      max_users: sub.max_users,
      max_branches: sub.max_branches,
      storage_mb: sub.storage_mb
    },
    features: {
      finance: !!sub.feature_finance,
      reporting: !!sub.feature_reporting,
      communications: !!sub.feature_communications,
      advanced: !!sub.feature_advanced
    },
    subscription: sub,
    violations
  };
}

/**
 * Enforce create limits — returns error message or null if allowed.
 * Does not delete data when over limit; blocks new creates.
 */
async function assertCanCreate(churchId, resource) {
  const check = await checkLimits(churchId);
  const sub = check.subscription;
  if (sub && ['suspended', 'cancelled'].includes(sub.status)) {
    return `Church subscription is ${sub.status}. Contact support to restore access.`;
  }
  if (sub && sub.status === 'past_due') {
    // Allow reads; still allow creates during past_due (soft) — optional block
  }
  if (!check.limits) return null;

  const map = {
    member: { used: check.usage.members, max: check.limits.max_members, label: 'members' },
    user: { used: check.usage.users, max: check.limits.max_users, label: 'users' },
    branch: { used: check.usage.branches, max: check.limits.max_branches, label: 'branches' }
  };
  const row = map[resource];
  if (!row) return null;
  if (row.max == null) return null;
  if (row.used >= row.max) {
    return `Plan limit reached for ${row.label} (${row.used}/${row.max}). Upgrade the subscription to add more.`;
  }
  return null;
}

module.exports = {
  SUB_STATUSES,
  listPlans,
  getPlan,
  getChurchSubscription,
  assignSubscription,
  updateSubscriptionStatus,
  usageForChurch,
  checkLimits,
  assertCanCreate
};
