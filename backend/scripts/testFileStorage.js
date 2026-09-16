/**
 * Phase 33 file storage tests.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  ensureChurchRoot,
  categoryDir,
  validateFileMeta,
  CHURCHES_ROOT
} = require('../utils/fileStorage');

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
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers
        }
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let parsed = buf.toString('utf8');
          try {
            parsed = JSON.parse(parsed);
          } catch (_) { /* binary or plain */ }
          resolve({ status: res.statusCode, body: parsed, raw: buf });
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
  console.log('Phase 33 file storage test\n');

  // Unit path layout
  const fakeChurch = 999001;
  ensureChurchRoot(fakeChurch);
  const branding = categoryDir(fakeChurch, 'branding');
  assert(branding.includes(path.join('churches', String(fakeChurch), 'branding')), 'Tenant branding path');
  assert(fs.existsSync(path.join(CHURCHES_ROOT, String(fakeChurch), 'documents')), 'Documents dir created');

  try {
    validateFileMeta('documents', {
      originalname: 'x.exe',
      mimetype: 'application/octet-stream',
      size: 10
    });
    assert(false, 'Should reject exe');
  } catch (e) {
    assert(e.code === 'FILE_EXTENSION', 'Reject invalid extension');
  }

  validateFileMeta('branding', {
    originalname: 'logo.png',
    mimetype: 'image/png',
    size: 100
  });
  console.log('  OK: Accept valid branding png');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health');

  const meta = await request('GET', '/files/meta');
  assert(meta.status === 200 && meta.body.success, 'GET /files/meta');
  assert((meta.body.data?.categories || []).includes('finance'), 'Categories include finance');

  const stamp = Date.now();
  const email = `files-${stamp}@test.local`;
  const password = 'SecurePass1';
  const reg = await request('POST', '/auth/register', {
    churchName: `Files Church ${stamp}`,
    churchSlug: `files-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200 || reg.status === 201, 'Register');
  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;
  const churchId = login.body.user.churchId || reg.body.churchId;

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const boundary = '----FileBoundary' + stamp;
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
  assert(upload.status === 200, `Upload branding (${upload.body?.error || upload.status})`);
  assert(upload.body.fileId, 'Has fileId');
  assert(String(upload.body.url).includes('/api/files/signed/'), 'Signed URL returned');

  const diskPath = path.join(CHURCHES_ROOT, String(churchId), 'branding');
  assert(fs.existsSync(diskPath), 'File landed under churches/{id}/branding');
  const filesOnDisk = fs.readdirSync(diskPath);
  assert(filesOnDisk.length > 0, 'Branding directory has files');

  // Direct static path blocked
  const blocked = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/uploads/churches/${churchId}/branding/${filesOnDisk[0]}`,
        method: 'GET'
      },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      }
    );
    req.on('error', reject);
    req.end();
  });
  assert(blocked.status === 403, 'Direct /uploads/churches access forbidden');

  const authDl = await request('GET', `/files/${upload.body.fileId}`, null, token);
  assert(authDl.status === 200, 'Auth download works');
  assert(Buffer.isBuffer(authDl.raw) && authDl.raw.length > 10, 'Download returns bytes');

  const signedPath = String(upload.body.url).replace(/^\/api/, '');
  const signed = await request('GET', signedPath);
  assert(signed.status === 200, 'Signed URL download works without auth');

  // Cross-tenant
  const email2 = `files2-${stamp}@test.local`;
  await request('POST', '/auth/register', {
    churchName: `Files2 ${stamp}`,
    churchSlug: `files2-${stamp}`,
    email: email2,
    password
  });
  const login2 = await request('POST', '/auth/login', { email: email2, password });
  const steal = await request('GET', `/files/${upload.body.fileId}`, null, login2.body.token);
  assert(steal.status === 404 || steal.status === 403, 'Cross-tenant file access denied');

  console.log('\nAll Phase 33 file storage checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
