/**
 * Phase 19 communications / outreach tests.
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
  console.log('Phase 19 communications test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `comm-${stamp}@test.local`;
  const password = 'SecurePass1';

  await request('POST', '/auth/register', {
    churchName: `Comm Church ${stamp}`,
    churchSlug: `comm-${stamp}`,
    email,
    password
  });
  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const meta = await request('GET', '/outreach/meta', null, token);
  assert(meta.status === 200 && meta.body.audienceTypes.includes('ministry'), 'Meta audiences');

  const channels = await request('GET', '/outreach/channels', null, token);
  assert(channels.status === 200 && channels.body.settings, 'Channel settings');

  const patchCh = await request(
    'PATCH',
    '/outreach/channels',
    {
      emailEnabled: true,
      emailProviderReady: true,
      emailFrom: 'church@example.com',
      smsEnabled: true,
      smsProviderReady: false
    },
    token
  );
  assert(patchCh.status === 200 && patchCh.body.settings.email_provider_ready === 1, 'Email ready');

  const templates = await request('GET', '/outreach/templates', null, token);
  assert(templates.status === 200 && (templates.body.templates || []).length >= 3, 'Templates');

  const m1 = await request(
    'POST',
    '/members',
    {
      firstname: 'Ann',
      lastname: `One${stamp}`,
      email: `ann1-${stamp}@test.local`,
      phone: '555-1111',
      dob: `1990-${new Date().toISOString().slice(5, 10)}`
    },
    token
  );
  const m2 = await request(
    'POST',
    '/members',
    {
      firstname: 'Ann',
      lastname: `Two${stamp}`,
      email: `ann2-${stamp}@test.local`,
      phone: '555-2222'
    },
    token
  );
  assert(m1.body.id && m2.body.id, 'Members created');

  const preview = await request(
    'POST',
    '/outreach/audience/preview',
    { audienceType: 'branch' },
    token
  );
  assert(preview.status === 200 && preview.body.counts.total >= 2, 'Audience preview branch');

  const createAnn = await request(
    'POST',
    '/outreach/announcements',
    {
      title: `Sunday Notice ${stamp}`,
      body: 'Service at 10am',
      audienceType: 'members',
      audienceMemberIds: [m1.body.id, m2.body.id],
      channels: { in_app: true, email: true, sms: true, whatsapp: false }
    },
    token
  );
  assert(createAnn.status === 201 && createAnn.body.id, 'Create announcement');

  const send = await request('POST', `/outreach/announcements/${createAnn.body.id}/send`, {}, token);
  assert(send.status === 200 && send.body.recipientCount === 2, 'Send announcement');
  assert(send.body.readiness.email.ready === true, 'Email channel ready on send');
  assert(send.body.readiness.sms.ready === false, 'SMS not ready skipped path');

  const detail = await request('GET', `/outreach/announcements/${createAnn.body.id}`, null, token);
  assert(detail.status === 200 && (detail.body.deliveries || []).length >= 2, 'Deliveries logged');

  await request(
    'POST',
    '/events',
    {
      title: `Reminder Event ${stamp}`,
      date: '2026-12-01',
      startTime: '10:00',
      venue: 'Main Hall',
      reminderEnabled: true,
      reminderHoursBefore: 24
    },
    token
  );

  const scan = await request('POST', '/outreach/reminders/scan', {}, token);
  assert(scan.status === 200 && scan.body.created >= 1, `Reminders scanned (${scan.body.created})`);

  const remList = await request('GET', '/outreach/reminders?status=ready', null, token);
  assert((remList.body.reminders || []).length >= 1, 'Reminder queue has items');

  const birthdayRem = (remList.body.reminders || []).find(r => r.reminder_type === 'birthday');
  assert(!!birthdayRem, 'Birthday reminder for today DOB');

  const dispatch = await request(
    'POST',
    `/outreach/reminders/${remList.body.reminders[0].id}/dispatch`,
    {},
    token
  );
  assert(dispatch.status === 200 && dispatch.body.reminder.status === 'sent', 'Dispatch reminder');

  console.log('\nAll Phase 19 communications checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
