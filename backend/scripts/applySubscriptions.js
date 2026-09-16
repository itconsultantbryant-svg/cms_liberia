/**
 * Phase 26: Subscription plans + church subscriptions ensure + seed defaults.
 */
const db = require('../database');

const DEFAULT_PLANS = [
  {
    code: 'trial',
    name: 'Trial',
    description: 'Time-limited evaluation plan',
    price_monthly: 0,
    max_members: 100,
    max_users: 5,
    max_branches: 2,
    storage_mb: 500,
    feature_finance: 1,
    feature_reporting: 1,
    feature_communications: 1,
    feature_advanced: 0,
    trial_days: 14,
    sort_order: 1
  },
  {
    code: 'basic',
    name: 'Basic',
    description: 'Small congregations',
    price_monthly: 29,
    max_members: 250,
    max_users: 10,
    max_branches: 3,
    storage_mb: 2048,
    feature_finance: 1,
    feature_reporting: 1,
    feature_communications: 0,
    feature_advanced: 0,
    trial_days: 0,
    sort_order: 2
  },
  {
    code: 'standard',
    name: 'Standard',
    description: 'Growing multi-branch churches',
    price_monthly: 79,
    max_members: 1000,
    max_users: 25,
    max_branches: 10,
    storage_mb: 10240,
    feature_finance: 1,
    feature_reporting: 1,
    feature_communications: 1,
    feature_advanced: 0,
    trial_days: 0,
    sort_order: 3
  },
  {
    code: 'professional',
    name: 'Professional',
    description: 'Full operations with advanced modules',
    price_monthly: 149,
    max_members: 5000,
    max_users: 100,
    max_branches: 50,
    storage_mb: 51200,
    feature_finance: 1,
    feature_reporting: 1,
    feature_communications: 1,
    feature_advanced: 1,
    trial_days: 0,
    sort_order: 4
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited scale for large networks',
    price_monthly: 399,
    max_members: null,
    max_users: null,
    max_branches: null,
    storage_mb: null,
    feature_finance: 1,
    feature_reporting: 1,
    feature_communications: 1,
    feature_advanced: 1,
    trial_days: 0,
    sort_order: 5
  }
];

async function columnExists(table, column) {
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price_monthly REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      max_members INTEGER,
      max_users INTEGER,
      max_branches INTEGER,
      storage_mb INTEGER,
      feature_finance INTEGER DEFAULT 1,
      feature_reporting INTEGER DEFAULT 1,
      feature_communications INTEGER DEFAULT 1,
      feature_advanced INTEGER DEFAULT 0,
      trial_days INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS church_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL UNIQUE,
      plan_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'trial'
        CHECK(status IN ('trial', 'active', 'grace_period', 'past_due', 'suspended', 'cancelled')),
      started_at TEXT,
      trial_ends_at TEXT,
      current_period_start TEXT,
      current_period_end TEXT,
      grace_ends_at TEXT,
      cancelled_at TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_church_subscriptions_status ON church_subscriptions(status)'
  );
  await db.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active)'
  );

  if (!(await columnExists('churches', 'subscription_status'))) {
    await db.runAsync(
      `ALTER TABLE churches ADD COLUMN subscription_status TEXT DEFAULT 'trial'`
    );
  }
  if (!(await columnExists('churches', 'subscription_plan_id'))) {
    await db.runAsync(`ALTER TABLE churches ADD COLUMN subscription_plan_id INTEGER`);
  }

  for (const p of DEFAULT_PLANS) {
    const existing = await db.getAsync(
      'SELECT id FROM subscription_plans WHERE code = ?',
      [p.code]
    );
    if (existing) continue;
    await db.runAsync(
      `INSERT INTO subscription_plans (
        code, name, description, price_monthly, currency,
        max_members, max_users, max_branches, storage_mb,
        feature_finance, feature_reporting, feature_communications, feature_advanced,
        trial_days, is_active, sort_order
      ) VALUES (?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        p.code,
        p.name,
        p.description,
        p.price_monthly,
        p.max_members,
        p.max_users,
        p.max_branches,
        p.storage_mb,
        p.feature_finance,
        p.feature_reporting,
        p.feature_communications,
        p.feature_advanced,
        p.trial_days,
        p.sort_order
      ]
    );
  }

  const trial = await db.getAsync(
    `SELECT id, trial_days FROM subscription_plans WHERE code = 'trial'`
  );
  if (trial) {
    const churches = await db.allAsync(
      `SELECT c.id FROM churches c
       LEFT JOIN church_subscriptions cs ON cs.church_id = c.id
       WHERE cs.id IS NULL`
    );
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + (trial.trial_days || 14));
    for (const c of churches) {
      // eslint-disable-next-line no-await-in-loop
      await db.runAsync(
        `INSERT INTO church_subscriptions (
          church_id, plan_id, status, started_at, trial_ends_at,
          current_period_start, current_period_end
        ) VALUES (?, ?, 'trial', ?, ?, ?, ?)`,
        [
          c.id,
          trial.id,
          now.toISOString(),
          trialEnd.toISOString(),
          now.toISOString(),
          trialEnd.toISOString()
        ]
      );
      // eslint-disable-next-line no-await-in-loop
      await db.runAsync(
        `UPDATE churches SET subscription_status = 'trial', subscription_plan_id = ? WHERE id = ?`,
        [trial.id, c.id]
      );
    }
  }

  console.log('Subscriptions schema ensure complete.');
}

if (require.main === module) {
  apply()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { apply, DEFAULT_PLANS };
