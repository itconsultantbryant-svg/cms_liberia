/**
 * Phase 34 — backup & recovery utilities.
 * Full platform snapshots + per-church exports (tenant-isolated).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../database');
const { ApiError } = require('../middleware/errorHandler');

const BACKUP_ROOT = path.join(__dirname, '../backups');
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../database.sqlite');
const UPLOADS_ROOT = path.join(__dirname, '../uploads');
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 14);
const MAX_BACKUPS = Number(process.env.BACKUP_MAX_COUNT || 30);

/** Tables that hold tenant rows via church_id */
const TENANT_TABLES = [
  'members',
  'branches',
  'events',
  'groups',
  'collections',
  'requests',
  'staff',
  'sub_users',
  'church_documents',
  'document_versions',
  'stored_files',
  'church_settings',
  'finance_transactions',
  'finance_funds',
  'finance_accounts',
  'pledges',
  'donations',
  'budgets',
  'visitors',
  'households',
  'notifications',
  'audit_logs',
  'pending_approvals',
  'church_subscriptions',
  'support_sessions',
  'assets',
  'pastoral_cases'
];

function ensureBackupRoot() {
  if (!fs.existsSync(BACKUP_ROOT)) fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  return BACKUP_ROOT;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const walk = (p) => {
    for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, ent.name);
      if (ent.isDirectory()) walk(full);
      else total += fs.statSync(full).size;
    }
  };
  walk(dir);
  return total;
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function configSnapshot() {
  // Non-secret operational config only — never dump JWT secrets / passwords
  return {
    capturedAt: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || '5000',
    corsOriginSet: !!(process.env.CORS_ORIGIN),
    databasePath: path.basename(DB_PATH),
    backupRetentionDays: RETENTION_DAYS,
    backupMaxCount: MAX_BACKUPS,
    apiRateLimit: process.env.API_RATE_LIMIT || '300',
    notes: 'Secrets (JWT, DB passwords) intentionally omitted from backup config snapshot.'
  };
}

async function tableExists(name) {
  const row = await db.getAsync(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    [name]
  );
  return !!row;
}

async function exportChurchData(churchId) {
  const church = await db.getAsync('SELECT * FROM churches WHERE id = ?', [churchId]);
  if (!church) throw new ApiError(404, 'Church not found', 'CHURCH_NOT_FOUND');

  const data = { church, tables: {} };
  for (const table of TENANT_TABLES) {
    if (!(await tableExists(table))) continue;
    try {
      data.tables[table] = await db.allAsync(
        `SELECT * FROM ${table} WHERE church_id = ?`,
        [churchId]
      );
    } catch (_) {
      /* skip tables without church_id or missing */
    }
  }
  return data;
}

async function createFullBackup({ createdBy = null } = {}) {
  ensureBackupRoot();
  const name = `${stamp()}_full`;
  const dest = path.join(BACKUP_ROOT, name);
  fs.mkdirSync(dest, { recursive: true });

  const job = await db.runAsync(
    `INSERT INTO backup_jobs (kind, status, backup_path, created_by)
     VALUES ('full', 'running', ?, ?)`,
    [dest, createdBy]
  );

  try {
    // Database snapshot
    const dbDest = path.join(dest, 'database.sqlite');
    try {
      await db.runAsync(`VACUUM INTO ?`, [dbDest]);
    } catch (_) {
      // Fallback for older SQLite
      fs.copyFileSync(DB_PATH, dbDest);
    }

    // Uploaded files (includes tenant-scoped churches/ tree)
    const uploadsDest = path.join(dest, 'uploads');
    copyRecursive(UPLOADS_ROOT, uploadsDest);

    // Config (redacted)
    const cfg = configSnapshot();
    fs.writeFileSync(path.join(dest, 'config.json'), JSON.stringify(cfg, null, 2));

    const checksum = sha256File(dbDest);
    const sizeBytes = dirSize(dest);
    const manifest = {
      kind: 'full',
      createdAt: new Date().toISOString(),
      databaseChecksum: checksum,
      sizeBytes,
      paths: {
        database: 'database.sqlite',
        uploads: 'uploads/',
        config: 'config.json'
      },
      tenantIsolation:
        'Full backup contains all tenants. Access restricted to Superadmin. Per-church exports use kind=church.'
    };
    fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));

    await db.runAsync(
      `UPDATE backup_jobs SET status = 'completed', size_bytes = ?, checksum = ?,
         manifest_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [sizeBytes, checksum, JSON.stringify(manifest), job.lastID]
    );

    await pruneOldBackups();
    return getBackupJob(job.lastID);
  } catch (err) {
    await db.runAsync(
      `UPDATE backup_jobs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [err.message, job.lastID]
    );
    throw err;
  }
}

