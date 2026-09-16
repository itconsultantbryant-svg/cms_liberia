/**
 * Phase 38 — verify demo seed data + tenant isolation.
 */
const db = require('../database');
const { CREDS, assertNotProduction } = require('./seedDemoData');
const { spawnSync } = require('child_process');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

async function run() {
  console.log('Phase 38 seed data test\n');

  // Production guard unit check
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_DEMO_SEED;
  delete process.env.FORCE_PRODUCTION_SEED;
  let blocked = false;
  const origExit = process.exit;
  process.exit = (code) => {
    blocked = code === 1;
    throw new Error('__blocked__');
  };
  try {
    assertNotProduction();
  } catch (e) {
    if (e.message !== '__blocked__') throw e;
  }
  process.exit = origExit;
  process.env.NODE_ENV = prev || 'development';
  assert(blocked, 'Seed refuses production without override');

  // Ensure seed applied
  const seed = spawnSync(process.execPath, [path.join(__dirname, 'seedDemoData.js')], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'development' }
  });
  if (seed.status !== 0) {
    console.error(seed.stdout, seed.stderr);
    throw new Error('seedDemoData failed');
  }
  console.log('  OK: seedDemoData executed');

  const grace = await db.getAsync(`SELECT * FROM churches WHERE slug = 'demo-grace'`);
  const hope = await db.getAsync(`SELECT * FROM churches WHERE slug = 'demo-hope'`);
  assert(!!grace && !!hope, 'Demo churches Grace + Hope exist');
  assert(grace.id !== hope.id, 'Distinct church IDs');

  const sa = await db.getAsync(
    'SELECT * FROM branches WHERE email = ? AND is_platform_admin = 1',
    [CREDS.superadmin.email]
  );
  assert(!!sa, 'Superadmin account exists');

  const gAdmin = await db.getAsync('SELECT * FROM branches WHERE email = ?', [CREDS.graceAdmin.email]);
  const hAdmin = await db.getAsync('SELECT * FROM branches WHERE email = ?', [CREDS.hopeAdmin.email]);
  assert(!!gAdmin?.isadmin && Number(gAdmin.church_id) === Number(grace.id), 'Grace admin linked');
  assert(!!hAdmin?.isadmin && Number(hAdmin.church_id) === Number(hope.id), 'Hope admin linked');

  const gBranches = await db.allAsync(
    'SELECT * FROM branches WHERE church_id = ?',
    [grace.id]
  );
  assert(gBranches.length >= 2, `Grace has multiple branches (${gBranches.length})`);

  const gMembers = await db.allAsync('SELECT * FROM members WHERE church_id = ?', [grace.id]);
  const hMembers = await db.allAsync('SELECT * FROM members WHERE church_id = ?', [hope.id]);
  assert(gMembers.length >= 3, `Grace has members (${gMembers.length})`);
  assert(hMembers.length >= 3, `Hope has members (${hMembers.length})`);

  const leak = gMembers.filter(m => String(m.email || '').startsWith('hope.'));
  assert(leak.length === 0, 'Grace members list has no Hope emails');

  const gVisitors = await db.getAsync(
    'SELECT COUNT(*) as c FROM visitors WHERE church_id = ?',
    [grace.id]
  );
  const hVisitors = await db.getAsync(
    'SELECT COUNT(*) as c FROM visitors WHERE church_id = ?',
    [hope.id]
  );
  assert(Number(gVisitors.c) >= 1 && Number(hVisitors.c) >= 1, 'Both churches have visitors');

  const gAtt = await db.getAsync(
    'SELECT COUNT(*) as c FROM attendances WHERE church_id = ? OR branch_id IN (SELECT id FROM branches WHERE church_id = ?)',
    [grace.id, grace.id]
  );
  assert(Number(gAtt.c) >= 1, 'Grace has attendance records');

  const gInc = await db.getAsync(
    `SELECT COUNT(*) as c FROM finance_transactions WHERE church_id = ? AND txn_type = 'income'`,
    [grace.id]
  );
  const gExp = await db.getAsync(
    `SELECT COUNT(*) as c FROM finance_transactions WHERE church_id = ? AND txn_type = 'expense'`,
    [grace.id]
  );
  assert(Number(gInc.c) >= 1 && Number(gExp.c) >= 1, 'Grace has donations + expenses');

  const hInc = await db.getAsync(
    `SELECT COUNT(*) as c FROM finance_transactions WHERE church_id = ? AND txn_type = 'income'`,
    [hope.id]
  );
  assert(Number(hInc.c) >= 1, 'Hope has donations');

  const gGroups = await db.getAsync(
    'SELECT COUNT(*) as c FROM groups WHERE church_id = ?',
    [grace.id]
  );
  const gEvents = await db.getAsync(
    'SELECT COUNT(*) as c FROM events WHERE church_id = ?',
    [grace.id]
  );
  assert(Number(gGroups.c) >= 1, 'Grace has ministries/groups');
  assert(Number(gEvents.c) >= 1, 'Grace has events');

  // Cross-tenant finance isolation
  const crossFin = await db.getAsync(
    `SELECT COUNT(*) as c FROM finance_transactions
     WHERE church_id = ? AND description LIKE '%Hope%'`,
    [grace.id]
  );
  assert(Number(crossFin.c) === 0, 'Grace finance has no Hope-labelled rows');

  console.log('\nPhase 38 seed tests passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
