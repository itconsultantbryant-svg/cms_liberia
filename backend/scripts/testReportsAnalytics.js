/**
 * Phase 23 reporting & analytics tests.
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
          } catch (_) {
            /* keep string (csv) */
          }
          resolve({ status: res.statusCode, body: parsed, raw, headers: res.headers });
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
  console.log('Phase 23 reports & analytics test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `rpt-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Reports Church ${stamp}`,
    churchSlug: `rpt-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200 || reg.status === 201, `Register (${reg.status})`);

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200 && login.body.token, 'Login');
  const token = login.body.token;
  const churchId = login.body.user.churchId || login.body.user.church_id;

  // Seed member + attendance + finance for meaningful aggregates
  const branch = await db.getAsync(
    'SELECT id FROM branches WHERE church_id = ? ORDER BY id LIMIT 1',
    [churchId]
  );
  const branchId = branch?.id;

  await db.runAsync(
    `INSERT INTO members (church_id, branch_id, firstname, lastname, sex, membership_status, email, created_at)
     VALUES (?, ?, 'Analytics', 'Member', 'male', 'Active', ?, datetime('now'))`,
    [churchId, branchId, `m-${stamp}@test.local`]
  );

  let serviceId = null;
  try {
    const st = await db.getAsync(
      'SELECT id FROM service_types WHERE church_id = ? OR church_id IS NULL LIMIT 1',
      [churchId]
    );
    serviceId = st?.id;
    if (!serviceId) {
      const r = await db.runAsync(
        `INSERT INTO service_types (name, church_id) VALUES ('Sunday Service', ?)`,
        [churchId]
      );
      serviceId = r.lastID;
    }
  } catch (_) {
    /* optional */
  }

  if (branchId && serviceId) {
    try {
      await db.runAsync(
        `INSERT INTO attendances (branch_id, church_id, male, female, children, service_types_id, attendance_date)
         VALUES (?, ?, 10, 12, 5, ?, date('now'))`,
        [branchId, churchId, serviceId]
      );
    } catch (e) {
      console.log('  note: attendance seed skipped', e.message);
    }
  }

  let catId = null;
  try {
    const cat = await db.getAsync(
      `SELECT id FROM finance_categories WHERE (church_id = ? OR church_id IS NULL) AND code = 'TITHES' LIMIT 1`,
      [churchId]
    );
    catId = cat?.id;
    if (catId) {
      await db.runAsync(
        `INSERT INTO finance_transactions (
          church_id, branch_id, txn_type, category_id, amount, currency, payment_method,
          txn_date, description, status, entered_by
        ) VALUES (?, ?, 'income', ?, 250, 'USD', 'cash', date('now'), 'Test tithe', 'posted', ?)`,
        [churchId, branchId, catId, login.body.user.id]
      );
    }
  } catch (e) {
    console.log('  note: finance seed skipped', e.message);
  }

  const overview = await request('GET', '/analytics/overview', null, token);
  assert(overview.status === 200, 'GET /analytics/overview');
  assert(typeof overview.body.membership?.total === 'number', 'Overview has membership.total');
  assert(overview.body.membership.total >= 1, 'Membership count includes seeded member');

  const membership = await request('GET', '/analytics/membership', null, token);
  assert(membership.status === 200, 'GET /analytics/membership');
  assert(Array.isArray(membership.body.byStatus), 'Membership byStatus array');
  assert(Array.isArray(membership.body.byAgeGroup), 'Membership byAgeGroup array');

  const attendance = await request(
    'GET',
    `/analytics/attendance?from=2020-01-01&to=2099-12-31${branchId ? `&branchId=${branchId}` : ''}`,
    null,
    token
  );
  assert(attendance.status === 200, 'GET /analytics/attendance with filters');
  assert(typeof attendance.body.totalHeadcount === 'number', 'Attendance totalHeadcount');

  const finance = await request('GET', '/analytics/finance?from=2020-01-01&to=2099-12-31', null, token);
  assert(finance.status === 200, 'GET /analytics/finance');
  assert(typeof finance.body.income === 'number', 'Finance income number');
  if (catId) {
    assert(finance.body.income >= 250, 'Finance income includes seeded tithe');
    assert(finance.body.tithes >= 250, 'Tithes breakdown includes seeded amount');
  }

  const ministry = await request('GET', '/analytics/ministry', null, token);
  assert(ministry.status === 200, 'GET /analytics/ministry');
  assert(Array.isArray(ministry.body.ministries), 'Ministry list');

  const csv = await request(
    'GET',
    '/analytics/export/membership?format=csv&from=2020-01-01&to=2099-12-31',
    null,
    token
  );
  assert(csv.status === 200, 'Export membership CSV');
  assert(String(csv.raw).includes('Section') || String(csv.raw).includes('Label'), 'CSV has header');

  const jsonExport = await request(
    'GET',
    '/analytics/export/finance?format=json&from=2020-01-01&to=2099-12-31',
    null,
    token
  );
  assert(jsonExport.status === 200 && Array.isArray(jsonExport.body.rows), 'Export finance JSON');

  // Unauthenticated blocked
  const noAuth = await request('GET', '/analytics/overview');
  assert(noAuth.status === 401 || noAuth.status === 403, 'Unauthenticated overview blocked');

  console.log('\nAll Phase 23 analytics checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
