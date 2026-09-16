/**
 * Multi-currency: USD + LRD always on; admins can add more; finance validates.
 */
const { assert, request, registerChurch } = require('./testHelpers');

async function run() {
  console.log('Currencies — USD/LRD + admin-added codes\n');

  // register with LRD via direct call (helper doesn't pass currency)
  const stamp = Date.now();
  const email = `cur-admin-${stamp}@test.local`;
  const password = 'SecurePass1';
  const reg = await request('POST', '/auth/register', {
    churchName: `Currency Church ${stamp}`,
    churchSlug: `cur-${stamp}`,
    email,
    password,
    currency: 'LRD'
  });
  assert(reg.status === 200 || reg.status === 201, `Register (${reg.status})`);

  const loginRes = await request('POST', '/auth/login', { email, password });
  assert(loginRes.status === 200, 'Login');
  const token = loginRes.body.token;
  assert(!!token, 'Admin token');

  const list = await request('GET', '/church/currencies', null, token);
  assert(list.status === 200, 'GET church currencies');
  const codes = (list.body.currencies || []).map((c) => c.code);
  assert(codes.includes('USD'), 'USD enabled');
  assert(codes.includes('LRD'), 'LRD enabled');

  const add = await request(
    'POST',
    '/church/currencies',
    { code: 'EUR', name: 'Euro', symbol: '€' },
    token
  );
  assert(add.status === 201, `Church admin add EUR (${add.status}) ${JSON.stringify(add.body)}`);
  const after = await request('GET', '/church/currencies', null, token);
  assert(
    (after.body.currencies || []).some((c) => c.code === 'EUR'),
    'EUR listed for church'
  );

  const incomeCat = await request('GET', '/finance/categories', null, token);
  const cat =
    (incomeCat.body.categories || []).find((c) => c.type === 'income') ||
    (incomeCat.body.categories || [])[0];

  for (const [label, currency, amount] of [
    ['USD', 'USD', 10],
    ['LRD', 'LRD', 500],
    ['EUR', 'EUR', 20]
  ]) {
    const txn = await request(
      'POST',
      '/finance/transactions',
      {
        txnType: 'income',
        categoryId: cat?.id,
        amount,
        currency,
        txnDate: new Date().toISOString().slice(0, 10),
        description: `${label} gift`
      },
      token
    );
    assert(txn.status === 201, `Finance txn ${label} (${txn.status}) ${JSON.stringify(txn.body?.error || '')}`);
    assert(txn.body.transaction?.currency === currency, `Stored ${currency}`);
  }

  const bad = await request(
    'POST',
    '/finance/transactions',
    {
      txnType: 'income',
      amount: 5,
      currency: 'XYZ',
      txnDate: new Date().toISOString().slice(0, 10)
    },
    token
  );
  assert(bad.status === 400, `Unknown currency rejected (${bad.status})`);

  const blockDisable = await request('DELETE', '/church/currencies/USD', null, token);
  assert(blockDisable.status === 400, 'Cannot disable USD');

  // Superadmin catalog (optional — use a second registered path if no platform admin)
  const platform = await registerChurch('platcur');
  // Promote is not available via API without existing superadmin — catalog POST requires superadmin.
  // Verify church-admin path is sufficient when catalog upsert creates the code.
  const meta = await request('GET', '/finance/meta', null, token);
  assert(meta.status === 200, 'Finance meta');
  assert(
    (meta.body.currencies || []).some((c) => c.code === 'USD') &&
      (meta.body.currencies || []).some((c) => c.code === 'LRD'),
    'Finance meta includes USD and LRD'
  );

  // Unused platform church just ensures register still seeds currencies
  const platList = await request('GET', '/church/currencies', null, platform.token);
  assert(platList.status === 200, 'New church has currencies');
  assert(
    (platList.body.currencies || []).some((c) => c.code === 'USD') &&
      (platList.body.currencies || []).some((c) => c.code === 'LRD'),
    'New church seeds USD + LRD'
  );

  console.log('\nCurrency tests passed.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
