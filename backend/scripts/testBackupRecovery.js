/**
 * Phase 34 backup & recovery tests.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { apply } = require('./applyBackups');
const { recoveryRunbook, configSnapshot } = require('../utils/backup');

const PORT = process.env.PORT || 5000;

function request(method, pathName, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api${pathName}`,
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
  console.log('Phase 34 backup & recovery test\n');

  await apply();

  const runbook = recoveryRunbook();
  assert(Array.isArray(runbook.disasterRecovery) && runbook.disasterRecovery.length >= 3, 'DR runbook present');
  const cfg = configSnapshot();
  assert(!cfg.jwtSecret && !cfg.JWT_SECRET, 'Config snapshot has no jwt secret fields');
  assert(cfg.notes && /omit/i.test(cfg.notes), 'Config notes mention secrets omitted');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'API health');

  const saLogin = await request('POST', '/auth/login', {
    email: 'platform@cms.local',
    password: 'SuperAdmin1!'
  });
  assert(saLogin.status === 200 && saLogin.body.user?.isSuperadmin, 'Superadmin login');
  const saToken = saLogin.body.token;

  // Church token cannot access backups
  const stamp = Date.now();
  const email = `bak-${stamp}@test.local`;
  await request('POST', '/auth/register', {
    churchName: `Backup Church ${stamp}`,
    churchSlug: `bak-${stamp}`,
    email,
    password: 'SecurePass1'
  });
  const churchLogin = await request('POST', '/auth/login', {
    email,
    password: 'SecurePass1'
  });
  const denied = await request('GET', '/superadmin/backups', null, churchLogin.body.token);
  assert(denied.status === 401 || denied.status === 403, 'Church admin blocked from backups');

  const policy = await request('GET', '/superadmin/backups/policy', null, saToken);
  assert(policy.status === 200 && policy.body.retentionDays >= 1, 'Backup policy');

  const full = await request('POST', '/superadmin/backups', { kind: 'full' }, saToken);
  assert(full.status === 201 && full.body.backup?.id, 'Create full backup');
  assert(full.body.backup.status === 'completed', 'Full backup completed');
  assert(fs.existsSync(full.body.backup.backup_path), 'Backup dir on disk');
  assert(
    fs.existsSync(path.join(full.body.backup.backup_path, 'database.sqlite')),
    'DB snapshot present'
  );
  assert(
    fs.existsSync(path.join(full.body.backup.backup_path, 'manifest.json')),
    'Manifest present'
  );
  assert(
    fs.existsSync(path.join(full.body.backup.backup_path, 'config.json')),
    'Config snapshot present'
  );

  const verify = await request(
    'POST',
    `/superadmin/backups/${full.body.backup.id}/verify`,
    {},
    saToken
  );
  assert(verify.status === 200, 'Verify full backup');
  assert(verify.body.checks?.checksumOk === true, 'Checksum ok');
  assert(verify.body.job?.status === 'verified', 'Status verified');

  const churchId = churchLogin.body.user.churchId;
  const churchBak = await request(
    'POST',
    '/superadmin/backups',
    { kind: 'church', churchId },
    saToken
  );
  assert(churchBak.status === 201, 'Create church backup');
  const dataPath = path.join(churchBak.body.backup.backup_path, 'data.json');
  assert(fs.existsSync(dataPath), 'Church data.json present');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert(Number(data.church.id) === Number(churchId), 'Export is for target church');
  const leaked = Object.values(data.tables || {}).some((rows) =>
    (rows || []).some((r) => r.church_id != null && Number(r.church_id) !== Number(churchId))
  );
  assert(!leaked, 'Church backup has no foreign tenant rows');
  assert(
    !(data.tables.branches || []).some((b) => b.password || b.password_hash),
    'Passwords stripped from church export'
  );

  const verifyChurch = await request(
    'POST',
    `/superadmin/backups/${churchBak.body.backup.id}/verify`,
    {},
    saToken
  );
  assert(verifyChurch.status === 200 && verifyChurch.body.checks?.dataOk === true, 'Verify church backup');

  const list = await request('GET', '/superadmin/backups', null, saToken);
  assert(list.status === 200 && list.body.backups.length >= 2, 'List backups');

  console.log('\nAll Phase 34 backup checks passed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
