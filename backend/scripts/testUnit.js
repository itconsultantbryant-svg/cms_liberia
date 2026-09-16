/**
 * Phase 37 — Unit tests: services, permissions, calculations.
 */
const { assert } = require('./testHelpers');
const { parsePagination, paginationMeta, MAX_LIMIT } = require('../utils/pagination');
const { TtlCache } = require('../utils/cache');
const { normalizePaymentMethod, PAYMENT_METHODS } = require('../utils/finance');
const { ageGroup, parseRange, toCsv } = require('../utils/analytics');
const { isSensitivePerm, hasPermission } = require('../utils/rbac');
const { validatePasswordStrength, containsDangerousHtml } = require('../utils/securityHardening');
const { scrubClientTenantOverrides, assertSameChurch } = require('../utils/tenantScope');
const { ApiError } = require('../middleware/errorHandler');
const { assertImageFile } = require('../utils/imageOptimize');

async function run() {
  console.log('Phase 37 — Unit tests\n');

  // Pagination
  const p = parsePagination({ page: '-3', limit: '500' });
  assert(p.page === 1 && p.limit === MAX_LIMIT, 'pagination clamps page/limit');
  assert(paginationMeta({ page: 1, limit: 10, total: 25 }).pages === 3, 'pagination pages calc');

  // Cache
  const cache = new TtlCache({ defaultTtlMs: 30, maxEntries: 2 });
  cache.set('k', 'v');
  assert(cache.get('k') === 'v', 'ttl cache stores');
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert(cache.stats().size <= 2, 'ttl cache evicts by maxEntries');

  // Finance normalization
  assert(normalizePaymentMethod('momo') === 'mobile_money', 'momo → mobile_money');
  assert(normalizePaymentMethod('cheque') === 'check', 'cheque → check');
  assert(normalizePaymentMethod('weird') === 'other', 'unknown payment → other');
  assert(PAYMENT_METHODS.includes('cash'), 'cash is valid payment method');

  // Analytics calculations
  assert(ageGroup(null) === 'unknown', 'ageGroup null');
  const teenDob = new Date();
  teenDob.setFullYear(teenDob.getFullYear() - 15);
  assert(ageGroup(teenDob.toISOString().slice(0, 10)) === 'teens', 'ageGroup teens');
  const seniorDob = new Date();
  seniorDob.setFullYear(seniorDob.getFullYear() - 70);
  assert(ageGroup(seniorDob.toISOString().slice(0, 10)) === 'seniors', 'ageGroup seniors');
  const range = parseRange({ to: '2026-09-16' });
  assert(range.to === '2026-09-16' && range.from < range.to, 'parseRange defaults from');
  const csv = toCsv([{ a: 1, b: 'x' }], [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' }
  ]);
  assert(csv.includes('A') && csv.includes('1'), 'toCsv builds rows');

  // Permissions
  assert(isSensitivePerm('pastoral.view') === true, 'pastoral is sensitive');
  assert(isSensitivePerm('platform.manage') === true, 'platform is sensitive');
  assert(isSensitivePerm('members.view') === false, 'members.view not sensitive');
  assert(
    (await hasPermission({ isadmin: true }, 'members.view', 1)) === true,
    'isadmin has members.view'
  );
  assert(
    (await hasPermission({ isadmin: true }, 'pastoral.view', 1)) === false,
    'isadmin does NOT auto-get pastoral'
  );
  assert(
    (await hasPermission({ isSuperadmin: true }, 'pastoral.view', 1)) === true,
    'superadmin has pastoral'
  );
  assert((await hasPermission(null, 'members.view')) === false, 'null user denied');

  // Security helpers
  assert(!validatePasswordStrength('weak').ok, 'reject weak password');
  assert(validatePasswordStrength('SecurePass1').ok, 'accept strong password');
  assert(containsDangerousHtml('<script>x</script>'), 'detect XSS');

  // Tenant scrub
  const req = {
    body: { church_id: 9, name: 'ok' },
    query: { churchId: '9' },
    headers: { 'x-church-id': '9' }
  };
  scrubClientTenantOverrides(req);
  assert(req.body.church_id === undefined && req.body.name === 'ok', 'scrub body church_id');
  assert(req.query.churchId === undefined, 'scrub query churchId');
  try {
    assertSameChurch({ churchId: 1 }, 2);
    assert(false, 'assertSameChurch should throw');
  } catch (e) {
    assert(e instanceof ApiError || e.status === 404, 'cross-tenant assert errors');
  }

  // Image constraints
  assert(assertImageFile({ mimetype: 'image/png', size: 100 }).ok, 'png ok');
  assert(!assertImageFile({ mimetype: 'text/plain', size: 10 }).ok, 'reject text as image');

  console.log('\nPhase 37 unit tests passed.');
}

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
