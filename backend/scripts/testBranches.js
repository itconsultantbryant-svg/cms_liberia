/**
 * Phase 6 branch management tests.
 */
const http = require('http');

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
  console.log('Phase 6 branch management test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `br-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Branch Church ${stamp}`,
    churchSlug: `br-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200, 'Register church');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  assert(login.body.user?.activeBranchId, 'Login includes activeBranchId');
  let token = login.body.token;
  const homeId = login.body.user.activeBranchId;

  const list = await request('GET', '/branches', null, token);
  assert(list.status === 200 && Array.isArray(list.body.branches), 'List branches');
  assert(list.body.branches.some(b => b.is_headquarters), 'HQ branch exists');

  const create = await request(
    'POST',
    '/branches',
    {
      branchname: `Campus North ${stamp}`,
      branchcode: 'N1',
      city: 'Monrovia',
      pastorName: 'Pastor North',
      description: 'North campus'
    },
    token
  );
  assert(create.status === 201, 'Create campus without login');
  const campusId = create.body.branch.id;
  assert(create.body.branch.is_login_enabled === 0, 'Campus login disabled');

  const accessible = await request('GET', '/branches/accessible', null, token);
  assert(accessible.status === 200 && accessible.body.branches.length >= 2, 'Admin sees both branches');

  const select = await request('POST', '/branches/select', { branchId: campusId }, token);
  assert(select.status === 200 && select.body.token, 'Select campus context');
  assert(Number(select.body.activeBranchId) === Number(campusId), 'Active branch is campus');
  token = select.body.token;

  const me = await request('GET', '/auth/me', null, token);
  assert(me.status === 200, '/me works after select');

  const hq = await request('POST', `/branches/${campusId}/headquarters`, {}, token);
  assert(hq.status === 200 && hq.body.branch.is_headquarters === 1, 'Set campus as HQ');

  const list2 = await request('GET', '/branches', null, token);
  const hqCount = (list2.body.branches || []).filter(b => b.is_headquarters).length;
  assert(hqCount === 1, 'Only one headquarters');

  // Other church cannot select this campus
  const otherEmail = `br-o-${stamp}@test.local`;
  await request('POST', '/auth/register', {
    churchName: `Other BR ${stamp}`,
    churchSlug: `br-o-${stamp}`,
    email: otherEmail,
    password
  });
  const otherLogin = await request('POST', '/auth/login', { email: otherEmail, password });
  const denied = await request(
    'POST',
    '/branches/select',
    { branchId: campusId },
    otherLogin.body.token
  );
  assert(denied.status === 403, 'Cross-church branch select denied');

  // Restore home context
  const back = await request('POST', '/branches/select', { branchId: homeId }, token);
  assert(back.status === 200, 'Switch back to home branch');

  console.log('\nAll branch management checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
