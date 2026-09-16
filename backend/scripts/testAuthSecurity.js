/**
 * Phase 2 auth security tests against running API.
 * Usage: AUTH_DEBUG_RESET=1 node scripts/testAuthSecurity.js
 * (Server should allow debug reset tokens in non-production.)
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
          } catch (_) { /* keep string */ }
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
  console.log('Phase 2 auth security test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `auth-sec-${stamp}@test.local`;
  const password = 'SecurePass1';
  const newPassword = 'SecurePass2';

  const reg = await request('POST', '/auth/register', {
    churchName: `Auth Church ${stamp}`,
    churchSlug: `auth-sec-${stamp}`,
    branchname: `Auth HQ ${stamp}`,
    email,
    password
  });
  assert(reg.status === 200, `Register church (${reg.status})`);

  const shortPw = await request('POST', '/auth/register', {
    churchName: `Short ${stamp}`,
    churchSlug: `short-${stamp}`,
    email: `short-${stamp}@test.local`,
    password: 'short'
  });
  assert(shortPw.status === 400, 'Reject short password on register');

  const badLogin = await request('POST', '/auth/login', { email, password: 'wrong-password' });
  assert(badLogin.status === 401 || badLogin.status === 403, 'Bad password rejected');

  // Lockout: 4 more failures (1 already) => 5 total
  let locked = false;
  for (let i = 0; i < 5; i++) {
    const r = await request('POST', '/auth/login', { email, password: 'wrong-password' });
    if (r.status === 403 && (r.body?.lockedUntil || String(r.body?.error || '').includes('locked'))) {
      locked = true;
      break;
    }
  }
  assert(locked, 'Account locks after repeated failures');

  // Clear lock via DB would be needed to login; use reset-password path instead
  const forgot = await request('POST', '/auth/forgot-password', { email });
  assert(forgot.status === 200, 'Forgot password returns 200');
  assert(forgot.body?.message, 'Forgot password has generic message');
  assert(forgot.body?.resetToken, 'Debug reset token returned (non-production)');

  const reset = await request('POST', '/auth/reset-password', {
    token: forgot.body.resetToken,
    newPassword
  });
  assert(reset.status === 200, 'Reset password succeeds');

  const login = await request('POST', '/auth/login', { email, password: newPassword });
  assert(login.status === 200 && login.body?.token, 'Login after reset succeeds');
  assert(login.body.user?.mfaEnabled === false, '/login exposes mfaEnabled false');

  const token = login.body.token;
  const me = await request('GET', '/auth/me', null, token);
  assert(me.status === 200, '/me works with new token');
  assert(me.body.user?.mfaEnabled === false, '/me exposes mfaEnabled readiness');

  const change = await request(
    'POST',
    '/auth/change-password',
    { currentPassword: newPassword, newPassword: 'SecurePass3' },
    token
  );
  assert(change.status === 200 && change.body?.token, 'Change password returns new token');

  const oldMe = await request('GET', '/auth/me', null, token);
  assert(oldMe.status === 401, 'Old JWT rejected after password change');

  const newToken = change.body.token;
  const me2 = await request('GET', '/auth/me', null, newToken);
  assert(me2.status === 200, 'New JWT works after password change');

  const logout = await request('POST', '/auth/logout', {}, newToken);
  assert(logout.status === 200, 'Logout succeeds');

  const afterLogout = await request('GET', '/auth/me', null, newToken);
  assert(afterLogout.status === 401, 'JWT rejected after logout (token_version bump)');

  console.log('\nAll auth security checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
