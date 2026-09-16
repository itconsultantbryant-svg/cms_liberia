/**
 * Phase 36: Apply performance indexes + SQLite pragmas.
 */
const db = require('../database');

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_members_church_id ON members(church_id)',
  'CREATE INDEX IF NOT EXISTS idx_members_church_branch ON members(church_id, branch_id)',
  'CREATE INDEX IF NOT EXISTS idx_members_church_status ON members(church_id, membership_status)',
  'CREATE INDEX IF NOT EXISTS idx_members_email ON members(email)',
  'CREATE INDEX IF NOT EXISTS idx_branches_church_id ON branches(church_id)',
  'CREATE INDEX IF NOT EXISTS idx_branches_church_status ON branches(church_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_events_church_date ON events(church_id, date)',
  'CREATE INDEX IF NOT EXISTS idx_attendance_member_date ON member_attendances(member_id, date)',
  'CREATE INDEX IF NOT EXISTS idx_collections_church_date ON collections(church_id, date)',
  'CREATE INDEX IF NOT EXISTS idx_member_collections_date ON member_collections(date_collected)',
  'CREATE INDEX IF NOT EXISTS idx_finance_txn_church_date ON finance_transactions(church_id, txn_date)',
  'CREATE INDEX IF NOT EXISTS idx_finance_txn_church_status ON finance_transactions(church_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)',
  'CREATE INDEX IF NOT EXISTS idx_audit_church_created ON audit_logs(church_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_requests_church_status ON requests(church_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_pledges_church ON pledges(church_id)',
  'CREATE INDEX IF NOT EXISTS idx_visitors_church ON visitors(church_id)',
  'CREATE INDEX IF NOT EXISTS idx_households_church ON households(church_id)',
  'CREATE INDEX IF NOT EXISTS idx_groups_church ON groups(church_id)',
  'CREATE INDEX IF NOT EXISTS idx_sub_users_church ON sub_users(church_id)'
];

async function apply() {
  // WAL + reasonable sync for better concurrent read performance
  await db.runAsync('PRAGMA journal_mode = WAL');
  await db.runAsync('PRAGMA synchronous = NORMAL');
  await db.runAsync('PRAGMA temp_store = MEMORY');
  await db.runAsync('PRAGMA cache_size = -8000'); // ~8MB

  let created = 0;
  for (const sql of INDEXES) {
    try {
      await db.runAsync(sql);
      created += 1;
    } catch (err) {
      // Table may not exist in sparse DBs
      if (!/no such table/i.test(err.message)) {
        console.warn('[perf index]', err.message, sql);
      }
    }
  }
  console.log(`Performance indexes ensure complete (${created} statements ok).`);
}

if (require.main === module) {
  apply()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { apply, INDEXES };
