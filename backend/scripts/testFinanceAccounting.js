/**
 * Phase 13 finance & accounting tests.
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
  console.log('Phase 13 finance accounting test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `fin-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Fin Church ${stamp}`,
    churchSlug: `fin-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200, 'Register church');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const cats = await request('GET', '/finance/categories', null, token);
  assert(cats.status === 200 && cats.body.categories?.length >= 8, 'Income/expense categories loaded');
  const tithe = cats.body.categories.find(c => c.code === 'TITHES' || /tithe/i.test(c.name));
  assert(tithe, 'Tithes category exists');

  const funds = await request('GET', '/finance/funds', null, token);
  assert(funds.status === 200 && funds.body.funds?.length >= 1, 'General fund present');

  const create = await request(
    'POST',
    '/finance/transactions',
    {
      txnType: 'income',
      categoryId: tithe.id,
      amount: 250,
      currency: 'USD',
      paymentMethod: 'mobile_money',
      referenceNumber: `REF-${stamp}`,
      txnDate: '2026-09-15',
      donorName: 'Jane Donor',
      description: 'Sunday tithe',
      status: 'pending'
    },
    token
  );
  assert(create.status === 201 && create.body.transaction?.id, 'Create income txn');
  const txnId = create.body.transaction.id;
  assert(create.body.transaction.status === 'pending', 'Starts pending');

  const editPosted = await request('PUT', `/finance/transactions/${txnId}`, { amount: 999 }, token);
  // still pending so edit OK
  assert(editPosted.status === 200, 'Pending txn can be edited');

  const post = await request('POST', `/finance/transactions/${txnId}/post`, {}, token);
  assert(post.status === 200 && post.body.transaction.status === 'posted', 'Post transaction');

  const silent = await request('PUT', `/finance/transactions/${txnId}`, { amount: 1 }, token);
  assert(silent.status === 400, 'Posted txn cannot be silently edited');

  const expenseCat = cats.body.categories.find(c => c.type === 'expense');
  const exp = await request(
    'POST',
    '/finance/transactions',
    {
      txnType: 'expense',
      categoryId: expenseCat.id,
      amount: 40,
      paymentMethod: 'cash',
      txnDate: '2026-09-15',
      description: 'Supplies',
      status: 'draft'
    },
    token
  );
  await request('POST', `/finance/transactions/${exp.body.transaction.id}/post`, {}, token);

  const dash = await request('GET', '/finance/dashboard', null, token);
  assert(dash.status === 200, 'Dashboard loads');
  assert(Number(dash.body.income) >= 250, 'Dashboard income includes tithe');
  assert(Number(dash.body.expenses) >= 40, 'Dashboard expenses included');
  assert(typeof dash.body.net === 'number', 'Net position present');
  assert(Array.isArray(dash.body.donationTrends), 'Donation trends present');
  assert(dash.body.outstandingPledges != null, 'Outstanding pledges stub');

  const rev = await request(
    'POST',
    `/finance/transactions/${txnId}/reverse`,
    { reason: 'Duplicate entry' },
    token
  );
  assert(rev.status === 201 && rev.body.original.status === 'voided', 'Reversal voids original');
  assert(rev.body.reversal.status === 'posted', 'Reversal entry posted');

  const dash2 = await request('GET', '/finance/dashboard', null, token);
  // income 250 voided, reversal is expense 250, plus expense 40 → income may be 0 from voided
  assert(dash2.status === 200, 'Dashboard after reversal');

  console.log('\nAll finance accounting checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
