/**
 * Phase 17 event management tests.
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
  console.log('Phase 17 events test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `evt-${stamp}@test.local`;
  const password = 'SecurePass1';

  await request('POST', '/auth/register', {
    churchName: `Event Church ${stamp}`,
    churchSlug: `evt-${stamp}`,
    email,
    password
  });
  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const meta = await request('GET', '/events/meta', null, token);
  assert(meta.status === 200 && meta.body.eventTypes.includes('wedding'), 'Meta event types');

  const create = await request(
    'POST',
    '/events',
    {
      title: `Youth Retreat ${stamp}`,
      eventType: 'retreat',
      date: '2026-10-01',
      endDate: '2026-10-03',
      startTime: '09:00',
      endTime: '17:00',
      venue: 'Camp Grounds',
      organizerName: 'Youth Pastor',
      description: 'Annual retreat',
      registrationEnabled: true,
      registrationCapacity: 2,
      reminderEnabled: true,
      reminderHoursBefore: 48
    },
    token
  );
  assert(create.status === 201 && create.body.id, 'Create event');
  const id = create.body.id;
  assert(create.body.event.event_type === 'retreat', 'Type stored');
  assert(create.body.event.registration_enabled === 1, 'Registration enabled');

  const list = await request('GET', '/events?upcoming=1', null, token);
  assert(list.status === 200 && (list.body.events || []).some(e => e.id === id), 'List upcoming');

  const cal = await request('GET', '/events/calendar?from=2026-10-01&to=2026-10-31', null, token);
  assert(cal.status === 200 && (cal.body.events || []).some(e => e.id === id), 'Calendar feed');

  const m1 = await request(
    'POST',
    '/members',
    { firstname: 'Eve', lastname: `One${stamp}`, email: `eve1-${stamp}@test.local` },
    token
  );
  const m2 = await request(
    'POST',
    '/members',
    { firstname: 'Eve', lastname: `Two${stamp}`, email: `eve2-${stamp}@test.local` },
    token
  );
  const m3 = await request(
    'POST',
    '/members',
    { firstname: 'Eve', lastname: `Three${stamp}`, email: `eve3-${stamp}@test.local` },
    token
  );
  assert(m1.body.id && m2.body.id && m3.body.id, 'Members created');

  const r1 = await request('POST', `/events/${id}/register`, { memberId: m1.body.id }, token);
  assert(r1.status === 201 && r1.body.registration.status === 'registered', 'First registration');

  const r2 = await request('POST', `/events/${id}/register`, { memberId: m2.body.id }, token);
  assert(r2.status === 201 && r2.body.registration.status === 'registered', 'Second registration');

  const r3 = await request('POST', `/events/${id}/register`, { memberId: m3.body.id }, token);
  assert(r3.status === 201 && r3.body.registration.status === 'waitlist', 'Capacity waitlist');

  const guest = await request(
    'POST',
    `/events/${id}/register`,
    { guestName: 'Visitor Guest', guestEmail: 'guest@test.local' },
    token
  );
  assert(guest.status === 201 && guest.body.registration.status === 'waitlist', 'Guest waitlist');

  const detail = await request('GET', `/events/${id}`, null, token);
  assert(detail.status === 200, 'Event detail');
  assert(detail.body.stats.registered === 2, 'Registered count');
  assert(detail.body.stats.waitlist >= 2, 'Waitlist count');

  const att = await request(
    'POST',
    `/events/${id}/attendance`,
    { registrationIds: [r1.body.registration.id, r2.body.registration.id], attended: true },
    token
  );
  assert(att.status === 200 && att.body.attendanceCount === 2, 'Mark attendance');

  const reminders = await request('GET', '/events/reminders/due?withinHours=99999', null, token);
  assert(reminders.status === 200, 'Reminders endpoint');

  const cancel = await request('DELETE', `/events/${id}`, null, token);
  assert(cancel.status === 200, 'Cancel event');

  const after = await request('GET', `/events/${id}`, null, token);
  assert(after.body.event.status === 'cancelled', 'Status cancelled');

  console.log('\nAll Phase 17 events checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
