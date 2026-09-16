/**
 * Phase 30 dashboard personalization tests.
 */
const http = require('http');
const { resolvePersona } = require('../utils/dashboardPersonalization');

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
  console.log('Phase 30 dashboard personalization test\n');

  // Unit: persona resolution
  assert(
    resolvePersona({ isSuperadmin: true }).id === 'superadmin',
    'Superadmin persona'
  );
  assert(
    resolvePersona({ isadmin: true }, { role_code: 'PRESIDENT' }).id === 'church_admin',
    'Church admin persona'
  );
  assert(
    resolvePersona({}, { role_code: 'FINANCE_OFFICER' }, ['manage_finance']).id === 'finance',
    'Finance persona'
  );
  assert(
    resolvePersona({}, { role_code: 'RESIDENT_PASTOR' }, ['pastor_dashboard']).id === 'pastor',
    'Pastor persona'
  );
  assert(
    resolvePersona({}, { role_code: 'SECRETARY' }, ['view_members']).id === 'membership',
    'Membership persona'
  );
  assert(
    resolvePersona({ userType: 'sub_user' }, null, ['view_dashboard']).id === 'secretary',
    'Sub-user secretary persona'
  );

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `dash-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Dash Church ${stamp}`,
    churchSlug: `dash-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200 || reg.status === 201, 'Register church');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200 && login.body.token, 'Login church admin');
  const token = login.body.token;

  const persona = await request('GET', '/dashboard/persona', null, token);
  assert(persona.status === 200, 'GET persona');
  assert(persona.body.persona?.id === 'church_admin', 'Registered admin is church_admin');

  const personalized = await request('GET', '/dashboard/personalized', null, token);
  assert(personalized.status === 200, 'GET personalized');
  assert(Array.isArray(personalized.body.widgets), 'Widgets array');
  assert(personalized.body.widgets.length > 0, 'Has role widgets');
  assert(personalized.body.scopeMeta?.scope === 'church', 'Church-wide scope for admin');

  const hideId = personalized.body.widgets[0].id;
  const prefs = await request(
    'PATCH',
    '/dashboard/preferences',
    { hiddenWidgets: [hideId], widgetOrder: personalized.body.allWidgets.map(w => w.id) },
    token
  );
  assert(prefs.status === 200, 'PATCH preferences');
  assert((prefs.body.preferences?.hiddenWidgets || []).includes(hideId), 'Hidden widget saved');

  const again = await request('GET', '/dashboard/personalized', null, token);
  assert(
    !(again.body.widgets || []).some(w => w.id === hideId),
    'Hidden widget omitted from personalized view'
  );

  // Superadmin platform persona
  const saLogin = await request('POST', '/auth/login', {
    email: 'platform@cms.local',
    password: 'SuperAdmin1!'
  });
  assert(saLogin.status === 200 && saLogin.body.user?.isSuperadmin, 'Superadmin login');
  const saPersona = await request('GET', '/dashboard/persona', null, saLogin.body.token);
  assert(saPersona.body.persona?.id === 'superadmin', 'Superadmin persona from API');

  console.log('\nAll Phase 30 dashboard checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
