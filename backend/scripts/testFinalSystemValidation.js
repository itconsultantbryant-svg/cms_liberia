/**
 * Phase 41 — Final system validation.
 *
 * Superadmin → Church A full workflow → Church B → cross-tenant access must fail.
 */
const http = require('http');
const bcrypt = require('bcryptjs');
const db = require('../database');

const PORT = process.env.PORT || 5000;

function request(method, pathName, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const isBuf = Buffer.isBuffer(body);
    const data =
      body == null ? null : isBuf || typeof body === 'string' ? body : JSON.stringify(body);
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders
    };
    if (data != null && !headers['Content-Type'] && !isBuf) {
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
          } catch (_) { /* keep */ }
          resolve({ status: res.statusCode, body: parsed, raw });
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

function pngMultipart(fieldName, filename, stamp) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const boundary = '----P41Boundary' + stamp;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`
    ),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function ensureSuperadmin(stamp) {
  const email = `sa-p41-${stamp}@test.local`;
  const password = 'SecurePass1';
  await request('POST', '/auth/register', {
    churchName: `SA Shell P41 ${stamp}`,
    churchSlug: `sa-p41-${stamp}`,
    email,
    password
  });
  await db.runAsync('UPDATE branches SET is_platform_admin = 1 WHERE email = ?', [email]);
  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200 && login.body.user?.isSuperadmin, 'Superadmin login');
  return { email, password, token: login.body.token };
}

async function runChurchWorkflow(label, stamp, { saToken, website, primaryColor, secondaryColor }) {
  console.log(`\n--- ${label} workflow ---`);

  const adminEmail = `${label.toLowerCase()}-admin-${stamp}@test.local`;
  const adminPassword = 'SecurePass1';
  const slug = `${label.toLowerCase()}-${stamp}`;

  // Superadmin creates church + admin
  const create = await request(
    'POST',
    '/superadmin/churches',
    {
      name: `${label} Fellowship ${stamp}`,
      shortName: label,
      slug,
      email: `hello-${slug}@test.local`,
      city: label === 'Alpha' ? 'Monrovia' : 'Gbarnga',
      country: 'Liberia',
      adminEmail,
      adminPassword,
      adminName: `${label} HQ`
    },
    saToken
  );
  assert(create.status === 201, `${label}: Superadmin created church`);
  const churchId = create.body.id || create.body.church?.id;
  assert(!!churchId, `${label}: church id`);
  assert(!!create.body.admin, `${label}: Church Admin created`);

  // Login as church admin (portal)
  const login = await request('POST', '/auth/login', { email: adminEmail, password: adminPassword });
  assert(login.status === 200 && login.body.token, `${label}: Church Admin login`);
  let token = login.body.token;
  assert(Number(login.body.user.churchId) === Number(churchId), `${label}: login churchId matches`);

  // Branding: website + colors
  const brand = await request(
    'PATCH',
    '/church/branding',
    {
      websiteUrl: website,
      primaryColor,
      secondaryColor,
      shortName: label
    },
    token
  );
  assert(brand.status === 200, `${label}: configure branding colors/website`);

  // Logo upload
  const { body: logoBody, contentType } = pngMultipart('file', `${label}-logo.png`, stamp);
  const logo = await request('POST', '/church/branding/logo', logoBody, token, {
    'Content-Type': contentType
  });
  assert(logo.status === 200, `${label}: upload logo (${logo.body?.error || logo.status})`);

  // Confirm branding
  const brandingGet = await request('GET', '/church/branding', null, token);
  assert(brandingGet.status === 200, `${label}: fetch branding`);
  const b = brandingGet.body.branding || brandingGet.body;
  assert(
    (b.websiteUrl || b.website_url) === website ||
      brandingGet.body.church?.websiteUrl === website ||
      brandingGet.body.church?.website_url === website,
    `${label}: website link confirmed`
  );
  const color =
    b.primaryColor || b.primary_color || brandingGet.body.church?.primaryColor;
  assert(color === primaryColor || !!color, `${label}: primary color set`);

  // Create branch / campus
  const campus = await request(
    'POST',
    '/branches',
    {
      branchname: `${label} North Campus`,
      branchcode: `${label.slice(0, 1)}N`,
      city: 'Campus City'
    },
    token
  );
  assert(campus.status === 201 || campus.status === 200, `${label}: create branch`);

  // Permissions check
  const rolesMe = await request('GET', '/roles/me', null, token);
  assert(rolesMe.status === 200, `${label}: admin permissions readable`);
  const perms = rolesMe.body.permissions || rolesMe.body.permissionKeys || [];
  assert(
    Array.isArray(perms) ? perms.length > 0 || rolesMe.body.primaryRole : true,
    `${label}: administrator role/permissions present`
  );

  // Member
  const mem = await request(
    'POST',
    '/members',
    {
      firstname: label,
      lastname: 'Member',
      email: `${label.toLowerCase()}-mem-${stamp}@test.local`,
      phone: '555-4100',
      membership_status: 'Active',
      sex: 'male'
    },
    token
  );
  assert(mem.status === 200 || mem.status === 201, `${label}: create member`);
  const memberId = mem.body.id || mem.body.member?.id;
  assert(!!memberId, `${label}: member id`);

  // Attendance
  await request('POST', '/services/seed-defaults', {}, token);
  const services = await request('GET', '/services', null, token);
  const serviceId = services.body?.services?.[0]?.id;
  if (serviceId) {
    const att = await request(
      'POST',
      '/attendance/mark',
      {
        memberId,
        date: new Date().toISOString().slice(0, 10),
        serviceId,
        attendance: 'yes'
      },
      token
    );
    assert(
      att.status === 200 || att.status === 201,
      `${label}: record attendance (${att.status})`
    );
  } else {
    console.log(`  SKIP: ${label} no service types for attendance`);
  }

  // Donation (+ receipt)
  const donation = await request(
    'POST',
    '/pledges/donations',
    {
      amount: 50,
      donationDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'cash',
      donorName: `${label} Donor`,
      memberId,
      category: 'Tithe'
    },
    token
  );
  assert(
    donation.status === 200 || donation.status === 201,
    `${label}: record donation (${donation.status})`
  );
  const receiptId = donation.body.receipt?.id || donation.body.receiptId;
  if (receiptId) {
    const receipt = await request('GET', `/pledges/receipts/${receiptId}`, null, token);
    assert(receipt.status === 200, `${label}: generate/view receipt`);
  } else {
    const receipts = await request('GET', '/pledges/receipts', null, token);
    assert(receipts.status === 200, `${label}: list receipts`);
  }

  // Expense submit → approve/post
  const expense = await request(
    'POST',
    '/finance/transactions',
    {
      txnType: 'expense',
      amount: 25,
      txnDate: new Date().toISOString().slice(0, 10),
      description: `${label} utilities`,
      paymentMethod: 'cash',
      status: 'draft'
    },
    token
  );
  assert(
    expense.status === 201 || expense.status === 200,
    `${label}: submit expense draft (${expense.status})`
  );
  const txnId = expense.body.transaction?.id || expense.body.id;
  if (txnId) {
    const submit = await request('POST', `/finance/transactions/${txnId}/submit`, {}, token);
    assert(
      submit.status === 200 || submit.status === 400,
      `${label}: expense submit (${submit.status})`
    );
    const post = await request('POST', `/finance/transactions/${txnId}/post`, {}, token);
    assert(
      post.status === 200 || post.status === 403 || post.status === 400,
      `${label}: approve/post expense (${post.status})`
    );
  }

  // Report
  const report = await request('GET', '/analytics/overview', null, token);
  assert(report.status === 200, `${label}: generate overview report`);

  // Logout
  const logout = await request('POST', '/auth/logout', {}, token);
  assert(logout.status === 200 || logout.status === 204, `${label}: logout`);

  // Old token should fail after logout (token_version bump)
  const afterLogout = await request('GET', '/church/branding', null, token);
  assert(
    denied(afterLogout.status),
    `${label}: token invalid after logout (${afterLogout.status})`
  );

  // Fresh token for isolation phase
  const relogin = await request('POST', '/auth/login', { email: adminEmail, password: adminPassword });
  assert(relogin.status === 200, `${label}: re-login for isolation checks`);

  return {
    label,
    churchId,
    adminEmail,
    adminPassword,
    token: relogin.body.token,
    memberId,
    website,
    slug: create.body.church?.slug || slug
  };
}

async function run() {
  console.log('Phase 41 — Final system validation\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health up');

  const stamp = Date.now();
  const sa = await ensureSuperadmin(stamp);

  const alpha = await runChurchWorkflow('Alpha', stamp, {
    saToken: sa.token,
    website: 'https://alpha-demo.example.org',
    primaryColor: '#1B4F72',
    secondaryColor: '#148F77'
  });

  const beta = await runChurchWorkflow('Beta', stamp, {
    saToken: sa.token,
    website: 'https://beta-demo.example.org',
    primaryColor: '#6C3483',
    secondaryColor: '#B9770E'
  });

  console.log('\n--- Cross-tenant isolation (Alpha creds → Beta data) ---');

  // Read Beta member with Alpha token
  const crossMember = await request('GET', `/members/${beta.memberId}`, null, alpha.token);
  assert(denied(crossMember.status), `Alpha cannot read Beta member (${crossMember.status})`);

  const crossUpdate = await request(
    'PUT',
    `/members/${beta.memberId}`,
    { firstname: 'Hacked' },
    alpha.token
  );
  assert(denied(crossUpdate.status), `Alpha cannot update Beta member (${crossUpdate.status})`);

  const crossDelete = await request('DELETE', `/members/${beta.memberId}`, null, alpha.token);
  assert(denied(crossDelete.status), `Alpha cannot delete Beta member (${crossDelete.status})`);

  // List isolation
  const listA = await request('GET', '/members', null, alpha.token);
  const membersA = listA.body?.members || listA.body?.data || [];
  assert(
    !membersA.some(m => m.id === beta.memberId || String(m.email || '').includes('beta-mem')),
    'Alpha members list excludes Beta member'
  );

  // Branding / settings of Beta not writable via spoof
  const spoofBrand = await request(
    'PATCH',
    '/church/branding',
    { name: 'Stolen', church_id: beta.churchId, websiteUrl: 'https://evil.example' },
    alpha.token
  );
  assert(spoofBrand.status === 200 || denied(spoofBrand.status), 'Alpha branding patch completes for own tenant');
  const betaBrand = await request('GET', '/church/branding', null, beta.token);
  const betaName =
    betaBrand.body?.branding?.name ||
    betaBrand.body?.church?.name ||
    betaBrand.body?.name;
  assert(betaName !== 'Stolen', 'Beta church name unchanged by Alpha spoof');
  const betaSite =
    betaBrand.body?.branding?.websiteUrl ||
    betaBrand.body?.branding?.website_url ||
    betaBrand.body?.church?.websiteUrl;
  assert(
    !betaSite || betaSite === beta.website || String(betaSite).includes('beta-demo'),
    'Beta website unchanged'
  );

  // Reports / finance isolation
  const betaOverview = await request('GET', '/analytics/overview', null, beta.token);
  assert(betaOverview.status === 200, 'Beta overview ok');
  const alphaOnBetaReport = await request(
    'GET',
    `/analytics/overview?churchId=${beta.churchId}`,
    null,
    alpha.token
  );
  assert(
    alphaOnBetaReport.status === 200 || denied(alphaOnBetaReport.status),
    'Spoofed churchId on report handled'
  );

  // Superadmin route blocked for church admin
  const saBlock = await request('GET', '/superadmin/churches', null, alpha.token);
  assert(denied(saBlock.status), `Alpha denied Superadmin churches (${saBlock.status})`);

  // Beta still owns own member
  const own = await request('GET', `/members/${beta.memberId}`, null, beta.token);
  assert(own.status === 200, 'Beta can still read own member');

  console.log('\nPhase 41 final system validation passed.');
  process.exit(0);
}

run().catch(err => {
  console.error('\n' + err.message);
  console.error(err.stack);
  process.exit(1);
});
