/**
 * Phase 31 API architecture tests.
 */
const http = require('http');
const { stripSensitive } = require('../utils/apiResponse');
const { withTransaction } = require('../utils/transactions');
const { ApiError } = require('../middleware/errorHandler');
const db = require('../database');

const PORT = process.env.PORT || 5000;

function request(method, pathName, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: pathName.startsWith('/api') ? pathName : `/api${pathName}`,
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
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
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
  console.log('Phase 31 API architecture test\n');

  // Unit: sanitize
  const cleaned = stripSensitive({
    email: 'a@b.c',
    password: 'secret',
    password_hash: 'x',
    nested: { token_version: 3, name: 'ok' }
  });
  assert(cleaned.email === 'a@b.c' && !cleaned.password && !cleaned.password_hash, 'stripSensitive removes secrets');
  assert(cleaned.nested.name === 'ok' && cleaned.nested.token_version === undefined, 'stripSensitive nested');

  // Unit: transactions rollback
  let rolled = false;
  try {
    await withTransaction(async (tx) => {
      await tx.runAsync(`CREATE TEMP TABLE IF NOT EXISTS _p31_tx (id INTEGER)`);
      await tx.runAsync(`INSERT INTO _p31_tx (id) VALUES (1)`);
      throw new Error('force rollback');
    });
  } catch (e) {
    rolled = e.message === 'force rollback';
  }
  assert(rolled, 'withTransaction rolls back on error');

  assert(new ApiError(403, 'Denied', 'FORBIDDEN').status === 403, 'ApiError carries status');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'Health HTTP 200');
  assert(health.body.status === 'ok', 'Health legacy status field');
  assert(health.body.success === true && health.body.data?.status === 'ok', 'Health Phase 31 envelope');

  const catalog = await request('GET', '/');
  assert(catalog.status === 200 && catalog.body.success === true, 'GET /api catalog');
  assert(Array.isArray(catalog.body.data?.modules), 'Catalog lists modules');
  const keys = (catalog.body.data.modules || []).map(m => m.key);
  assert(keys.includes('auth') && keys.includes('members') && keys.includes('finance'), 'Core modules present');
  assert(keys.includes('branches'), 'Branches module listed');

  const arch = await request('GET', '/meta/architecture');
  assert(arch.status === 200 && arch.body.success === true, 'Architecture meta endpoint');
  assert((arch.body.data?.layers || []).some(l => /tenant/i.test(l)), 'Documents tenant layer');

  const missing = await request('GET', '/this-route-does-not-exist-p31');
  assert(missing.status === 404, 'Unknown API route → 404');
  assert(missing.body.success === false && missing.body.code === 'NOT_FOUND', 'Consistent 404 envelope');

  // Rate limit headers present on API
  assert(
    health.headers['ratelimit-limit'] || health.headers['x-ratelimit-limit'],
    'Rate limit headers exposed'
  );

  // Auth + tenant still work through modular mounts
  const stamp = Date.now();
  const email = `apiarch-${stamp}@test.local`;
  const reg = await request('POST', '/auth/register', {
    churchName: `API Arch ${stamp}`,
    churchSlug: `apiarch-${stamp}`,
    email,
    password: 'SecurePass1'
  });
  assert(reg.status === 200 || reg.status === 201, 'Register via /api/auth');

  const login = await request('POST', '/auth/login', { email, password: 'SecurePass1' });
  assert(login.status === 200 && login.body.token, 'Login');
  const token = login.body.token;

  const branches = await request('GET', '/branches', null, token);
  assert(branches.status === 200, 'GET /api/branches');

  const alias = await request('GET', '/church/branches', null, token);
  assert(alias.status === 200, 'Alias GET /api/church/branches');

  const unauth = await request('GET', '/members');
  assert(unauth.status === 401 || unauth.status === 403, 'Tenant routes require auth');

  console.log('\nAll Phase 31 API architecture checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
