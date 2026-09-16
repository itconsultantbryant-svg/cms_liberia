/**
 * Phase 25 audit logging tests.
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
  console.log('Phase 25 audit logging test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `aud-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Audit Church ${stamp}`,
    churchSlug: `aud-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200 || reg.status === 201, `Register (${reg.status})`);

  const bad = await request('POST', '/auth/login', { email, password: 'WrongPass999' });
  assert(bad.status === 401 || bad.status === 403, 'Failed login rejected');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200 && login.body.token, 'Login success');
  const token = login.body.token;

  const meta = await request('GET', '/audit/meta', null, token);
  assert(meta.status === 200 && meta.body.immutable === true, 'Audit meta immutable');
  assert((meta.body.actions || []).includes('login'), 'Actions include login');

  const list = await request('GET', '/audit?limit=50', null, token);
  assert(list.status === 200, 'List audit logs');
  assert((list.body.logs || []).some(l => l.action === 'login'), 'Login audited');
  assert((list.body.logs || []).some(l => l.action === 'login_failed'), 'Failed login audited');
  assert((list.body.logs || []).some(l => l.action === 'create' && l.resource === 'church'), 'Church create audited');

  // Member create should audit
  const member = await request(
    'POST',
    '/members',
    {
      firstname: 'Audit',
      lastname: 'Member',
      email: `am-${stamp}@test.local`,
      sex: 'male'
    },
    token
  );
  assert(member.status === 201, `Create member (${member.status})`);

  const afterMember = await request('GET', '/audit?resource=member&action=create', null, token);
  assert(
    (afterMember.body.logs || []).some(l => String(l.resource_id) === String(member.body.id)),
    'Member create audited'
  );

  // Immutability: delete forbidden
  const firstId = list.body.logs[0]?.id;
  const del = await request('DELETE', `/audit/${firstId}`, null, token);
  assert(del.status === 403, 'Delete audit record forbidden');

  const delAll = await request('DELETE', '/audit', null, token);
  assert(delAll.status === 403, 'Bulk delete forbidden');

  const patch = await request('PATCH', `/audit/${firstId}`, { summary: 'hack' }, token);
  assert(patch.status === 403, 'Patch audit record forbidden');

  // Still present after delete attempt
  const still = await request('GET', `/audit/${firstId}`, null, token);
  assert(still.status === 200 && still.body.log?.id === firstId, 'Audit record still exists');

  const logout = await request('POST', '/auth/logout', null, token);
  assert(logout.status === 200, 'Logout');

  // Need fresh login to query logout audit (token invalidated)
  const login2 = await request('POST', '/auth/login', { email, password });
  const token2 = login2.body.token;
  const logoutLogs = await request('GET', '/audit?action=logout', null, token2);
  assert((logoutLogs.body.logs || []).length >= 1, 'Logout audited');

  console.log('\nAll Phase 25 audit checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
