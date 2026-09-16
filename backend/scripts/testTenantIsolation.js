/**
 * Phase 32 (extends Phase 1) — database tenant isolation + cross-tenant attack tests.
 * Creates Church A and Church B, then attempts IDOR / body spoofing / list leakage.
 */
const http = require('http');
const {
  scrubClientTenantOverrides,
  getInChurch,
  assertSameChurch,
  requireChurchContext
} = require('../utils/tenantScope');
const { ApiError } = require('../middleware/errorHandler');
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
  console.log('Phase 32 database tenant isolation test\n');

  // Unit: scrub overrides
  const fakeReq = {
    body: { church_id: 999, churchId: 999, name: 'x', tenant_id: 1 },
    query: { church_id: '999', churchId: '888' },
    headers: { 'x-church-id': '777', 'x-tenant-id': '666' }
  };
  scrubClientTenantOverrides(fakeReq);
  assert(
    fakeReq.body.church_id === undefined &&
      fakeReq.body.churchId === undefined &&
      fakeReq.body.tenant_id === undefined &&
      fakeReq.body.name === 'x',
    'Scrub removes body church overrides'
  );
  assert(
    fakeReq.query.church_id === undefined && fakeReq.headers['x-church-id'] === undefined,
    'Scrub removes query/header spoofing'
  );

  try {
    requireChurchContext({});
    assert(false, 'requireChurchContext should throw');
  } catch (e) {
    assert(e instanceof ApiError && e.status === 403, 'Missing tenant → 403');
  }

  try {
    assertSameChurch({ churchId: 1 }, 2);
    assert(false, 'assertSameChurch should throw');
  } catch (e) {
    assert(e.status === 404 && e.code === 'TENANT_ISOLATION', 'Cross-church assert → isolation 404');
  }

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const churchA = {
    churchName: `Iso32 Church A ${stamp}`,
    churchSlug: `iso32-a-${stamp}`,
    email: `iso32-a-${stamp}@test.local`,
    password: 'TestPass123!',
    country: 'Liberia',
    city: 'Monrovia'
  };
  const churchB = {
    churchName: `Iso32 Church B ${stamp}`,
    churchSlug: `iso32-b-${stamp}`,
    email: `iso32-b-${stamp}@test.local`,
    password: 'TestPass123!',
    country: 'Liberia',
    city: 'Gbarnga'
  };

  const regA = await request('POST', '/auth/register', churchA);
  assert(regA.status === 200, `Register Church A`);
  const regB = await request('POST', '/auth/register', churchB);
  assert(regB.status === 200, `Register Church B`);
  assert(regA.body.churchId !== regB.body.churchId, 'Distinct church IDs');

  const loginA = await request('POST', '/auth/login', {
    email: churchA.email,
    password: churchA.password
  });
  const loginB = await request('POST', '/auth/login', {
    email: churchB.email,
    password: churchB.password
  });
  assert(loginA.status === 200 && loginB.status === 200, 'Login A and B');
  const tokenA = loginA.body.token;
  const tokenB = loginB.body.token;
  const churchIdA = regA.body.churchId;
  const churchIdB = regB.body.churchId;
  const branchBId = loginB.body.user.branchId || loginB.body.user.id;

  // Create member in B
  const memB = await request(
    'POST',
    '/members',
    {
      firstname: 'TenantB',
      lastname: 'Member',
      email: `memb-${stamp}@test.local`,
      church_id: churchIdA // spoof — must be ignored
    },
    tokenB
  );
  assert(memB.status === 201 || memB.status === 200, 'Create member in Church B');
  const memberBId = memB.body.id || memB.body.member?.id;

  // Confirm DB row is church B despite spoofed body
  if (memberBId) {
    const row = await db.getAsync('SELECT church_id FROM members WHERE id = ?', [memberBId]);
    assert(Number(row.church_id) === Number(churchIdB), 'Member church_id is B (spoof ignored)');
    const leak = await getInChurch('members', memberBId, churchIdA);
    assert(leak == null, 'getInChurch(A) cannot load B member');
    const own = await getInChurch('members', memberBId, churchIdB);
    assert(own && own.id === memberBId, 'getInChurch(B) loads B member');
  }

  // List isolation
  const usersA = await request('GET', '/users', null, tokenA);
  assert(usersA.status === 200 && Array.isArray(usersA.body), 'A lists users');
  assert(!usersA.body.some(u => u.email === churchB.email), 'A users exclude B email');

  const branchesA = await request('GET', '/branches', null, tokenA);
  const branchListA = Array.isArray(branchesA.body)
    ? branchesA.body
    : branchesA.body?.branches || [];
  assert(branchesA.status === 200 && Array.isArray(branchListA), 'A lists branches');
  assert(!branchListA.some(b => b.email === churchB.email), 'A branches exclude B');

  const membersA = await request('GET', '/members', null, tokenA);
  const listA = Array.isArray(membersA.body)
    ? membersA.body
    : membersA.body?.members || [];
  assert(
    !listA.some(m => m.id === memberBId || m.email === `memb-${stamp}@test.local`),
    'A members list excludes B member'
  );

  // IDOR attacks
  const crossUser = await request('GET', `/users/${branchBId}`, null, tokenA);
  assert(
    crossUser.status === 404 || crossUser.status === 403,
    `A cannot fetch B user (${crossUser.status})`
  );

  if (memberBId) {
    const crossMember = await request('GET', `/members/${memberBId}`, null, tokenA);
    assert(
      crossMember.status === 404 || crossMember.status === 403,
      `A cannot fetch B member (${crossMember.status})`
    );

    const crossUpdate = await request(
      'PUT',
      `/members/${memberBId}`,
      { firstname: 'Hacked', church_id: churchIdB },
      tokenA
    );
    assert(
      crossUpdate.status === 404 || crossUpdate.status === 403,
      `A cannot update B member (${crossUpdate.status})`
    );
  }

  // Settings spoof: A cannot change B via body church_id
  const settingsAttack = await request(
    'PATCH',
    '/church/settings',
    { name: 'Hijacked Name', church_id: churchIdB, churchId: churchIdB },
    tokenA
  );
  assert(settingsAttack.status === 200, 'A settings patch accepted for own tenant');
  assert(
    settingsAttack.body.church?.name === 'Hijacked Name' ||
      settingsAttack.body.church?.id === churchIdA,
    'Settings apply to A only'
  );

  const settingsB = await request('GET', '/church/settings', null, tokenB);
  assert(
    settingsB.body.church?.name !== 'Hijacked Name',
    'B church name unchanged by A spoof'
  );

  // Events IDOR
  const evB = await request(
    'POST',
    '/events',
    {
      title: `Secret B Event ${stamp}`,
      date: '2099-01-15',
      church_id: churchIdA
    },
    tokenB
  );
  if (evB.status === 201 || evB.status === 200) {
    const eventId = evB.body.event?.id || evB.body.id;
    if (eventId) {
      const crossEvent = await request('GET', `/events/${eventId}`, null, tokenA);
      assert(
        crossEvent.status === 404 || crossEvent.status === 403,
        `A cannot fetch B event (${crossEvent.status})`
      );
    }
  } else {
    console.log(`  SKIP: event create status ${evB.status} (${evB.body?.error || ''})`);
  }

  // Superadmin is separate — tenant token cannot hit platform church create
  const saCreate = await request(
    'POST',
    '/superadmin/churches',
    { name: 'Nope', slug: `nope-${stamp}` },
    tokenA
  );
  assert(
    saCreate.status === 401 || saCreate.status === 403,
    `Church admin cannot use superadmin routes (${saCreate.status})`
  );

  // B still sees own member
  if (memberBId) {
    const own = await request('GET', `/members/${memberBId}`, null, tokenB);
    assert(own.status === 200, 'B can fetch own member');
  }

  console.log('\nAll Phase 32 tenant isolation checks passed.');
}

run().catch(err => {
  console.error('\n' + err.message);
  console.error(err.stack);
  process.exit(1);
});
