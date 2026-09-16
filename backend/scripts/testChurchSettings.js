/**
 * Phase 28 church settings tests.
 */
const http = require('http');

const PORT = process.env.PORT || 5000;

function request(method, pathName, body, token) {
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
  console.log('Phase 28 church settings test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `settings-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Settings Church ${stamp}`,
    churchSlug: `settings-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200 || reg.status === 201, 'Register church');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200 && login.body.token, 'Login as church admin');
  const token = login.body.token;

  const get = await request('GET', '/church/settings', null, token);
  assert(get.status === 200 && get.body.church && get.body.settings, 'GET church settings');
  assert(get.body.settings.fiscalYearStartMonth >= 1, 'Has fiscal year month');
  assert(Array.isArray(get.body.meta?.dateFormats), 'Exposes date formats');

  const patch = await request(
    'PATCH',
    '/church/settings',
    {
      currency: 'LRD',
      fiscalYearStartMonth: 7,
      dateFormat: 'DD/MM/YYYY',
      membershipNumberPrefix: 'MEM',
      membershipNumberPadding: 4,
      membershipNumberNext: 10,
      receiptNumberPrefix: 'RCPT',
      receiptNumberIncludeYear: true,
      notifyBirthdays: false
    },
    token
  );
  assert(patch.status === 200, 'PATCH church settings');
  assert(patch.body.church?.currency === 'LRD', 'Currency saved');
  assert(patch.body.settings?.fiscalYearStartMonth === 7, 'Fiscal year saved');
  assert(patch.body.settings?.dateFormat === 'DD/MM/YYYY', 'Date format saved');
  assert(patch.body.settings?.membershipNumberPrefix === 'MEM', 'Membership prefix saved');
  assert(patch.body.settings?.notifyBirthdays === false, 'Notify birthday pref saved');

  const badFormat = await request(
    'PATCH',
    '/church/settings',
    { dateFormat: 'INVALID' },
    token
  );
  assert(badFormat.status === 400, 'Reject invalid date format');

  // Membership number uses settings allocator
  const member = await request(
    'POST',
    '/members',
    {
      firstname: 'Settings',
      lastname: 'Member',
      email: `mem-${stamp}@test.local`
    },
    token
  );
  assert(member.status === 201 || member.status === 200, 'Create member');
  const mid =
    member.body.member?.membership_id ||
    member.body.membership_id ||
    member.body.member?.membershipId;
  assert(mid && String(mid).startsWith('MEM'), `Membership id uses prefix (${mid})`);
  assert(String(mid).includes('0010') || String(mid).endsWith('10') || /MEM0*10/.test(String(mid)), `Membership seq from settings (${mid})`);

  // Superadmin lock
  const saLogin = await request('POST', '/auth/login', {
    email: 'platform@cms.local',
    password: 'SuperAdmin1!'
  });
  assert(saLogin.status === 200 && saLogin.body.user?.isSuperadmin, 'Superadmin login');
  const saToken = saLogin.body.token;
  const churchId = get.body.church.id;

  const lock = await request(
    'PATCH',
    `/superadmin/churches/${churchId}/settings`,
    { lockedFields: ['currency', 'fiscal_year_start_month'] },
    saToken
  );
  assert(lock.status === 200, 'Superadmin lock fields');
  assert(
    (lock.body.settings?.lockedFields || []).includes('currency'),
    'currency is locked'
  );

  const blocked = await request(
    'PATCH',
    '/church/settings',
    { currency: 'USD' },
    token
  );
  assert(blocked.status === 403, 'Church admin cannot change locked currency');

  const unlock = await request(
    'PATCH',
    `/superadmin/churches/${churchId}/settings`,
    { lockedFields: [], currency: 'USD' },
    saToken
  );
  assert(unlock.status === 200 && unlock.body.church?.currency === 'USD', 'Superadmin can override locked currency');

  console.log('\nAll Phase 28 settings checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
