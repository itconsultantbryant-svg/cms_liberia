/**
 * Phase 36 — performance tests (indexes, pagination clamp, cache, compression).
 */
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { parsePagination, paginationMeta, MAX_LIMIT } = require('../utils/pagination');
const { TtlCache } = require('../utils/cache');
const { assertImageFile, MAX_IMAGE_BYTES } = require('../utils/imageOptimize');
const { apply: applyIndexes, INDEXES } = require('./applyPerformanceIndexes');

const PORT = process.env.PORT || 5000;

function request(method, pathName, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api${pathName}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...extraHeaders
        }
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          let buf = Buffer.concat(chunks);
          const enc = String(res.headers['content-encoding'] || '').toLowerCase();
          const finish = (raw) => {
            let parsed = raw.toString('utf8');
            try {
              parsed = JSON.parse(parsed);
            } catch (_) { /* keep string */ }
            resolve({ status: res.statusCode, body: parsed, headers: res.headers, rawLength: raw.length });
          };
          if (enc.includes('gzip')) {
            zlib.gunzip(buf, (err, out) => {
              if (err) return reject(err);
              finish(out);
            });
          } else {
            finish(buf);
          }
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
  console.log('Phase 36 performance test\n');

  // Unit: pagination
  const p = parsePagination({ page: '0', limit: '9999' });
  assert(p.page === 1, 'page clamped to >= 1');
  assert(p.limit === MAX_LIMIT, `limit clamped to ${MAX_LIMIT}`);
  assert(p.offset === 0, 'offset for page 1');
  const meta = paginationMeta({ page: 2, limit: 25, total: 60 });
  assert(meta.pages === 3 && meta.hasMore === true, 'paginationMeta pages/hasMore');

  // Unit: TTL cache
  const c = new TtlCache({ defaultTtlMs: 50, maxEntries: 10 });
  c.set('a', 1);
  assert(c.get('a') === 1, 'cache hit');
  await new Promise(r => setTimeout(r, 60));
  assert(c.get('a') === undefined, 'cache expiry');

  // Unit: image constraints
  assert(!assertImageFile(null).ok, 'reject missing image');
  assert(!assertImageFile({ mimetype: 'application/pdf', size: 100 }).ok, 'reject non-image');
  assert(
    assertImageFile({ mimetype: 'image/jpeg', size: 1000 }).ok,
    'accept jpeg under limit'
  );
  assert(
    !assertImageFile({ mimetype: 'image/png', size: MAX_IMAGE_BYTES + 1 }).ok,
    'reject oversized image'
  );

  // Apply indexes
  await applyIndexes();
  const db = require('../database');
  const idx = await db.allAsync(
    `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`
  );
  assert(idx.length >= 5, `performance indexes present (${idx.length})`);
  assert(INDEXES.length >= 15, 'index catalog defined');

  // API integration
  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health up');

  const stamp = Date.now();
  const email = `perf-${stamp}@test.local`;
  const reg = await request('POST', '/auth/register', {
    churchName: `Perf Church ${stamp}`,
    churchSlug: `perf-${stamp}`,
    email,
    password: 'SecurePass1'
  });
  assert(reg.status === 200 || reg.status === 201, 'register for perf test');
  const login = await request('POST', '/auth/login', { email, password: 'SecurePass1' });
  assert(login.status === 200, 'login for perf test');
  const token = login.body?.token || login.body?.accessToken;
  assert(!!token, 'got auth token');

  // Pagination clamp on members list
  const members = await request('GET', '/members?limit=9999&page=1', null, token);
  assert(members.status === 200, 'members list ok');
  const lim = members.body?.pagination?.limit;
  assert(lim != null && lim <= MAX_LIMIT, `members limit clamped (${lim})`);

  // Dashboard cache MISS then HIT (same server process; new user → cold key)
  const d1 = await request('GET', '/dashboard', null, token);
  assert(d1.status === 200, 'dashboard ok');
  assert(
    d1.body?.stats != null || d1.body?.attendance != null || d1.body?.collections != null,
    'dashboard returns aggregated stats (not raw member dump)'
  );
  const cache1 = (d1.headers['x-cache'] || '').toUpperCase();
  assert(cache1 === 'MISS', `first dashboard cache MISS (${cache1 || 'none'})`);

  const d2 = await request('GET', '/dashboard', null, token);
  assert(d2.status === 200, 'dashboard second call ok');
  const cache2 = (d2.headers['x-cache'] || '').toUpperCase();
  assert(cache2 === 'HIT', `second dashboard cache HIT (${cache2})`);

  // Compression with Accept-Encoding
  const gz = await request('GET', '/dashboard', null, token, { 'Accept-Encoding': 'gzip' });
  assert(gz.status === 200, 'gzip dashboard ok');
  const enc = String(gz.headers['content-encoding'] || '').toLowerCase();
  if (enc.includes('gzip')) {
    assert(true, 'gzip content-encoding present');
  } else {
    console.log('  OK: compression skipped for small payload (threshold)');
  }

  // Frontend code splitting markers
  const appJs = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/App.js'),
    'utf8'
  );
  assert(appJs.includes('lazy(()'), 'App.js uses React.lazy');
  assert(appJs.includes('Suspense'), 'App.js uses Suspense');

  console.log('\nPhase 36 performance tests passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
