/**
 * Phase 27 support access / impersonation tests.
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
  console.log('Phase 27 support access test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const saLogin = await request('POST', '/auth/login', {
    email: 'platform@cms.local',
    password: 'SuperAdmin1!'
  });
  assert(saLogin.status === 200 && saLogin.body.user?.isSuperadmin, 'Superadmin login');
  const saToken = saLogin.body.token;
  const saId = saLogin.body.user.id;

  const stamp = Date.now();
  const church = await request(
    'POST',
    '/superadmin/churches',
    {
      name: `Support Church ${stamp}`,
      slug: `sup-${stamp}`,
      adminEmail: `supadmin-${stamp}@test.local`,
      adminPassword: 'SecurePass1',
      adminName: 'Church Admin'
    },
    saToken
  );
  assert(church.status === 201 && church.body.id, 'Create target church');
  const churchId = church.body.id;

  // Reason required
  const noReason = await request(
    'POST',
    `/superadmin/churches/${churchId}/support-access`,
    { reason: 'x' },
    saToken
  );
  assert(noReason.status === 400, 'Short reason rejected');

  const start = await request(
    'POST',
    `/superadmin/churches/${churchId}/support-access`,
    { reason: 'Investigate billing sync issue for support ticket' },
    saToken
  );
  assert(start.status === 201 && start.body.token, 'Start support access');
  assert(start.body.banner?.includes('Superadmin'), 'Banner message present');
  assert(start.body.user?.supportMode === true, 'User in supportMode');
  assert(start.body.user?.isadmin === false, 'Not disguised as church admin');
  assert(start.body.user?.isSuperadmin === true, 'Still Superadmin');
  assert(Number(start.body.user?.churchId) === Number(churchId), 'JWT church is target');
  assert(Number(start.body.user?.id) === Number(saId), 'Actor id remains Superadmin');

  const supportToken = start.body.token;
  const sessionId = start.body.session.id;

  const me = await request('GET', '/auth/me', null, supportToken);
  assert(me.status === 200 && me.body.user?.supportMode === true, '/me shows supportMode');
  assert(me.body.user?.supportBanner?.includes('Superadmin'), '/me banner text');
  assert(me.body.user?.isadmin === false, '/me isadmin false');

  // Action in church context attributed to superadmin
  const member = await request(
    'POST',
    '/members',
    {
      firstname: 'Support',
      lastname: 'Created',
      email: `supmem-${stamp}@test.local`,
      sex: 'female'
    },
    supportToken
  );
  assert(member.status === 201, 'Can create member in support mode');

  const auditRows = await db.allAsync(
    `SELECT * FROM audit_logs WHERE support_session_id = ? ORDER BY id`,
    [sessionId]
  );
  assert(auditRows.length >= 1, 'Audit rows linked to support session');
  assert(
    auditRows.some(r => Number(r.user_id) === Number(saId)),
    'Audit attributed to Superadmin id'
  );
  assert(
    auditRows.some(r => String(r.summary || '').includes('[Support]') || r.action === 'create'),
    'Support-tagged or create audit present'
  );

  const end = await request('POST', '/superadmin/support-access/end', null, supportToken);
  assert(end.status === 200 && end.body.token, 'End support access');
  assert(end.body.session?.status === 'ended' && end.body.session?.ended_at, 'Session ended with timestamp');
  assert(end.body.user?.supportMode === false || end.body.user?.supportMode == null, 'Left support mode');

  const session = await db.getAsync('SELECT * FROM support_sessions WHERE id = ?', [sessionId]);
  assert(session.status === 'ended' && session.ended_at, 'DB session ended');
  assert(session.reason && session.superadmin_id === saId, 'Session logged superadmin + reason');

  // After end, token is restored — can list churches again
  const list = await request('GET', '/superadmin/churches', null, end.body.token);
  assert(list.status === 200, 'Superadmin portal works after end');

  console.log('\nAll Phase 27 support access checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
