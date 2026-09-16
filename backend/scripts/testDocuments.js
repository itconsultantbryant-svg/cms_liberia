/**
 * Phase 21 document library tests.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5000;

function request(method, pathName, body, token, isMultipart) {
  return new Promise((resolve, reject) => {
    let data = null;
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    if (isMultipart && body) {
      data = body.buffer;
      headers['Content-Type'] = `multipart/form-data; boundary=${body.boundary}`;
      headers['Content-Length'] = data.length;
    } else if (body) {
      data = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api${pathName}`,
        method,
        headers
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

function multipart(fields, fileField, filename, content) {
  const boundary = '----FormBoundary' + Date.now();
  const chunks = [];
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    );
  }
  chunks.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n`
  );
  const head = Buffer.from(chunks.join(''), 'utf8');
  const mid = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return { boundary, buffer: Buffer.concat([head, mid, tail]) };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

async function run() {
  console.log('Phase 21 documents test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `doc-${stamp}@test.local`;
  const password = 'SecurePass1';

  await request('POST', '/auth/register', {
    churchName: `Docs Church ${stamp}`,
    churchSlug: `doc-${stamp}`,
    email,
    password
  });
  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const meta = await request('GET', '/documents/meta', null, token);
  assert(meta.status === 200 && meta.body.categoryCodes.includes('policies'), 'Meta categories');

  const upload = await request(
    'POST',
    '/documents',
    multipart(
      {
        title: `Policy ${stamp}`,
        category: 'policies',
        description: 'Staff handbook',
        visibility: 'church'
      },
      'file',
      'policy.txt',
      'Version 1 policy content'
    ),
    token,
    true
  );
  assert(upload.status === 201 && upload.body.id, 'Upload document');
  const id = upload.body.id;
  assert(upload.body.document.current_version === 1, 'Version 1');

  const list = await request('GET', '/documents?category=policies', null, token);
  assert((list.body.documents || []).some(d => d.id === id), 'Listed by category');

  const detail = await request('GET', `/documents/${id}`, null, token);
  assert(detail.status === 200 && (detail.body.versions || []).length === 1, 'Detail + versions');

  const v2 = await request(
    'POST',
    `/documents/${id}/versions`,
    multipart({ notes: 'Revision' }, 'file', 'policy-v2.txt', 'Version 2 policy content'),
    token,
    true
  );
  assert(v2.status === 201 && v2.body.version === 2, 'Upload version 2');

  const detail2 = await request('GET', `/documents/${id}`, null, token);
  assert(detail2.body.document.current_version === 2, 'Current version updated');
  assert((detail2.body.versions || []).length === 2, 'Two versions stored');

  const fin = await request(
    'POST',
    '/documents',
    multipart(
      { title: `Budget ${stamp}`, category: 'financial', visibility: 'restricted' },
      'file',
      'budget.txt',
      'confidential numbers'
    ),
    token,
    true
  );
  assert(fin.status === 201, 'Upload financial doc');

  const patch = await request(
    'PATCH',
    `/documents/${id}`,
    { description: 'Updated handbook', visibility: 'branch' },
    token
  );
  assert(patch.status === 200, 'Patch metadata');

  const archive = await request('DELETE', `/documents/${id}`, null, token);
  assert(archive.status === 200, 'Archive document');

  const listAfter = await request('GET', '/documents?category=policies', null, token);
  assert(!(listAfter.body.documents || []).some(d => d.id === id), 'Archived hidden from list');

  // File exists on disk
  const fname = detail2.body.document.filename;
  const disk = path.join(__dirname, '../uploads/documents', fname);
  assert(fs.existsSync(disk), 'File stored under uploads/documents');

  console.log('\nAll Phase 21 documents checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
