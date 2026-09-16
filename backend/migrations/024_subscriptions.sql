-- Phase 26: Subscriptions & SaaS management
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  max_members INTEGER,          -- NULL = unlimited
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
);

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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (church_id) REFERENCES churches(id),
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_church_subscriptions_status ON church_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active);

-- Soft limits metadata on churches (optional denormalized status for quick checks)
-- Applied via applySubscriptions.js ALTER if missing
