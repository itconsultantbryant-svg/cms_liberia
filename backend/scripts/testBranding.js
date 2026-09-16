/**
 * Phase 4 church branding tests.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5000;

function request(method, pathName, body, token, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body && !Buffer.isBuffer(body) && typeof body !== 'string'
      ? JSON.stringify(body)
      : body;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api${pathName}`,
        method,
        headers: {
          ...(data && !headers['Content-Type'] && !Buffer.isBuffer(data)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data
            ? { 'Content-Length': Buffer.byteLength(data) }
            : {}),
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
  console.log('Phase 4 branding test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `brand-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Brand Church ${stamp}`,
    churchSlug: `brand-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200, 'Register church');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200 && login.body.token, 'Login');
  assert(login.body.user?.church?.primaryColor, 'Login includes church primaryColor');
  const token = login.body.token;

  const get = await request('GET', '/church/branding', null, token);
  assert(get.status === 200 && get.body.branding, 'GET branding');

  const patch = await request(
    'PATCH',
    '/church/branding',
    {
      name: `Renamed Brand ${stamp}`,
      shortName: 'RB',
      primaryColor: '#1a5f2a',
      secondaryColor: '#e67e22'
    },
    token
  );
  assert(patch.status === 200, 'PATCH branding');
  assert(patch.body.branding?.primaryColor === '#1a5f2a', 'Primary color saved');
  assert(patch.body.branding?.secondaryColor === '#e67e22', 'Secondary color saved');

  const badColor = await request(
    'PATCH',
    '/church/branding',
    { primaryColor: 'not-a-color' },
    token
  );
  assert(badColor.status === 400, 'Reject invalid color');

  // Minimal 1x1 PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const boundary = '----BrandBoundary' + stamp;
  const multipart = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`
    ),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const upload = await request('POST', '/church/branding/logo', multipart, token, {
    'Content-Type': `multipart/form-data; boundary=${boundary}`
  });
  assert(upload.status === 200 && upload.body.url, 'Upload logo');
  assert(
    String(upload.body.url).includes('/api/files/signed/') ||
      String(upload.body.url).includes('/uploads/branding/'),
    'Logo URL is signed or legacy branding path'
  );
  assert(upload.body.fileId, 'Upload returns stored fileId');

  const fileGet = await request('GET', `/files/${upload.body.fileId}`, null, token);
  assert(fileGet.status === 200, 'Authorized file download');

  const cross = await request('POST', '/auth/register', {
    churchName: `Brand Cross ${stamp}`,
    churchSlug: `brand-cross-${stamp}`,
    email: `brand-cross-${stamp}@test.local`,
    password
  });
  const loginCross = await request('POST', '/auth/login', {
    email: `brand-cross-${stamp}@test.local`,
    password
  });
  const steal = await request('GET', `/files/${upload.body.fileId}`, null, loginCross.body.token);
  assert(steal.status === 404 || steal.status === 403, 'Other tenant cannot download file');

  const me = await request('GET', '/auth/me', null, token);
  assert(me.status === 200, '/me after branding');
  assert(me.body.user?.church?.primaryColor === '#1a5f2a', '/me reflects new primary color');
  assert(me.body.user?.church?.name === `Renamed Brand ${stamp}`, '/me reflects new church name');

  // Tenant isolation: other church cannot see/update this branding via own token only
  const email2 = `brand2-${stamp}@test.local`;
  await request('POST', '/auth/register', {
    churchName: `Other ${stamp}`,
    churchSlug: `brand2-${stamp}`,
    email: email2,
    password
  });
  const login2 = await request('POST', '/auth/login', { email: email2, password });
  const otherGet = await request('GET', '/church/branding', null, login2.body.token);
  assert(otherGet.status === 200, 'Other church can get own branding');
  assert(otherGet.body.branding?.name !== `Renamed Brand ${stamp}`, 'Other church sees own name not A');

  console.log('\nAll branding checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
