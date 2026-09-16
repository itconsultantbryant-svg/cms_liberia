/**
 * Phase 24 notification center tests.
 */
const http = require('http');
const db = require('../database');

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
  console.log('Phase 24 notifications test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `ntf-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Notify Church ${stamp}`,
    churchSlug: `ntf-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200 || reg.status === 201, `Register (${reg.status})`);

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200 && login.body.token, 'Login');
  const token = login.body.token;
  const userId = login.body.user.id;
  const churchId = login.body.user.churchId || login.body.user.church_id;

  const meta = await request('GET', '/notifications/meta', null, token);
  assert(meta.status === 200 && meta.body.types.includes('birthday'), 'Meta includes birthday type');

  // Seed birthday member (today, local YYYY-MM-DD)
  const now = new Date();
  const dob = `${now.getFullYear() - 30}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const branch = await db.getAsync('SELECT id FROM branches WHERE church_id = ? LIMIT 1', [churchId]);
  await db.runAsync(
    `INSERT INTO members (church_id, branch_id, firstname, lastname, email, dob, membership_status)
     VALUES (?, ?, 'Birthday', 'Person', ?, ?, 'Active')`,
    [churchId, branch.id, `bday-${stamp}@test.local`, dob]
  );

  // Seed upcoming event
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  const eventDate = tomorrow.toISOString().slice(0, 10);
  try {
    await db.runAsync(
      `INSERT INTO events (branch_id, church_id, title, date, time, location)
       VALUES (?, ?, 'Youth Night', ?, '18:00', 'Hall')`,
      [branch.id, churchId, eventDate]
    );
  } catch (_) {
    await db.runAsync(
      `INSERT INTO events (branch_id, title, date, time, location)
       VALUES (?, 'Youth Night', ?, '18:00', 'Hall')`,
      [branch.id, eventDate]
    );
  }

  const scan = await request('POST', '/notifications/scan', null, token);
  assert(scan.status === 200, 'POST /notifications/scan');
  assert((scan.body.created?.birthdays || 0) >= 1, 'Scan created birthday notification');

  const list = await request('GET', '/notifications', null, token);
  assert(list.status === 200, 'GET /notifications');
  assert(list.body.unreadCount >= 1, 'Unread count >= 1');
  assert((list.body.notifications || []).length >= 1, 'Has notification history');

  const unread = await request('GET', '/notifications/unread-count', null, token);
  assert(unread.status === 200 && unread.body.unreadCount >= 1, 'GET unread-count');

  const firstId = list.body.notifications[0].id;
  const mark = await request('PUT', `/notifications/${firstId}/read`, null, token);
  assert(mark.status === 200, 'Mark one as read');

  const announce = await request(
    'POST',
    '/notifications/announce',
    {
      title: `System notice ${stamp}`,
      message: 'Phase 24 announcement test',
      audience: 'admins'
    },
    token
  );
  assert(announce.status === 201 && announce.body.recipients >= 1, 'Announce to admins');

  const afterAnnounce = await request('GET', '/notifications?type=announcement', null, token);
  assert(
    (afterAnnounce.body.notifications || []).some(n => n.title.includes(`System notice ${stamp}`)),
    'Announcement appears in history'
  );

  const markAll = await request('PUT', '/notifications/read-all', null, token);
  assert(markAll.status === 200, 'Mark all read');

  const afterAll = await request('GET', '/notifications/unread-count', null, token);
  assert(afterAll.body.unreadCount === 0, 'Unread is zero after mark-all');

  // Direct createNotification with new type (no CHECK failure)
  const { createNotification } = require('../utils/notifications');
  await createNotification(
    userId,
    'branch',
    'communication',
    'Comm test',
    'Should insert without CHECK error',
    null,
    'communication',
    churchId
  );
  const comm = await request('GET', '/notifications?type=communication', null, token);
  assert((comm.body.notifications || []).length >= 1, 'communication type inserts OK');

  const noAuth = await request('GET', '/notifications');
  assert(noAuth.status === 401 || noAuth.status === 403, 'Unauthenticated blocked');

  console.log('\nAll Phase 24 notification checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
