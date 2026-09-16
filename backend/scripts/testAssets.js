/**
 * Phase 22 assets & inventory tests.
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
  console.log('Phase 22 assets test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `ast-${stamp}@test.local`;
  const password = 'SecurePass1';

  await request('POST', '/auth/register', {
    churchName: `Assets Church ${stamp}`,
    churchSlug: `ast-${stamp}`,
    email,
    password
  });
  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const meta = await request('GET', '/assets/meta', null, token);
  assert(meta.status === 200 && meta.body.categories.includes('vehicle'), 'Meta categories');

  const create = await request(
    'POST',
    '/assets',
    {
      name: `Yamaha Keyboard ${stamp}`,
      category: 'musical',
      description: 'Worship keyboard',
      purchaseValue: 1200,
      purchaseDate: '2025-01-15',
      location: 'Main sanctuary',
      custodianName: 'Media Team',
      conditionStatus: 'good',
      serialNumber: `SN-${stamp}`
    },
    token
  );
  assert(create.status === 201 && create.body.id, 'Create asset');
  assert(create.body.asset.asset_code, 'Asset code generated');
  const id = create.body.id;

  const list = await request('GET', '/assets?allBranches=1&category=musical', null, token);
  assert((list.body.assets || []).some(a => a.id === id), 'Listed by category');
  assert(Number(list.body.totals.total_value) >= 1200, 'Totals include value');

  const assign = await request(
    'POST',
    `/assets/${id}/assign`,
    { location: 'Choir loft', custodianName: 'Choir Director' },
    token
  );
  assert(assign.status === 200 && assign.body.asset.location === 'Choir loft', 'Assign/relocate');

  const maint = await request(
    'POST',
    `/assets/${id}/maintenance`,
    {
      serviceDate: '2026-09-01',
      description: 'String replacement',
      cost: 75,
      vendor: 'Music Shop',
      markInRepair: true
    },
    token
  );
  assert(maint.status === 201, 'Record maintenance');
  assert(maint.body.asset.status === 'in_repair', 'Marked in repair');

  await request('POST', `/assets/${id}/maintenance`, {
    description: 'Returned from shop',
    markActive: true,
    conditionStatus: 'good'
  }, token);

  const detail = await request('GET', `/assets/${id}`, null, token);
  assert(detail.status === 200, 'Detail');
  assert((detail.body.history || []).length >= 3, 'History events');
  assert((detail.body.maintenance || []).length >= 2, 'Maintenance records');

  const patch = await request(
    'PATCH',
    `/assets/${id}`,
    { notes: 'Primary worship keyboard' },
    token
  );
  assert(patch.status === 200, 'Patch asset');

  const dispose = await request('DELETE', `/assets/${id}`, null, token);
  assert(dispose.status === 200, 'Dispose asset');

  const after = await request('GET', `/assets/${id}`, null, token);
  assert(after.body.asset.status === 'disposed', 'Status disposed');

  const activeList = await request('GET', '/assets?allBranches=1', null, token);
  assert(!(activeList.body.assets || []).some(a => a.id === id), 'Disposed hidden by default');

  console.log('\nAll Phase 22 assets checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