async function createChurchBackup(churchId, { createdBy = null } = {}) {
  ensureBackupRoot();
  const churchIdNum = Number(churchId);
  if (!churchIdNum) throw new ApiError(400, 'churchId required', 'VALIDATION');

  const name = `${stamp()}_church_${churchIdNum}`;
  const dest = path.join(BACKUP_ROOT, name);
  fs.mkdirSync(dest, { recursive: true });

  const job = await db.runAsync(
    `INSERT INTO backup_jobs (kind, church_id, status, backup_path, created_by)
     VALUES ('church', ?, 'running', ?, ?)`,
    [churchIdNum, dest, createdBy]
  );

  try {
    const data = await exportChurchData(churchIdNum);
    // Strip sensitive fields from branch accounts
    if (data.tables.branches) {
      data.tables.branches = data.tables.branches.map((b) => {
        const { password, password_hash, reset_token, reset_token_hash, ...rest } = b;
        return rest;
      });
    }

    fs.writeFileSync(path.join(dest, 'data.json'), JSON.stringify(data, null, 2));

    // Only this church's files
    const churchFilesSrc = path.join(UPLOADS_ROOT, 'churches', String(churchIdNum));
    const churchFilesDest = path.join(dest, 'files');
    copyRecursive(churchFilesSrc, churchFilesDest);

    const cfg = configSnapshot();
    fs.writeFileSync(path.join(dest, 'config.json'), JSON.stringify(cfg, null, 2));

    const checksum = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(dest, 'data.json')))
      .digest('hex');
    const sizeBytes = dirSize(dest);
    const manifest = {
      kind: 'church',
      churchId: churchIdNum,
      churchSlug: data.church.slug,
      createdAt: new Date().toISOString(),
      dataChecksum: checksum,
      sizeBytes,
      tableCounts: Object.fromEntries(
        Object.entries(data.tables).map(([k, rows]) => [k, rows.length])
      ),
      tenantIsolation:
        'This archive contains only the specified church_id rows and files. No other tenant data.'
    };
    fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));

    await db.runAsync(
      `UPDATE backup_jobs SET status = 'completed', size_bytes = ?, checksum = ?,
         manifest_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [sizeBytes, checksum, JSON.stringify(manifest), job.lastID]
    );

    await pruneOldBackups();
    return getBackupJob(job.lastID);
  } catch (err) {
    await db.runAsync(
      `UPDATE backup_jobs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [err.message, job.lastID]
    );
    throw err;
  }
}

async function getBackupJob(id) {
  return db.getAsync('SELECT * FROM backup_jobs WHERE id = ?', [id]);
}

async function listBackupJobs({ limit = 50, kind = null, churchId = null } = {}) {
  let sql = 'SELECT * FROM backup_jobs WHERE 1=1';
  const params = [];
  if (kind) {
    sql += ' AND kind = ?';
    params.push(kind);
  }
  if (churchId) {
    sql += ' AND church_id = ?';
    params.push(churchId);
  }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(Math.min(200, Number(limit) || 50));
  return db.allAsync(sql, params);
}

/**
 * Restore test / integrity verification — does not overwrite production DB.
 */
