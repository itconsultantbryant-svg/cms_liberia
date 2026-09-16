/**
 * Phase 12 services & attendance tests.
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
  console.log('Phase 12 services & attendance test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `att-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Att Church ${stamp}`,
    churchSlug: `att-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200, 'Register church');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const seed = await request('POST', '/services/seed-defaults', {}, token);
  assert(seed.status === 200 && seed.body.seeded >= 1, `Seed defaults (${seed.body.seeded})`);

  const list = await request('GET', '/services', null, token);
  assert(list.status === 200 && list.body.services?.length >= 5, 'Services listed');
  assert(
    list.body.services.some(s => /sunday/i.test(s.name)),
    'Sunday worship present'
  );
  const serviceId = list.body.services[0].id;

  const createSvc = await request(
    'POST',
    '/services',
    { name: `Custom ${stamp}`, category: 'custom', description: 'Test' },
    token
  );
  assert(createSvc.status === 201, 'Create custom service');

  const qr = await request('GET', `/services/${serviceId}/qr-payload`, null, token);
  assert(qr.status === 200 && qr.body.token && qr.body.payload?.serviceId, 'QR payload ready');

  const member = await request(
    'POST',
    '/members',
    {
      firstname: 'Att',
      lastname: 'endee',
      email: `attendee-${stamp}@test.local`,
      sex: 'female',
      dob: '1990-05-01',
      ministry: 'Choir'
    },
    token
  );
  assert(member.status === 201, 'Create member');
  const membershipId = member.body.membership_id;

  const today = new Date().toISOString().slice(0, 10);
  const checkin = await request(
    'POST',
    '/attendance/check-in',
    { serviceId, date: today, membershipId },
    token
  );
  assert(checkin.status === 201 || checkin.status === 200, 'Check-in by membership ID');

  const qrCheck = await request(
    'POST',
    '/attendance/check-in',
    { token: qr.body.token, membershipId },
    token
  );
  assert(qrCheck.status === 200 && qrCheck.body.already, 'QR check-in detects already present');

  const bulk = await request(
    'POST',
    '/attendance/mark-bulk',
    {
      date: today,
      serviceId,
      members: [{ id: member.body.id, attendance: 'yes' }]
    },
    token
  );
  assert(bulk.status === 200, 'Bulk attendance');

  const headcount = await request(
    'POST',
    '/attendance/submit',
    { date: today, type: serviceId, male: 10, female: 12, children: 3 },
    token
  );
  assert(headcount.status === 200, 'Headcount submit');

  const byService = await request('GET', '/attendance/stats/detailed?groupBy=service', null, token);
  assert(byService.status === 200 && Array.isArray(byService.body.rows), 'Stats by service');

  const byGender = await request('GET', '/attendance/stats/detailed?groupBy=gender', null, token);
  assert(byGender.status === 200, 'Stats by gender');

  const byMonth = await request('GET', '/attendance/stats/detailed?groupBy=month', null, token);
  assert(byMonth.status === 200, 'Stats by month');

  console.log('\nAll services & attendance checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
