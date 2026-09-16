/**
 * Phase 5 church administration tests.
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
  console.log('Phase 5 church administration test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const platformEmail = `p5-plat-${stamp}@test.local`;
  const password = 'SecurePass1';

  // Register a platform admin candidate and promote via login after DB flag —
  // use existing createPlatformAdmin path: register then mark is_platform_admin
  const regPlat = await request('POST', '/auth/register', {
    churchName: `P5 Platform ${stamp}`,
    churchSlug: `p5-plat-${stamp}`,
    email: platformEmail,
    password
  });
  assert(regPlat.status === 200, 'Register platform candidate');

  const db = require('../database');
  await db.runAsync(
    'UPDATE branches SET is_platform_admin = 1 WHERE email = ?',
    [platformEmail]
  );

  const loginPlat = await request('POST', '/auth/login', { email: platformEmail, password });
  assert(loginPlat.status === 200 && loginPlat.body.user?.isSuperadmin, 'Platform admin login');
  const saToken = loginPlat.body.token;

  const adminEmail = `p5-ca-${stamp}@test.local`;
  const create = await request(
    'POST',
    '/superadmin/churches',
    {
      name: `P5 Church ${stamp}`,
      slug: `p5-ch-${stamp}`,
      adminEmail,
      adminPassword: password,
      adminName: `P5 HQ ${stamp}`
    },
    saToken
  );
  assert(create.status === 201, 'Superadmin creates church with first admin');
  assert(create.body.admin?.email === adminEmail, 'First admin returned');
  const churchId = create.body.id;

  const loginAdmin = await request('POST', '/auth/login', { email: adminEmail, password });
  assert(loginAdmin.status === 200, 'Church admin can login');
  assert(loginAdmin.body.user?.isadmin === 1 || loginAdmin.body.user?.isadmin === true, 'isadmin flag');
  const adminToken = loginAdmin.body.token;

  const overview = await request('GET', '/dashboard/admin-overview', null, adminToken);
  assert(overview.status === 200, 'Admin overview available');
  assert(overview.body.overview && typeof overview.body.overview.members === 'number', 'Overview has members');
  assert(Number(overview.body.church?.id) === Number(churchId), 'Overview scoped to own church');

  const coEmail = `p5-co-${stamp}@test.local`;
  const addCo = await request(
    'POST',
    '/church/admins',
    { email: coEmail, password, name: `Co Admin ${stamp}` },
    adminToken
  );
  assert(addCo.status === 201, 'Church can add co-admin');

  const listAdmins = await request('GET', '/church/admins', null, adminToken);
  assert(listAdmins.status === 200 && listAdmins.body.admins.length >= 2, 'Multiple admins listed');

  const loginCo = await request('POST', '/auth/login', { email: coEmail, password });
  assert(loginCo.status === 200, 'Co-admin can login');

  // Isolation: co-admin of church A cannot see church B overview as theirs
  const other = await request('POST', '/auth/register', {
    churchName: `P5 Other ${stamp}`,
    churchSlug: `p5-o-${stamp}`,
    email: `p5-o-${stamp}@test.local`,
    password
  });
  assert(other.status === 200, 'Register other church');
  const otherLogin = await request('POST', '/auth/login', {
    email: `p5-o-${stamp}@test.local`,
    password
  });
  const otherOverview = await request(
    'GET',
    '/dashboard/admin-overview',
    null,
    otherLogin.body.token
  );
  assert(otherOverview.status === 200, 'Other church admin overview');
  assert(
    Number(otherOverview.body.church.id) !== Number(churchId),
    'Other admin only sees own church'
  );

  const saAdd = await request(
    'POST',
    `/superadmin/churches/${churchId}/admins`,
    { email: `p5-sa-add-${stamp}@test.local`, password, name: 'SA Added' },
    saToken
  );
  assert(saAdd.status === 201, 'Superadmin can add another church admin');

  console.log('\nAll church administration checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