async function verifyBackup(jobId) {
  const job = await getBackupJob(jobId);
  if (!job || job.status === 'failed') {
    throw new ApiError(404, 'Backup not found or failed', 'BACKUP_NOT_FOUND');
  }
  if (!job.backup_path || !fs.existsSync(job.backup_path)) {
    throw new ApiError(404, 'Backup directory missing on disk', 'BACKUP_MISSING');
  }

  const manifestPath = path.join(job.backup_path, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new ApiError(400, 'manifest.json missing', 'BACKUP_CORRUPT');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const checks = { manifestOk: true, databaseOk: null, dataOk: null, checksumOk: null };

  if (job.kind === 'full') {
    const dbFile = path.join(job.backup_path, 'database.sqlite');
    if (!fs.existsSync(dbFile)) throw new ApiError(400, 'database.sqlite missing', 'BACKUP_CORRUPT');
    const sum = sha256File(dbFile);
    checks.checksumOk = sum === (manifest.databaseChecksum || job.checksum);
    // Open readonly via sqlite3 CLI-less: try attaching with temporary connection
    const sqlite3 = require('sqlite3').verbose();
    await new Promise((resolve, reject) => {
      const probe = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY, (err) => {
        if (err) return reject(err);
        probe.get('SELECT COUNT(*) as c FROM sqlite_master', (e, row) => {
          probe.close();
          if (e) return reject(e);
          checks.databaseOk = (row?.c || 0) > 0;
          resolve();
        });
      });
    });
  } else if (job.kind === 'church') {
    const dataFile = path.join(job.backup_path, 'data.json');
    if (!fs.existsSync(dataFile)) throw new ApiError(400, 'data.json missing', 'BACKUP_CORRUPT');
    const raw = fs.readFileSync(dataFile, 'utf8');
    const sum = crypto.createHash('sha256').update(raw).digest('hex');
    checks.checksumOk = sum === (manifest.dataChecksum || job.checksum);
    const parsed = JSON.parse(raw);
    checks.dataOk =
      parsed.church &&
      Number(parsed.church.id) === Number(job.church_id) &&
      !Object.values(parsed.tables || {}).some((rows) =>
        (rows || []).some(
          (r) => r.church_id != null && Number(r.church_id) !== Number(job.church_id)
        )
      );
  }

  const ok =
    checks.manifestOk &&
    checks.checksumOk !== false &&
    (checks.databaseOk !== false) &&
    (checks.dataOk !== false);

  if (!ok) {
    throw new ApiError(400, 'Backup verification failed', 'BACKUP_VERIFY_FAILED', checks);
  }

  await db.runAsync(
    `UPDATE backup_jobs SET status = 'verified', verified_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [jobId]
  );

  return { job: await getBackupJob(jobId), checks, disasterRecoveryNotes: recoveryRunbook() };
}

function recoveryRunbook() {
  return {
    automatedBackups: 'Schedule: npm run backup (cron/systemd). Env: BACKUP_RETENTION_DAYS, BACKUP_MAX_COUNT.',
    pointInTime:
      'SQLite full snapshots are point-in-time copies at backup creation. Continuous WAL PITR requires external volume snapshots.',
    disasterRecovery: [
      '1. Stop the API process.',
      '2. Replace backend/database.sqlite with backups/<stamp>_full/database.sqlite',
      '3. Replace backend/uploads with backups/<stamp>_full/uploads',
      '4. Restore non-secret config from config.json / secrets from secure vault.',
      '5. Start API and run npm run test:backup verify on latest job.',
      '6. For single-tenant recovery, use church export data.json + files/ (manual merge / support tooling).'
    ],
    restoreTesting: 'POST /api/superadmin/backups/:id/verify — checksum + open probe; does not mutate production.',
    tenantIsolation:
      'Church backups never include other tenants. Full backups are Superadmin-only.'
  };
}

async function pruneOldBackups() {
  const jobs = await db.allAsync(
    `SELECT * FROM backup_jobs WHERE status IN ('completed', 'verified') ORDER BY id DESC`
  );
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const toDelete = [];

  jobs.forEach((j, idx) => {
    const tooOld = j.completed_at && new Date(j.completed_at).getTime() < cutoff;
    const overMax = idx >= MAX_BACKUPS;
    if (tooOld || overMax) toDelete.push(j);
  });

  for (const j of toDelete) {
    try {
      if (j.backup_path && fs.existsSync(j.backup_path)) {
        fs.rmSync(j.backup_path, { recursive: true, force: true });
      }
    } catch (_) { /* ignore */ }
    await db.runAsync('DELETE FROM backup_jobs WHERE id = ?', [j.id]);
  }
  return toDelete.length;
}

module.exports = {
  BACKUP_ROOT,
  RETENTION_DAYS,
  MAX_BACKUPS,
  ensureBackupRoot,
  createFullBackup,
  createChurchBackup,
  getBackupJob,
  listBackupJobs,
  verifyBackup,
  pruneOldBackups,
  recoveryRunbook,
  configSnapshot,
  exportChurchData
};
