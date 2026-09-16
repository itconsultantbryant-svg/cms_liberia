/**
 * Phase 40 — custom domains & subdomain tenant resolution tests.
 */
const http = require('http');
const {
  normalizeHost,
  subdomainSlug,
  resolveTenantByHost,
  addChurchDomain,
  markDomainVerified,
  assertLoginAllowedForHost,
  isPlatformRootHost
} = require('../utils/domains');
const { apply } = require('./applyChurchDomains');
const db = require('../database');

const PORT = process.env.PORT || 5000;

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

function request(method, pathName, body, token, headers = {}) {
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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers
        }
      },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => {
          let parsed = raw;
          try {
            parsed = JSON.parse(raw);
          } catch (_) { /* */ }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('Phase 40 custom domains test\n');

  await apply();

  assert(normalizeHost('HTTPS://Grace.Example.COM:443/path') === 'grace.example.com', 'normalizeHost');
  assert(isPlatformRootHost('localhost'), 'localhost is platform root');
  assert(subdomainSlug('grace.cms.test', 'cms.test') === 'grace', 'subdomain slug extract');
  assert(subdomainSlug('cms.test', 'cms.test') === null, 'apex is not subdomain');

  // Unknown host never resolves to a church
  const prevPlatform = process.env.PLATFORM_DOMAIN;
  process.env.PLATFORM_DOMAIN = 'cms.test';

  const unknown = await resolveTenantByHost('totally-unknown.example.org');
  assert(unknown.resolved === false && unknown.reason === 'unknown_host', 'unknown host unresolved');

  const badSub = await resolveTenantByHost('no-such-church.cms.test');
  assert(badSub.resolved === false && badSub.reason === 'unknown_subdomain', 'unknown subdomain unresolved');

  // Seed two churches via register
  const stamp = Date.now();
  const regA = await request('POST', '/auth/register', {
    churchName: `Domain Church A ${stamp}`,
    churchSlug: `dom-a-${stamp}`,
    email: `dom-a-${stamp}@test.local`,
    password: 'SecurePass1'
  });
  assert(regA.status === 200 || regA.status === 201, 'Register church A');
  const churchIdA = regA.body.churchId;

  const regB = await request('POST', '/auth/register', {
    churchName: `Domain Church B ${stamp}`,
    churchSlug: `dom-b-${stamp}`,
    email: `dom-b-${stamp}@test.local`,
    password: 'SecurePass1'
  });
  assert(regB.status === 200 || regB.status === 201, 'Register church B');
  const churchIdB = regB.body.churchId;

  // Update slug to predictable values for subdomain test
  await db.runAsync('UPDATE churches SET slug = ? WHERE id = ?', [`doma${stamp}`, churchIdA]);
  await db.runAsync('UPDATE churches SET slug = ? WHERE id = ?', [`domb${stamp}`, churchIdB]);

  const subA = await resolveTenantByHost(`doma${stamp}.cms.test`);
  assert(subA.resolved && Number(subA.church.id) === Number(churchIdA), 'subdomain resolves to A');

  const subB = await resolveTenantByHost(`domb${stamp}.cms.test`);
  assert(subB.resolved && Number(subB.church.id) === Number(churchIdB), 'subdomain resolves to B');

  // Custom domain for A
  const customHost = `portal-a-${stamp}.church.test`;
  const pending = await addChurchDomain(churchIdA, customHost, { isPrimary: true });
  assert(pending.verification_status === 'pending', 'custom domain pending');

  const beforeVerify = await resolveTenantByHost(customHost);
  assert(beforeVerify.resolved === false && beforeVerify.reason === 'domain_unverified', 'unverified custom not used');

  await markDomainVerified(pending.id, { method: 'test' });
  const afterVerify = await resolveTenantByHost(customHost);
  assert(afterVerify.resolved && Number(afterVerify.church.id) === Number(churchIdA), 'verified custom → A');

  // Login mismatch: B user on A's host
  const gate = assertLoginAllowedForHost(afterVerify, churchIdB, { isSuperadmin: false });
  assert(!gate.ok && gate.code === 'TENANT_HOST_MISMATCH', 'B cannot login on A domain');

  const gateOk = assertLoginAllowedForHost(afterVerify, churchIdA, { isSuperadmin: false });
  assert(gateOk.ok, 'A can login on A domain');

  // Public API
  const apiUnknown = await request('GET', '/tenant/resolve?host=nope.invalid');
  assert(apiUnknown.status === 404 && apiUnknown.body.resolved === false, 'API unknown host 404');

  const apiPlatform = await request('GET', '/tenant/resolve?host=localhost');
  assert(
    apiPlatform.status === 200 && apiPlatform.body.resolved === false,
    'API localhost is platform hub'
  );

  const apiSub = await request('GET', `/tenant/resolve?host=doma${stamp}.cms.test`);
  assert(apiSub.status === 200 && apiSub.body.resolved === true, 'API subdomain resolve');
  assert(Number(apiSub.body.church.id) === Number(churchIdA), 'API subdomain church A');

  const apiCustom = await request('GET', `/tenant/resolve?host=${customHost}`);
  assert(apiCustom.status === 200 && Number(apiCustom.body.church.id) === Number(churchIdA), 'API custom domain');

  // Login via Host header constraint
  const loginWrong = await request(
    'POST',
    '/auth/login',
    { email: `dom-b-${stamp}@test.local`, password: 'SecurePass1' },
    null,
    { Host: customHost, 'X-Forwarded-Host': customHost }
  );
  // Note: Node http client may not send custom Host to 127.0.0.1 the same way;
  // X-Forwarded-Host is what middleware reads first.
  assert(
    loginWrong.status === 403 && loginWrong.body.code === 'TENANT_HOST_MISMATCH',
    `Cross-tenant login blocked on custom host (${loginWrong.status})`
  );

  const loginOk = await request(
    'POST',
    '/auth/login',
    { email: `dom-a-${stamp}@test.local`, password: 'SecurePass1' },
    null,
    { 'X-Forwarded-Host': customHost }
  );
  assert(loginOk.status === 200 && loginOk.body.token, 'Matching tenant login on custom host');

  // Mapping fields present
  const row = await db.getAsync('SELECT * FROM church_domains WHERE id = ?', [pending.id]);
  assert(row.church_id && row.domain && row.verification_status && row.ssl_status != null, 'mapping columns');
  assert(row.is_primary === 1 && row.created_at, 'primary + created_at');

  if (prevPlatform === undefined) delete process.env.PLATFORM_DOMAIN;
  else process.env.PLATFORM_DOMAIN = prevPlatform;

  console.log('\nPhase 40 custom domains tests passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
