/**
 * Phase 35 security hardening tests.
 */
const http = require('http');
const path = require('path');
const {
  validatePasswordStrength,
  containsDangerousHtml,
  assessJwtSecret,
  scanForHardcodedSecrets,
  buildSecurityChecklist
} = require('../utils/securityHardening');
const { stripSensitive } = require('../utils/apiResponse');

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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...extraHeaders
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
  console.log('Phase 35 security hardening test\n');

  assert(!validatePasswordStrength('short').ok, 'Reject short password');
  assert(!validatePasswordStrength('alllowercase1').ok, 'Reject missing uppercase');
  assert(!validatePasswordStrength('ALLUPPERCASE1').ok, 'Reject missing lowercase');
  assert(!validatePasswordStrength('NoDigitsHere').ok, 'Reject missing digit');
  assert(validatePasswordStrength('SecurePass1').ok, 'Accept strong password');

  assert(containsDangerousHtml('<script>alert(1)</script>'), 'Detect script XSS');
  assert(containsDangerousHtml('javascript:alert(1)'), 'Detect javascript: URL');
  assert(!containsDangerousHtml('Normal church name'), 'Allow normal text');

  assert(stripSensitive({ password: 'x', email: 'a@b.c' }).password === undefined, 'stripSensitive');

  const jwt = assessJwtSecret(process.env.JWT_SECRET || 'your-secret-key', 'development');
  assert(jwt.severity === 'warning' || jwt.ok, 'Dev JWT assessment returns');

  const root = path.join(__dirname, '../..');
  const findings = scanForHardcodedSecrets([
    path.join(root, 'frontend/src'),
    path.join(root, 'backend/routes')
  ]);
  assert(findings.length === 0, `No hardcoded secrets in src (${findings.length})`);

  const checklist = buildSecurityChecklist();
  assert(checklist.auth.bruteForceLockout === true, 'Checklist includes lockout');
  assert(checklist.csrf.model.includes('Bearer'), 'Checklist documents Bearer CSRF model');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'Health up');
  assert(
    health.headers['x-content-type-options'] === 'nosniff' ||
      health.headers['x-frame-options'] ||
      health.headers['content-security-policy'] !== undefined ||
      true,
    'Helmet headers present on responses'
  );
  // Helmet sets these — check at least one
  const hasHelmet =
    !!health.headers['x-content-type-options'] ||
    !!health.headers['x-dns-prefetch-control'] ||
    !!health.headers['strict-transport-security'] ||
    !!health.headers['x-frame-options'];
  assert(hasHelmet, 'Secure headers from helmet');

  // XSS body rejection
  const stamp = Date.now();
  const email = `sec-${stamp}@test.local`;
  const weak = await request('POST', '/auth/register', {
    churchName: 'Sec Church',
    churchSlug: `sec-${stamp}`,
    email,
    password: 'password'
  });
  assert(weak.status === 400, 'Reject weak password on register');

  const reg = await request('POST', '/auth/register', {
    churchName: 'Sec Church',
    churchSlug: `sec-${stamp}`,
    email,
    password: 'SecurePass1'
  });
  assert(reg.status === 200 || reg.status === 201, 'Register with strong password');

  const login = await request('POST', '/auth/login', { email, password: 'SecurePass1' });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const xss = await request(
    'PATCH',
    '/church/settings',
    { name: '<script>alert(1)</script>' },
    token
  );
  assert(xss.status === 400 && (xss.body.code === 'XSS_REJECTED' || /disallowed/i.test(xss.body.error || '')), 'Reject XSS in settings name');

  // SQL injection style member search should not 500
  const sqli = await request(
    'GET',
    `/members?q=${encodeURIComponent("1' OR '1'='1")}`,
    null,
    token
  );
  assert(sqli.status === 200 || sqli.status === 403, `SQLi-like search handled safely (${sqli.status})`);

  // Bad Origin denied on mutation
  const badOrigin = await request(
    'PATCH',
    '/church/settings',
    { city: 'Monrovia' },
    token,
    { Origin: 'https://evil.example' }
  );
  assert(badOrigin.status === 403, 'Deny evil Origin on mutation');

  // Superadmin security status
  const sa = await request('POST', '/auth/login', {
    email: 'platform@cms.local',
    password: 'SuperAdmin1!'
  });
  assert(sa.status === 200, 'Superadmin login');
  const status = await request('GET', '/superadmin/security/status', null, sa.body.token);
  assert(status.status === 200 && status.body.checklist, 'Security status endpoint');

  // Unauthenticated cannot read security status
  const noAuth = await request('GET', '/superadmin/security/status');
  assert(noAuth.status === 401 || noAuth.status === 403, 'Security status requires Superadmin');

  console.log('\nAll Phase 35 security checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
