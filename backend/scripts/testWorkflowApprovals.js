/**
 * Phase 8 approval workflow tests.
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
  console.log('Phase 8 workflow approvals test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email1 = `wf1-${stamp}@test.local`;
  const email2 = `wf2-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `WF Church ${stamp}`,
    churchSlug: `wf-${stamp}`,
    email: email1,
    password
  });
  assert(reg.status === 200, 'Register church');

  const login1 = await request('POST', '/auth/login', { email: email1, password });
  assert(login1.status === 200, 'Login admin1');
  const token1 = login1.body.token;

  const defs = await request('GET', '/workflows/definitions', null, token1);
  assert(defs.status === 200 && defs.body.workflows?.length >= 1, 'Workflow definitions loaded');
  assert(
    defs.body.workflows.some(w => w.action_type === 'member_delete'),
    'member_delete workflow exists'
  );

  // Add co-admin
  const co = await request(
    'POST',
    '/church/admins',
    { email: email2, password, name: `WF Co ${stamp}` },
    token1
  );
  assert(co.status === 201, 'Create co-admin');

  const login2 = await request('POST', '/auth/login', { email: email2, password });
  assert(login2.status === 200, 'Login admin2');
  const token2 = login2.body.token;

  // Create member via API
  const memberRes = await request(
    'POST',
    '/members',
    {
      firstname: 'ToDelete',
      lastname: 'Member',
      email: `del-${stamp}@test.local`,
      sex: 'male',
      title: 'Mr'
    },
    token1
  );
  assert(memberRes.status === 200 || memberRes.status === 201, `Create member (${memberRes.status})`);
  const memberId = memberRes.body.id || memberRes.body.member?.id;
  assert(memberId, 'Member id returned');

  const del = await request('DELETE', `/members/${memberId}`, { reason: 'Test delete' }, token1);
  assert(del.status === 202 && del.body.requiresApproval, 'Delete requires approval');
  const requestId = del.body.request.id;

  const stillThere = await request('GET', `/members/${memberId}`, null, token1);
  assert(stillThere.status === 200, 'Member still exists while pending');

  const selfApprove = await request(
    'POST',
    `/workflows/requests/${requestId}/decide`,
    { action: 'approve', comments: 'self' },
    token1
  );
  assert(selfApprove.status === 403, 'Self-approval blocked');

  const approve = await request(
    'POST',
    `/workflows/requests/${requestId}/decide`,
    { action: 'approve', comments: 'ok' },
    token2
  );
  assert(approve.status === 200, 'Co-admin can approve');
  assert(approve.body.request?.status === 'approved', 'Status approved');

  const gone = await request('GET', `/members/${memberId}`, null, token1);
  assert(gone.status === 404, 'Member deleted after approval');

  // Generic expense request
  const exp = await request(
    'POST',
    '/workflows/requests',
    {
      actionType: 'expense_approval',
      amount: 150,
      reason: 'Office supplies',
      payload: { category: 'ops' }
    },
    token1
  );
  assert(exp.status === 201 && exp.body.request?.status === 'pending', 'Expense request created');

  const list = await request('GET', '/workflows/requests?status=pending', null, token2);
  assert(list.status === 200 && list.body.requests.length >= 1, 'Pending list for approver');

  console.log('\nAll workflow approval checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
