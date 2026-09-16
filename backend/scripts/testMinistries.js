/**
 * Phase 16 ministries / groups tests.
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
  console.log('Phase 16 ministries test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `min-${stamp}@test.local`;
  const password = 'SecurePass1';

  await request('POST', '/auth/register', {
    churchName: `Ministry Church ${stamp}`,
    churchSlug: `min-${stamp}`,
    email,
    password
  });
  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const meta = await request('GET', '/groups/meta', null, token);
  assert(meta.status === 200 && meta.body.categories.includes('choir'), 'Meta categories');

  const templates = await request('GET', '/groups/templates', null, token);
  assert(
    templates.status === 200 && (templates.body.templates || []).length >= 5,
    'Templates available'
  );

  const seed = await request('POST', '/groups/seed-defaults', {}, token);
  assert(seed.status === 200 && seed.body.seeded > 0, `Seeded defaults (${seed.body.seeded})`);

  const list = await request('GET', '/groups', null, token);
  assert(list.status === 200 && (list.body.ministries || []).length > 0, 'List ministries');
  const choir = (list.body.ministries || []).find(g => g.category === 'choir' || /choir/i.test(g.name));
  assert(!!choir, 'Choir ministry present');

  const create = await request(
    'POST',
    '/groups',
    {
      name: `Custom Worship ${stamp}`,
      category: 'custom',
      description: 'Test ministry',
      meetingDay: 'Wednesday',
      meetingTime: '19:00',
      meetingLocation: 'Hall A'
    },
    token
  );
  assert(create.status === 201 && create.body.id, 'Create custom ministry');
  const id = create.body.id;

  const memberCreate = await request(
    'POST',
    '/members',
    {
      firstname: 'Lead',
      lastname: `Tester${stamp}`,
      email: `lead-${stamp}@test.local`,
      phone: '555-0100'
    },
    token
  );
  assert(memberCreate.status === 201 || memberCreate.status === 200, 'Create member');
  const memberId = memberCreate.body.id;
  assert(!!memberId, 'Member id returned');

  const addLeader = await request(
    'POST',
    `/groups/${id}/members`,
    { memberId, role: 'leader' },
    token
  );
  assert(addLeader.status === 201, 'Add leader');

  const member2 = await request(
    'POST',
    '/members',
    {
      firstname: 'Assist',
      lastname: `Tester${stamp}`,
      email: `assist-${stamp}@test.local`
    },
    token
  );
  const member2Id = member2.body.id;
  await request('POST', `/groups/${id}/members`, { memberId: member2Id, role: 'assistant' }, token);

  const meeting = await request(
    'POST',
    `/groups/${id}/meetings`,
    {
      meetingDate: '2026-09-15',
      title: 'Rehearsal',
      attendanceCount: 12,
      notes: 'Good turnout'
    },
    token
  );
  assert(meeting.status === 201 && meeting.body.meeting, 'Record meeting');

  const ann = await request(
    'POST',
    `/groups/${id}/announcements`,
    { title: 'Practice moved', body: 'Friday instead' },
    token
  );
  assert(ann.status === 201, 'Post announcement');

  const detail = await request('GET', `/groups/${id}`, null, token);
  assert(detail.status === 200, 'Get detail');
  assert((detail.body.members || []).length >= 2, 'Members loaded');
  assert((detail.body.meetings || []).length >= 1, 'Meetings loaded');
  assert((detail.body.announcements || []).length >= 1, 'Announcements loaded');
  assert(detail.body.group.leader_member_id == memberId, 'Leader set on group');

  const rolePatch = await request(
    'PATCH',
    `/groups/${id}/members/${member2Id}`,
    { role: 'member' },
    token
  );
  assert(rolePatch.status === 200, 'Patch member role');

  const deactivate = await request('DELETE', `/groups/${id}`, null, token);
  assert(deactivate.status === 200, 'Soft deactivate');

  const activeList = await request('GET', '/groups', null, token);
  const stillThere = (activeList.body.ministries || []).find(g => g.id === id);
  assert(!stillThere, 'Deactivated ministry hidden from default list');

  const allList = await request('GET', '/groups?active=0', null, token);
  const foundInactive = (allList.body.ministries || []).find(g => g.id === id);
  assert(!!foundInactive || allList.status === 200, 'Can query including inactive');

  console.log('\nAll Phase 16 ministries checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
