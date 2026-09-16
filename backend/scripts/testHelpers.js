/**
 * Shared helpers for Phase 37 test scripts.
 */
const http = require('http');

const PORT = process.env.PORT || 5000;

function request(method, pathName, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data =
      body == null
        ? null
        : Buffer.isBuffer(body) || typeof body === 'string'
          ? body
          : JSON.stringify(body);
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders
    };
    if (data != null && !headers['Content-Type'] && !Buffer.isBuffer(data)) {
      headers['Content-Type'] = 'application/json';
    }
    if (data != null) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api${pathName}`,
        method,
        headers
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let parsed = raw.toString('utf8');
          try {
            parsed = JSON.parse(parsed);
          } catch (_) { /* keep string */ }
          resolve({ status: res.statusCode, body: parsed, raw, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (data != null) req.write(data);
    req.end();
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

function denied(status) {
  return status === 401 || status === 403 || status === 404;
}

async function registerChurch(prefix) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const email = `${prefix}-${stamp}@test.local`;
  const password = 'SecurePass1';
  const reg = await request('POST', '/auth/register', {
    churchName: `${prefix} Church ${stamp}`,
    churchSlug: `${prefix}-${stamp}`.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    email,
    password
  });
  if (!(reg.status === 200 || reg.status === 201)) {
    throw new Error(`Register failed (${reg.status}): ${JSON.stringify(reg.body)}`);
  }
  const login = await request('POST', '/auth/login', { email, password });
  if (login.status !== 200) {
    throw new Error(`Login failed (${login.status}): ${JSON.stringify(login.body)}`);
  }
  return {
    stamp,
    email,
    password,
    token: login.body.token,
    churchId: reg.body.churchId || login.body.user?.churchId,
    user: login.body.user,
    branchId: login.body.user?.branchId || login.body.user?.activeBranchId || login.body.user?.id
  };
}

async function inviteAndActivateBranchUser(adminToken, { email, firstname, lastname, roleCode }) {
  const invite = await request(
    'POST',
    '/users/invite',
    {
      firstname,
      lastname,
      email,
      roleCode: roleCode || 'SECRETARY',
      accountType: 'branch',
      jobTitle: 'Branch Staff'
    },
    adminToken
  );
  if (invite.status !== 201) {
    throw new Error(`Invite failed (${invite.status}): ${JSON.stringify(invite.body)}`);
  }
  const userId = invite.body.userId;
  const password = invite.body.temporaryPassword;
  const activate = await request(
    'POST',
    `/users/${userId}/activate`,
    { accountType: 'branch' },
    adminToken
  );
  if (activate.status !== 200) {
    throw new Error(`Activate failed (${activate.status}): ${JSON.stringify(activate.body)}`);
  }

  const login = await request('POST', '/auth/login', { email, password });
  if (login.status !== 200) {
    throw new Error(`Branch user login failed (${login.status}): ${JSON.stringify(login.body)}`);
  }
  return { userId, token: login.body.token, email, password, user: login.body.user };
}

module.exports = {
  PORT,
  request,
  assert,
  denied,
  registerChurch,
  inviteAndActivateBranchUser
};
