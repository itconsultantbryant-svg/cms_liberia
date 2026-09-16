/**
 * Phase 15 budget management tests.
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
  console.log('Phase 15 budgets test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `bud-${stamp}@test.local`;
  const password = 'SecurePass1';

  await request('POST', '/auth/register', {
    churchName: `Budget Church ${stamp}`,
    churchSlug: `bud-${stamp}`,
    email,
    password
  });
  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const cats = await request('GET', '/finance/categories', null, token);
  const tithe = cats.body.categories.find(c => c.code === 'TITHES');
  const util = cats.body.categories.find(c => c.code === 'UTILITIES' || c.type === 'expense');
  assert(tithe && util, 'Categories available');

  const create = await request(
    'POST',
    '/budgets',
    {
      name: `FY2026 Budget ${stamp}`,
      fiscalYear: 2026,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      churchWide: true,
      lines: [
        { lineType: 'income', categoryId: tithe.id, amount: 10000 },
        { lineType: 'expense', categoryId: util.id, amount: 2000 }
      ]
    },
    token
  );
  assert(create.status === 201 && create.body.budget.status === 'draft', 'Create draft budget');
  assert(Number(create.body.budget.total_expense) === 2000, 'Totals calculated');
  const id = create.body.budget.id;

  const badActivate = await request('POST', `/budgets/${id}/activate`, {}, token);
  assert(badActivate.status === 400, 'Cannot activate from draft');

  await request('POST', `/budgets/${id}/submit`, {}, token);
  let detail = await request('GET', `/budgets/${id}`, null, token);
  assert(detail.body.budget.status === 'submitted', 'Submitted');

  await request('POST', `/budgets/${id}/approve`, {}, token);
  detail = await request('GET', `/budgets/${id}`, null, token);
  assert(detail.body.budget.status === 'approved', 'Approved');

  await request('POST', `/budgets/${id}/activate`, {}, token);
  detail = await request('GET', `/budgets/${id}`, null, token);
  assert(detail.body.budget.status === 'active', 'Active');

  // Post actual expense against utilities
  const exp = await request(
    'POST',
    '/finance/transactions',
    {
      txnType: 'expense',
      categoryId: util.id,
      amount: 500,
      paymentMethod: 'cash',
      txnDate: '2026-03-15',
      description: 'Power bill',
      status: 'draft'
    },
    token
  );
  await request('POST', `/finance/transactions/${exp.body.transaction.id}/post`, {}, token);

  const variance = await request('GET', `/budgets/${id}/variance`, null, token);
  assert(variance.status === 200, 'Variance report');
  assert(variance.body.variance.totals.budgetedExpense === 2000, 'Budgeted expense');
  assert(variance.body.variance.totals.actualExpense === 500, 'Actual expense');
  assert(variance.body.variance.totals.expenseVariance === 1500, 'Favorable expense variance');

  const dash = await request('GET', '/finance/dashboard?year=2026', null, token);
  assert(dash.body.budgetPerformance?.budgetId === id, 'Dashboard uses active budget');
  assert(Number(dash.body.budgetPerformance.budgeted) === 2000, 'Dashboard budgeted expense');
  assert(Number(dash.body.budgetPerformance.actual) === 500, 'Dashboard actual expense');

  await request('POST', `/budgets/${id}/close`, {}, token);
  detail = await request('GET', `/budgets/${id}`, null, token);
  assert(detail.body.budget.status === 'closed', 'Closed');

  console.log('\nAll budget checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
