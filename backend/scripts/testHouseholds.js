/**
 * Phase 10 households tests.
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
  console.log('Phase 10 households test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `hh-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `HH Church ${stamp}`,
    churchSlug: `hh-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200, 'Register church');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const head = await request(
    'POST',
    '/members',
    { firstname: 'John', lastname: 'Doe', email: `john-${stamp}@test.local`, sex: 'male' },
    token
  );
  assert(head.status === 201, 'Create head member');
  const headId = head.body.id;

  const spouse = await request(
    'POST',
    '/members',
    { firstname: 'Jane', lastname: 'Doe', email: `jane-${stamp}@test.local`, sex: 'female' },
    token
  );
  const child = await request(
    'POST',
    '/members',
    { firstname: 'Jimmy', lastname: 'Doe', email: `jimmy-${stamp}@test.local`, sex: 'male' },
    token
  );
  assert(spouse.status === 201 && child.status === 201, 'Create spouse and child');

  const create = await request(
    'POST',
    '/households',
    {
      name: `Doe Family ${stamp}`,
      address: '12 Faith St',
      city: 'Monrovia',
      headMemberId: headId,
      members: [
        { memberId: spouse.body.id, relationship: 'spouse' },
        { memberId: child.body.id, relationship: 'child' }
      ]
    },
    token
  );
  assert(create.status === 201 && create.body.household?.id, 'Create household');
  assert(create.body.members?.length === 3, 'Three members linked');
  const hhId = create.body.household.id;

  const detail = await request('GET', `/households/${hhId}`, null, token);
  assert(detail.status === 200, 'Get household profile');
  assert(detail.body.giving != null, 'Giving section present for admin');
  assert(
    detail.body.members.some(m => m.relationship === 'head'),
    'Has head relationship'
  );

  const list = await request('GET', `/households?q=Doe`, null, token);
  assert(list.status === 200 && list.body.households.length >= 1, 'Search households');

  const byMember = await request('GET', `/households/by-member/${headId}`, null, token);
  assert(byMember.body.households?.some(h => h.id === hhId), 'Lookup by member');

  const mem = await request('GET', `/members/${headId}`, null, token);
  assert(mem.body.households?.some(h => h.id === hhId), 'Member profile includes household');

  const dep = await request(
    'POST',
    '/members',
    { firstname: 'Uncle', lastname: 'Doe', email: `uncle-${stamp}@test.local`, sex: 'male' },
    token
  );
  const add = await request(
    'POST',
    `/households/${hhId}/members`,
    { memberId: dep.body.id, relationship: 'dependent' },
    token
  );
  assert(add.status === 201 && add.body.members.length === 4, 'Add dependent');

  const patch = await request(
    'PATCH',
    `/households/${hhId}/members/${spouse.body.id}`,
    { relationship: 'spouse' },
    token
  );
  assert(patch.status === 200, 'Update relationship');

  console.log('\nAll household checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
