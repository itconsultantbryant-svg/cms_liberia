/**
 * Phase 14 pledges & donations tests.
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
  console.log('Phase 14 pledges & donations test\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health is up');

  const stamp = Date.now();
  const email = `plg-${stamp}@test.local`;
  const password = 'SecurePass1';

  const reg = await request('POST', '/auth/register', {
    churchName: `Pledge Church ${stamp}`,
    churchSlug: `plg-${stamp}`,
    email,
    password
  });
  assert(reg.status === 200, 'Register church');

  const login = await request('POST', '/auth/login', { email, password });
  assert(login.status === 200, 'Login');
  const token = login.body.token;

  const donor = await request(
    'POST',
    '/pledges/donors',
    { name: 'Acme Corp', donorType: 'organization', organizationName: 'Acme Corp', email: `acme-${stamp}@test.local` },
    token
  );
  assert(donor.status === 201, 'Create org donor');
  const donorId = donor.body.donor.id;

  const pledge = await request(
    'POST',
    '/pledges/pledges',
    {
      donorId,
      donorName: 'Acme Corp',
      title: 'Building fund',
      amount: 1000,
      frequency: 'monthly',
      startDate: '2026-09-01'
    },
    token
  );
  assert(pledge.status === 201 && pledge.body.pledge?.id, 'Create pledge');
  const pledgeId = pledge.body.pledge.id;

  const partial = await request(
    'POST',
    `/pledges/pledges/${pledgeId}/payments`,
    { amount: 250, paymentMethod: 'bank', paymentDate: '2026-09-15' },
    token
  );
  assert(partial.status === 201, 'Partial payment');
  assert(partial.body.receipt?.receipt_number, 'Receipt number issued');
  assert(Number(partial.body.pledge.amount_paid) === 250, 'Paid amount updated');
  assert(Number(partial.body.pledge.balance) === 750, 'Outstanding balance 750');

  const over = await request(
    'POST',
    `/pledges/pledges/${pledgeId}/payments`,
    { amount: 9999 },
    token
  );
  assert(over.status === 400, 'Overpayment blocked');

  const anon = await request(
    'POST',
    '/pledges/donations',
    { amount: 50, isAnonymous: true, paymentMethod: 'cash', purpose: 'Missions' },
    token
  );
  assert(anon.status === 201 && anon.body.donation.is_anonymous === 1, 'Anonymous donation');
  assert(anon.body.receipt?.receipt_number, 'Donation receipt');

  const receipt = await request('GET', `/pledges/receipts/${anon.body.receipt.id}`, null, token);
  assert(receipt.status === 200 && receipt.body.church?.name, 'Receipt includes church branding');

  const statement = await request('GET', `/pledges/donors/${donorId}/statement`, null, token);
  assert(statement.status === 200, 'Donor statement');
  assert(statement.body.summary.outstandingPledges === 750, 'Statement outstanding');
  assert(statement.body.payments.length >= 1, 'Payment history on statement');

  const dash = await request('GET', '/finance/dashboard', null, token);
  assert(Number(dash.body.outstandingPledges?.total) === 750, 'Finance dashboard outstanding pledges');

  const complete = await request(
    'POST',
    `/pledges/pledges/${pledgeId}/payments`,
    { amount: 750, paymentMethod: 'mobile_money' },
    token
  );
  assert(complete.body.pledge.status === 'completed', 'Pledge completed when paid in full');

  console.log('\nAll pledges & donations checks passed.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
