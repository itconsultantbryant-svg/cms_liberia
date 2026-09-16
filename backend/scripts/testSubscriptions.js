/**
 * Phase 26 subscriptions & SaaS tests.
 */
const http = require('http');
const db = require('../database');

const PORT = process.env.PORT || 5000;

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api${path}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
        }
      },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => {
          let parsed = raw;
          try {
            parsed = JSON.parse(raw);
          } catch (_) { /* keep */ }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

async function run() {
  console.log('Phase 26 subscriptions test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  // Login as platform superadmin
  const login = await request('POST', '/auth/login', {
    email: 'platform@cms.local',
    password: 'SuperAdmin1!'
  });
  assert(login.status === 200 && login.body.user?.isSuperadmin, 'Superadmin login');
  const token = login.body.token;

  const plans = await request('GET', '/superadmin/plans', null, token);
  assert(plans.status === 200 && (plans.body.plans || []).length >= 5, 'List seed plans');
  assert(plans.body.plans.some(p => p.code === 'enterprise'), 'Enterprise plan exists');

  const stamp = Date.now();
  const create = await request(
    'POST',
    '/superadmin/churches',
    {
      name: `Sub Church ${stamp}`,
      slug: `sub-${stamp}`,
      adminEmail: `subadmin-${stamp}@test.local`,
      adminPassword: 'SecurePass1',
      adminName: 'Sub Admin'
    },
    token
  );
  assert(create.status === 201 && create.body.id, 'Create church with admin');
  const churchId = create.body.id;
  assert(create.body.subscription?.status === 'trial' || create.body.subscription?.plan_code === 'trial', 'New church on trial');

  const basic = plans.body.plans.find(p => p.code === 'basic');
  const assign = await request(
    'PUT',
    `/superadmin/churches/${churchId}/subscription`,
    { planId: basic.id, status: 'active' },
    token
  );
  assert(assign.status === 200 && assign.body.subscription?.plan_code === 'basic', 'Assign Basic plan');

  const detail = await request('GET', `/superadmin/churches/${churchId}`, null, token);
  assert(detail.body.subscription?.status === 'active', 'Detail shows active sub');
  assert(detail.body.limits?.limits?.max_members === 250, 'Basic member limit 250');

  // Suspend subscription — church data must remain
  const suspend = await request(
    'PATCH',
    `/superadmin/churches/${churchId}/subscription/status`,
    { status: 'suspended' },
    token
  );
  assert(suspend.status === 200, 'Suspend subscription');
  const still = await db.getAsync('SELECT id, name FROM churches WHERE id = ?', [churchId]);
  assert(!!still, 'Church data still exists after suspend');
  const membersBefore = await db.getAsync(
    'SELECT COUNT(*) as c FROM members WHERE church_id = ?',
    [churchId]
  );

  const cancel = await request(
    'PATCH',
    `/superadmin/churches/${churchId}/subscription/status`,
    { status: 'cancelled' },
    token
  );
  assert(cancel.status === 200, 'Cancel subscription');
  const still2 = await db.getAsync('SELECT id FROM churches WHERE id = ?', [churchId]);
  assert(!!still2, 'Church data still exists after cancel');
  const membersAfter = await db.getAsync(
    'SELECT COUNT(*) as c FROM members WHERE church_id = ?',
    [churchId]
  );
  assert(membersAfter.c === membersBefore.c, 'Member data not deleted on cancel');

  // Limit enforcement: set tiny plan and try create member as church admin
  await request(
    'PUT',
    `/superadmin/churches/${churchId}/subscription`,
    { planCode: 'basic', status: 'active' },
    token
  );
  // Force max_members = 0 via direct update for test
  await db.runAsync('UPDATE subscription_plans SET max_members = 0 WHERE code = ?', ['basic']);
  // Re-assign to refresh denorm
  await request(
    'PUT',
    `/superadmin/churches/${churchId}/subscription`,
    { planCode: 'basic', status: 'active' },
    token
  );

  const adminLogin = await request('POST', '/auth/login', {
    email: `subadmin-${stamp}@test.local`,
    password: 'SecurePass1'
  });
  assert(adminLogin.status === 200, 'Church admin login');
  const adminToken = adminLogin.body.token;

  const blocked = await request(
    'POST',
    '/members',
    {
      firstname: 'Over',
      lastname: 'Limit',
      email: `over-${stamp}@test.local`,
      sex: 'male'
    },
    adminToken
  );
  assert(blocked.status === 403, 'Member create blocked at plan limit');

  // Restore basic limits for cleanliness
  await db.runAsync('UPDATE subscription_plans SET max_members = 250 WHERE code = ?', ['basic']);

  const tenantSub = await request('GET', '/church/subscription', null, adminToken);
  assert(tenantSub.status === 200 && tenantSub.body.subscription, 'Tenant can view own subscription');

  console.log('\nAll Phase 26 subscription checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
