/**
 * Phase 42 — Final UX validation (static + API unauthorized responses).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const root = path.join(__dirname, '../../frontend/src');
const PORT = process.env.PORT || 5000;

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

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

function collectLazyPages(appSrc) {
  const pages = [];
  const re = /lazy\(\(\)\s*=>\s*import\('(\.\/pages\/[^']+)'\)\)/g;
  let m;
  while ((m = re.exec(appSrc))) pages.push(m[1].replace('./pages/', 'pages/') + '.js');
  return pages;
}

async function run() {
  console.log('Phase 42 — Final UX validation\n');

  const app = read('App.js');
  const privateRoute = read('components/PrivateRoute.js');
  const layoutJs = read('components/Layout.js');
  const layoutCss = read('components/Layout.css');
  const members = read('pages/Members.js');
  const visitors = read('pages/Visitors.js');
  const documents = read('pages/Documents.js');
  const finance = read('pages/FinanceLedger.js');
  const events = read('pages/Events.js');
  const login = read('pages/Login.js');
  const perms = read('config/permissions.js');
  const theme = read('context/ThemeContext.js');

  // Broken pages — all lazy targets exist
  const lazyPages = collectLazyPages(app);
  assert(lazyPages.length >= 20, `App lazy-loads pages (${lazyPages.length})`);
  for (const p of lazyPages) {
    assert(exists(p), `Page exists: ${p}`);
  }
  assert(!exists('pages/SuperadminPlaceholder.js'), 'Dead SuperadminPlaceholder removed');

  // No dead placeholder stubs in live App
  assert(!/coming soon|not implemented|Phase 3 of the multi-tenant/i.test(app), 'App has no placeholder copy');
  assert(!/href="#"/.test(members + documents + events), 'No href="#" dead links in key pages');
  assert(!app.includes('SuperadminPlaceholder'), 'App does not reference removed placeholder');
  // Loading / duplicate submit prevention
  assert(login.includes('disabled={loading}'), 'Login disables submit while loading');
  assert(finance.includes('disabled={saving}') && finance.includes("Saving"), 'FinanceLedger submit disabled while saving');
  assert(events.includes('disabled={saving}') && events.includes('Creating'), 'Events submit disabled while saving');
  assert(read('pages/MemberForm.js').includes('disabled={saving}'), 'MemberForm has saving state');
  assert(read('pages/ChurchSettings.js').includes('disabled={saving}'), 'ChurchSettings has saving state');
  assert(read('pages/ChurchBranding.js').includes('disabled={saving}'), 'ChurchBranding has saving state');

  // Errors / success messages
  assert(finance.includes('setError') && finance.includes('setMessage'), 'FinanceLedger shows error/success');
  assert(events.includes('setError') && events.includes('setMessage'), 'Events shows error/success');
  assert(members.includes('setError') || members.includes('error'), 'Members error surface');

  // Empty states
  assert(members.includes('No members') && members.includes('/members/new'), 'Members empty state with CTA');
  assert(visitors.includes('No visitors yet'), 'Visitors useful empty state');
  assert(documents.includes('No documents yet'), 'Documents empty state');

  // Tables / mobile / scroll
  assert(layoutCss.includes('overflow-x: auto') && layoutCss.includes('.main-content'), 'Main content allows horizontal scroll containment');
  assert(layoutCss.includes('@media (max-width: 768px)'), 'Mobile breakpoint');
  assert(read('pages/Members.css').includes('overflow-x: auto'), 'Members table wrap scrolls on small screens');
  assert(documents.includes('members-table-wrap'), 'Documents table uses scroll wrap');

  // Pagination / search / filters / export
  assert(members.includes('pagination') && members.includes('exportCsv'), 'Members pagination + export');
  assert(members.includes('members-filters') || members.includes('setQ'), 'Members search/filters');

  // Branding tenant-specific
  assert(layoutJs.includes('user?.church?.logoUrl') || layoutJs.includes('user.church.logoUrl'), 'Layout tenant logo');
  assert(theme.includes('primaryColor') || theme.includes('primary_color') || theme.includes('--'), 'Theme applies church colors');
  assert(login.includes('/api/tenant/resolve'), 'Login resolves tenant branding from host');

  // Permission-controlled navigation
  assert(layoutJs.includes('canShowSidebarItem'), 'Sidebar permission filter');
  assert(perms.includes("'/members': 'view_members'") || perms.includes('view_members'), 'Sub-user members nav uses view_members');

  // Unauthorized route UX
  assert(privateRoute.includes('Access denied'), 'PrivateRoute shows Access denied UI');
  assert(privateRoute.includes('permission'), 'PrivateRoute supports permission prop');
  assert(app.includes('permission={') || app.includes('permission={['), 'Sensitive routes pass permission');

  // API unauthorized responses
  const health = await request('GET', '/health');
  assert(health.status === 200, 'API up for unauthorized checks');

  const unauthMembers = await request('GET', '/members');
  assert(unauthMembers.status === 401, `Unauth members → 401 (${unauthMembers.status})`);

  const unauthPastoral = await request('GET', '/pastoral');
  assert(
    unauthPastoral.status === 401 || unauthPastoral.status === 403,
    `Unauth pastoral → ${unauthPastoral.status}`
  );

  const stamp = Date.now();
  const reg = await request('POST', '/auth/register', {
    churchName: `UX Church ${stamp}`,
    churchSlug: `ux-${stamp}`,
    email: `ux-${stamp}@test.local`,
    password: 'SecurePass1'
  });
  assert(reg.status === 200 || reg.status === 201, 'Register for limited-user check');
  const loginRes = await request('POST', '/auth/login', {
    email: `ux-${stamp}@test.local`,
    password: 'SecurePass1'
  });
  const token = loginRes.body.token;
  assert(!!token, 'Login token');

  // Admin token can hit members; pastoral may still 403 without pastoral perm (sensitive)
  const pastoral = await request('GET', '/pastoral', null, token);
  assert(
    pastoral.status === 200 || pastoral.status === 403,
    `Pastoral returns understandable status (${pastoral.status})`
  );
  if (pastoral.status === 403) {
    assert(
      !!(pastoral.body?.error || pastoral.body?.message),
      '403 includes understandable error message'
    );
  }

  console.log('\nPhase 42 final UX validation passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
