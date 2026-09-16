/**
 * Phase 18 pastoral care + confidentiality tests.
 */
const http = require('http');
const bcrypt = require('bcryptjs');
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
  console.log('Phase 18 pastoral care test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `past-${stamp}@test.local`;
  const password = 'SecurePass1';

  await request('POST', '/auth/register', {
    churchName: `Pastoral Church ${stamp}`,
    churchSlug: `past-${stamp}`,
    email,
    password
  });
  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login as PRESIDENT');
  const token = login.body.token;
  const churchId = login.body.user?.churchId || login.body.churchId;

  const meta = await request('GET', '/pastoral/meta', null, token);
  assert(meta.status === 200 && meta.body.caseTypes.includes('bereavement'), 'Meta (pastor access)');

  const member = await request(
    'POST',
    '/members',
    { firstname: 'Care', lastname: `Subject${stamp}`, email: `care-${stamp}@test.local` },
    token
  );
  assert(member.body.id, 'Member created');

  const create = await request(
    'POST',
    '/pastoral',
    {
      caseType: 'hospital_visit',
      title: `Hospital visit ${stamp}`,
      summary: 'Surgery recovery',
      memberId: member.body.id,
      priority: 'high',
      followUpDate: '2026-09-20'
    },
    token
  );
  assert(create.status === 201 && create.body.id, 'Create pastoral case');
  const id = create.body.id;

  const note = await request(
    'POST',
    `/pastoral/${id}/notes`,
    { noteType: 'counseling_note', body: 'Prayed with family; confidential.' },
    token
  );
  assert(note.status === 201, 'Add counseling note');

  const visit = await request(
    'POST',
    `/pastoral/${id}/visits`,
    {
      visitType: 'hospital',
      visitDate: '2026-09-16',
      location: 'Ward 3',
      notes: 'Short visit'
    },
    token
  );
  assert(visit.status === 201, 'Record hospital visit');

  const detail = await request('GET', `/pastoral/${id}`, null, token);
  assert(detail.status === 200, 'Get case detail');
  assert((detail.body.notes || []).length >= 1, 'Notes present');
  assert((detail.body.visits || []).length >= 1, 'Visits present');

  const list = await request('GET', '/pastoral?caseType=hospital_visit', null, token);
  assert((list.body.cases || []).some(c => c.id === id), 'List filters by type');

  await request('PATCH', `/pastoral/${id}`, { status: 'in_progress' }, token);
  const closed = await request('DELETE', `/pastoral/${id}`, null, token);
  assert(closed.status === 200, 'Close case');

  // Ordinary admin (isadmin) WITHOUT pastoral role must be denied
  const branch = await db.getAsync('SELECT id, church_id FROM branches WHERE email = ?', [email]);
  const adminEmail = `adminonly-${stamp}@test.local`;
  const hash = await bcrypt.hash(password, 10);
  await db.runAsync(
    `INSERT INTO branches (
      branchname, branchcode, email, password, isadmin, church_id, permissions,
      token_version, status, is_login_enabled
    ) VALUES (?, ?, ?, ?, 1, ?, '[]', 0, 'active', 1)`,
    [`Admin Only ${stamp}`, `AO${stamp}`.slice(0, 12), adminEmail, hash, branch.church_id]
  );

  const adminLogin = await request('POST', '/auth/login', { email: adminEmail, password });
  assert(adminLogin.status === 200, 'Login as isadmin without pastoral role');
  const adminToken = adminLogin.body.token;

  const denied = await request('GET', '/pastoral', null, adminToken);
  assert(denied.status === 403, 'Ordinary admin denied pastoral list');

  const deniedCreate = await request(
    'POST',
    '/pastoral',
    { caseType: 'prayer_request', title: 'Should fail', subjectName: 'X' },
    adminToken
  );
  assert(deniedCreate.status === 403, 'Ordinary admin denied pastoral create');

  console.log('\nAll Phase 18 pastoral care checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
