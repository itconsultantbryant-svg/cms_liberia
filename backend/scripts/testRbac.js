/**
 * Phase 7 RBAC tests.
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
  console.log('Phase 7 RBAC test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `rbac-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `RBAC Church ${stamp}`,
    churchSlug: `rbac-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200, 'Register church');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const catalog = await request('GET', '/roles/permissions', null, token);
  assert(catalog.status === 200 && catalog.body.permissions?.length > 5, 'Permission catalog loaded');
  assert(
    catalog.body.permissions.some(p => p.perm_key === 'members.view'),
    'members.view exists'
  );

  const roles = await request('GET', '/roles', null, token);
  assert(roles.status === 200 && Array.isArray(roles.body), 'List roles');
  assert(roles.body.some(r => r.role_code === 'PRESIDENT'), 'PRESIDENT template present');
  assert(roles.body.some(r => r.scope === 'platform'), 'Platform roles present');
  assert(roles.body.some(r => r.scope === 'branch'), 'Branch roles present');

  const me = await request('GET', '/roles/me', null, token);
  assert(me.status === 200 && Array.isArray(me.body.permissions), 'Effective permissions on /roles/me');
  assert(me.body.permissions.includes('members.view'), 'Admin has members.view');
  assert(me.body.permissions.includes('roles.manage'), 'Admin has roles.manage');

  const custom = await request(
    'POST',
    '/roles/custom',
    {
      roleName: `Usher ${stamp}`,
      description: 'Custom usher',
      permissions: ['members.view', 'attendance.manage']
    },
    token
  );
  assert(custom.status === 201, 'Create custom role');
  assert(custom.body.role?.is_custom === 1, 'Role marked custom');
  assert(custom.body.role.permissions.includes('attendance.manage'), 'Custom perms saved');

  const authMe = await request('GET', '/auth/me', null, token);
  assert(authMe.status === 200 && Array.isArray(authMe.body.user?.permissionKeys), '/me includes permissionKeys');

  // Limited user without roles.manage cannot create custom role
  const limitedEmail = `rbac-lim-${stamp}@test.local`;
  await request('POST', '/auth/register', {
    churchName: `RBAC Lim ${stamp}`,
    churchSlug: `rbac-lim-${stamp}`,
    email: limitedEmail,
    password
  });
  // Demote: clear isadmin and roles via DB
  const db = require('../database');
  await db.runAsync('UPDATE branches SET isadmin = 0 WHERE email = ?', [limitedEmail]);
  await db.runAsync(
    `UPDATE user_roles SET is_active = 0 WHERE user_id = (SELECT id FROM branches WHERE email = ?)`,
    [limitedEmail]
  );
  const limLogin = await request('POST', '/auth/login', { email: limitedEmail, password });
  const denied = await request(
    'POST',
    '/roles/custom',
    { roleName: 'Nope', permissions: ['members.view'] },
    limLogin.body.token
  );
  assert(denied.status === 403, 'Non-admin denied custom role create');

  console.log('\nAll RBAC checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
