/**
 * Phase 20 staff & user management tests.
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
  console.log('Phase 20 staff & users test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `staffu-${stamp}@test.local`;
  const password = 'SecurePass1';

  await request('POST', '/auth/register', {
    churchName: `Staff Users Church ${stamp}`,
    churchSlug: `su-${stamp}`,
    email,
    password
  });
  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const meta = await request('GET', '/users/meta', null, token);
  assert(meta.status === 200 && meta.body.statuses.includes('invited'), 'User meta');

  const invite = await request(
    'POST',
    '/users/invite',
    {
      firstname: 'Invited',
      lastname: `User${stamp}`,
      email: `inv-${stamp}@test.local`,
      phone: '555-9999',
      jobTitle: 'Secretary',
      roleCode: 'SECRETARY',
      accountType: 'branch'
    },
    token
  );
  assert(invite.status === 201 && invite.body.userId, 'Invite user');
  assert(invite.body.temporaryPassword, 'Temp password issued');
  const invitedId = invite.body.userId;

  const dir = await request('GET', '/users/directory', null, token);
  assert(dir.status === 200, 'Directory');
  const invited = (dir.body.users || []).find(u => u.id === invitedId && u.accountType === 'branch');
  assert(invited && invited.status === 'invited', 'Invited status in directory');

  const badLogin = await request('POST', '/auth/login', {
    email: `inv-${stamp}@test.local`,
    password: invite.body.temporaryPassword
  });
  // invited has is_login_enabled=0 — may 401/403
  assert(badLogin.status !== 200 || badLogin.body.error, 'Invited cannot login until activated');

  const activate = await request('POST', `/users/${invitedId}/activate`, { accountType: 'branch' }, token);
  assert(activate.status === 200, 'Activate invited user');

  const okLogin = await request('POST', '/auth/login', {
    email: `inv-${stamp}@test.local`,
    password: invite.body.temporaryPassword
  });
  assert(okLogin.status === 200, 'Activated user can login');

  const suspend = await request('POST', `/users/${invitedId}/suspend`, { accountType: 'branch' }, token);
  assert(suspend.status === 200, 'Suspend user');

  const suspendedLogin = await request('POST', '/auth/login', {
    email: `inv-${stamp}@test.local`,
    password: invite.body.temporaryPassword
  });
  assert(suspendedLogin.status !== 200, 'Suspended cannot login');

  const reset = await request(
    'POST',
    `/users/${invitedId}/reset-access`,
    { accountType: 'branch' },
    token
  );
  assert(reset.status === 200 && reset.body.temporaryPassword, 'Reset access');

  await request('POST', `/users/${invitedId}/activate`, { accountType: 'branch' }, token);
  const afterReset = await request('POST', '/auth/login', {
    email: `inv-${stamp}@test.local`,
    password: reset.body.temporaryPassword
  });
  assert(afterReset.status === 200, 'Login with reset password');

  const role = await request(
    'PUT',
    `/users/${invitedId}/role`,
    { roleCode: 'BRANCH_SECRETARY', permissions: ['view_dashboard', 'view_members'] },
    token
  );
  assert(role.status === 200, 'Assign role');

  const staff = await request(
    'POST',
    '/staff',
    {
      firstname: 'Staff',
      lastname: `Person${stamp}`,
      email: `staffp-${stamp}@test.local`,
      phone: '555-0001',
      position: 'Administrator',
      job_title: 'Office Admin'
    },
    token
  );
  assert(staff.status === 200 || staff.status === 201, 'Create staff');
  const staffId = staff.body.staffId;

  const staffList = await request('GET', '/staff', null, token);
  assert(
    (Array.isArray(staffList.body) ? staffList.body : []).some(s => s.id === staffId),
    'Staff listed'
  );

  const staffSuspend = await request('POST', `/staff/${staffId}/suspend`, {}, token);
  assert(staffSuspend.status === 200, 'Suspend staff');

  const staffActivate = await request('POST', `/staff/${staffId}/activate`, {}, token);
  assert(staffActivate.status === 200, 'Activate staff');

  const subInvite = await request(
    'POST',
    '/users/invite',
    {
      firstname: 'Sub',
      lastname: `Clerk${stamp}`,
      email: `sub-${stamp}@test.local`,
      jobTitle: 'Data Clerk',
      accountType: 'sub_user',
      permissions: ['add_members', 'view_dashboard']
    },
    token
  );
  assert(subInvite.status === 201, 'Invite sub-user');

  const dir2 = await request('GET', '/users/directory', null, token);
  assert(
    (dir2.body.users || []).some(u => u.accountType === 'sub_user' && u.email === `sub-${stamp}@test.local`),
    'Sub-user in directory'
  );

  console.log('\nAll Phase 20 staff & users checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
