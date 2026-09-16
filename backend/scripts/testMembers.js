/**
 * Phase 9 member management tests.
 */
const http = require('http');

const PORT = process.env.PORT || 5000;

function request(method, path, body, token, raw = false) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
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
        let rawBody = '';
        res.on('data', c => (rawBody += c));
        res.on('end', () => {
          let parsed = rawBody;
          if (!raw) {
            try {
              parsed = JSON.parse(rawBody);
            } catch (_) { /* keep */ }
          }
          resolve({ status: res.statusCode, body: parsed, raw: rawBody });
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
  console.log('Phase 9 member management test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `mem-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Members Church ${stamp}`,
    churchSlug: `mem-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200, 'Register church');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const meta = await request('GET', '/members/meta', null, token);
  assert(meta.status === 200 && meta.body.membershipStatuses?.includes('Active'), 'Meta statuses');

  const create = await request(
    'POST',
    '/members',
    {
      firstname: 'Alice',
      middlename: 'Q',
      lastname: 'Johnson',
      email: `alice-${stamp}@test.local`,
      phone: '555-0100',
      sex: 'female',
      membership_status: 'Active',
      ministry: 'Choir',
      baptism_status: 'baptized'
    },
    token
  );
  assert(create.status === 201 && create.body.id, 'Create member');
  assert(create.body.membership_id, 'Membership ID assigned');
  const memberId = create.body.id;

  await request(
    'POST',
    '/members',
    {
      firstname: 'Bob',
      lastname: 'Smith',
      email: `bob-${stamp}@test.local`,
      sex: 'male',
      membership_status: 'Visitor'
    },
    token
  );

  const list = await request('GET', '/members?q=Alice&page=1&limit=10', null, token);
  assert(list.status === 200 && list.body.members?.length >= 1, 'Search finds Alice');
  assert(list.body.pagination?.total >= 1, 'Pagination present');

  const filtered = await request('GET', '/members?status=Visitor', null, token);
  assert(
    filtered.body.members?.every(m => m.membership_status === 'Visitor'),
    'Status filter works'
  );

  const detail = await request('GET', `/members/${memberId}`, null, token);
  assert(detail.status === 200 && detail.body.member.middlename === 'Q', 'Profile fields saved');

  const upd = await request(
    'PUT',
    `/members/${memberId}`,
    { membership_status: 'Inactive', notes: 'Moved away' },
    token
  );
  assert(upd.status === 200 && upd.body.member.membership_status === 'Inactive', 'Update status');

  const bulk = await request(
    'POST',
    '/members/bulk',
    { ids: [memberId], action: 'set_status', membershipStatus: 'Active' },
    token
  );
  assert(bulk.status === 200, 'Bulk status update');

  const csv = await request('GET', '/members/export', null, token, true);
  assert(csv.status === 200 && csv.raw.includes('membership_id'), 'Export CSV');
  assert(csv.raw.includes('Alice'), 'Export includes Alice');

  const imp = await request(
    'POST',
    '/members/import',
    {
      members: [
        {
          firstname: 'Carol',
          lastname: 'Lee',
          email: `carol-${stamp}@test.local`,
          membership_status: 'Active',
          ministry: 'Youth'
        }
      ]
    },
    token
  );
  assert(imp.status === 201 && imp.body.created === 1, 'Import JSON member');

  console.log('\nAll member management checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
