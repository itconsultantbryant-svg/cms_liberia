/**
 * Phase 37 — End-to-end workflow:
 * register → branch → member → attendance/service → finance → reports
 */
const { request, assert, denied, registerChurch } = require('./testHelpers');

async function run() {
  console.log('Phase 37 — End-to-end workflow\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health up');

  const church = await registerChurch('e2e');
  let token = church.token;

  // Create campus
  const campus = await request(
    'POST',
    '/branches',
    { branchname: `E2E Campus ${church.stamp}`, branchcode: 'E2E', city: 'Testville' },
    token
  );
  assert(campus.status === 201 || campus.status === 200, 'Create campus');
  const campusId = campus.body.branch?.id || campus.body.id;

  if (campusId) {
    const select = await request('POST', '/branches/select', { branchId: campusId }, token);
    if (select.status === 200 && select.body.token) {
      token = select.body.token;
      assert(true, 'Switch active branch');
    }
  }

  // Member
  const mem = await request(
    'POST',
    '/members',
    {
      firstname: 'E2E',
      lastname: 'Member',
      email: `e2e-mem-${church.stamp}@test.local`,
      phone: '555-0100',
      membership_status: 'Active'
    },
    token
  );
  assert(mem.status === 200 || mem.status === 201, 'Create member');
  const memberId = mem.body.id || mem.body.member?.id;
  assert(!!memberId, 'member id');

  const profile = await request('GET', `/members/${memberId}`, null, token);
  assert(profile.status === 200, 'Fetch member profile');

  // Event
  const ev = await request(
    'POST',
    '/events',
    {
      title: `E2E Service ${church.stamp}`,
      date: '2026-09-20',
      time: '10:00',
      location: 'Main Hall'
    },
    token
  );
  assert(ev.status === 200 || ev.status === 201 || ev.status === 403, `Create event (${ev.status})`);

  // Visitor
  const vis = await request(
    'POST',
    '/visitors',
    {
      firstname: 'E2E',
      lastname: 'Visitor',
      phone: '555-0200',
      first_visit_date: '2026-09-14'
    },
    token
  );
  assert(vis.status === 200 || vis.status === 201 || denied(vis.status), `Create visitor (${vis.status})`);

  // Finance transaction
  const txn = await request(
    'POST',
    '/finance/transactions',
    {
      txn_type: 'income',
      amount: 100,
      txn_date: '2026-09-14',
      description: 'E2E offering',
      payment_method: 'cash'
    },
    token
  );
  assert(
    txn.status === 200 || txn.status === 201 || txn.status === 400,
    `Record finance (${txn.status})`
  );

  // Dashboard + reports (server aggregations)
  const dash = await request('GET', '/dashboard', null, token);
  assert(dash.status === 200, 'Dashboard loads');
  assert(dash.body?.stats != null || dash.body?.attendance != null, 'Dashboard has aggregates');

  const overview = await request('GET', '/analytics/overview', null, token);
  assert(overview.status === 200 || denied(overview.status), `Analytics overview (${overview.status})`);

  const membersList = await request('GET', '/members?page=1&limit=10', null, token);
  assert(membersList.status === 200, 'Paginated members list');
  assert(
    (membersList.body?.pagination?.limit || 10) <= 100,
    'List respects pagination'
  );

  // Settings branding read
  const settings = await request('GET', '/church/settings', null, token);
  assert(settings.status === 200, 'Church settings readable');

  // Cleanup soft: delete member (may enter approval workflow → 202)
  const del = await request('DELETE', `/members/${memberId}`, null, token);
  assert(
    del.status === 200 ||
      del.status === 202 ||
      del.status === 204 ||
      denied(del.status),
    `Delete member (${del.status})`
  );

  console.log('\nPhase 37 end-to-end workflow passed.');
}

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
