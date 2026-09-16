/**
 * Phase 11 visitors & follow-up tests.
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
  console.log('Phase 11 visitors test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `vis-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Vis Church ${stamp}`,
    churchSlug: `vis-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200, 'Register church');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const meta = await request('GET', '/visitors/meta', null, token);
  assert(meta.body.followUpStatuses?.includes('New'), 'Meta pipeline statuses');

  const create = await request(
    'POST',
    '/visitors',
    {
      firstname: 'Sam',
      lastname: 'Visitor',
      phone: '555-1000',
      email: `sam-${stamp}@test.local`,
      sex: 'male',
      invited_by: 'Usher Team',
      service_attended: 'Sunday worship',
      prayer_request: 'Job',
      first_visit_date: '2026-09-14'
    },
    token
  );
  assert(create.status === 201 && create.body.visitor?.id, 'Register visitor');
  assert(create.body.visitor.follow_up_status === 'New', 'Starts as New');
  const id = create.body.visitor.id;

  const contacted = await request(
    'POST',
    `/visitors/${id}/follow-up`,
    { status: 'Contacted', notes: 'Called Monday' },
    token
  );
  assert(contacted.status === 200 && contacted.body.visitor.follow_up_status === 'Contacted', 'Advance to Contacted');

  await request('POST', `/visitors/${id}/follow-up`, { status: 'Follow-up' }, token);
  await request('POST', `/visitors/${id}/follow-up`, { status: 'Interested' }, token);

  const list = await request('GET', '/visitors?status=Interested', null, token);
  assert(list.body.visitors?.some(v => v.id === id), 'Filter by status');
  assert(list.body.pipeline?.length >= 5, 'Pipeline counts present');

  const detail = await request('GET', `/visitors/${id}`, null, token);
  assert(detail.body.history?.length >= 3, 'Follow-up history logged');

  const convert = await request('POST', `/visitors/${id}/convert`, {}, token);
  assert(convert.status === 201 && convert.body.member?.id, 'Convert to member');
  assert(convert.body.visitor.follow_up_status === 'Converted', 'Status Converted');
  assert(convert.body.member.firstname === 'Sam', 'Member copied firstname');
  assert(convert.body.membership_id, 'Membership ID assigned');

  const member = await request('GET', `/members/${convert.body.member.id}`, null, token);
  assert(member.status === 200, 'Member profile exists');

  const again = await request('POST', `/visitors/${id}/convert`, {}, token);
  assert(again.status === 400, 'Double convert blocked');

  console.log('\nAll visitor checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
