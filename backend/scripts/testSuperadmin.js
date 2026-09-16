/**
 * Phase 3 Superadmin isolation/access tests.
 * Registers a normal church admin and a platform admin, asserts access rules.
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

async function ensurePlatformColumn() {
  const cols = await db.allAsync('PRAGMA table_info(branches)');
  if (!cols.some(c => c.name === 'is_platform_admin')) {
    await db.runAsync('ALTER TABLE branches ADD COLUMN is_platform_admin INTEGER DEFAULT 0');
  }
}

async function run() {
  console.log('Phase 3 superadmin test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  await ensurePlatformColumn();

  const stamp = Date.now();
  const normalEmail = `sa-normal-${stamp}@test.local`;
  const adminEmail = `sa-admin-${stamp}@test.local`;
  const password = 'SecurePass1';

  const regN = await request('POST', '/auth/register', {
    churchName: `Normal Church ${stamp}`,
    churchSlug: `sa-n-${stamp}`,
    email: normalEmail,
    password
  });
  assert(regN.status === 200, 'Register normal church');

  const regA = await request('POST', '/auth/register', {
    churchName: `Platform Church ${stamp}`,
    churchSlug: `sa-a-${stamp}`,
    email: adminEmail,
    password
  });
  assert(regA.status === 200, 'Register platform-candidate church');

  await db.runAsync(
    'UPDATE branches SET is_platform_admin = 1 WHERE email = ?',
    [adminEmail]
  );

  const loginN = await request('POST', '/auth/login', { email: normalEmail, password });
  assert(loginN.status === 200, 'Login normal user');
  assert(!loginN.body.user?.isSuperadmin, 'Normal user is not superadmin');

  const denied = await request('GET', '/superadmin/churches', null, loginN.body.token);
  assert(denied.status === 403, 'Normal user denied superadmin churches');

  const loginA = await request('POST', '/auth/login', { email: adminEmail, password });
  assert(loginA.status === 200, 'Login platform admin');
  assert(loginA.body.user?.isSuperadmin === true, 'Platform admin has isSuperadmin');

  const token = loginA.body.token;
  const list = await request('GET', '/superadmin/churches', null, token);
  assert(list.status === 200 && Array.isArray(list.body.churches), 'Superadmin can list churches');
  assert(
    list.body.churches.some(c => c.slug === `sa-n-${stamp}`),
    'List includes normal church tenant'
  );

  const stats = await request('GET', '/superadmin/stats', null, token);
  assert(stats.status === 200 && stats.body.stats?.churches >= 2, 'Platform stats available');

  const create = await request(
    'POST',
    '/superadmin/churches',
    { name: `Created ${stamp}`, slug: `sa-c-${stamp}`, email: `created-${stamp}@test.local` },
    token
  );
  assert(create.status === 201, 'Superadmin can create church');
  const createdId = create.body.id;

  const suspend = await request(
    'PATCH',
    `/superadmin/churches/${createdId}/status`,
    { status: 'suspended' },
    token
  );
  assert(suspend.status === 200 && suspend.body.church?.status === 'suspended', 'Can suspend church');

  const activate = await request(
    'PATCH',
    `/superadmin/churches/${createdId}/status`,
    { status: 'active' },
    token
  );
  assert(activate.status === 200 && activate.body.church?.status === 'active', 'Can reactivate church');

  const detail = await request('GET', `/superadmin/churches/${createdId}`, null, token);
  assert(detail.status === 200 && detail.body.church?.id === createdId, 'Can fetch church detail');

  // Suspend normal church and ensure their tenant login is blocked
  const normalChurchId = regN.body.churchId;
  await request(
    'PATCH',
    `/superadmin/churches/${normalChurchId}/status`,
    { status: 'suspended' },
    token
  );
  const blocked = await request('POST', '/auth/login', { email: normalEmail, password });
  assert(blocked.status === 403, 'Suspended church cannot log in');

  // Restore for cleanliness
  await request(
    'PATCH',
    `/superadmin/churches/${normalChurchId}/status`,
    { status: 'active' },
    token
  );

  console.log('\nAll superadmin checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
