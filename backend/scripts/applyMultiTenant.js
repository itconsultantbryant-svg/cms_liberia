/**
 * Backfill church_id after 002_multi_tenant_churches.sql.
 * Creates a default church and stamps existing rows.
 * Also ensures requests table has church_id if it exists.
 */
const db = require('../database');

async function columnExists(table, column) {
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function tableExists(table) {
  const row = await db.getAsync(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [table]
  );
  return !!row;
}

async function ensureColumn(table, column, ddl) {
  if (!(await tableExists(table))) return;
  if (await columnExists(table, column)) return;
  try {
    await db.runAsync(ddl);
    console.log(`Added ${table}.${column}`);
  } catch (e) {
    if (!String(e.message).includes('duplicate column')) {
      console.warn(`ensureColumn ${table}.${column}:`, e.message);
    }
  }
}

async function backfillTable(table, viaBranchId = true) {
  if (!(await tableExists(table))) return;
  if (!(await columnExists(table, 'church_id'))) return;

  if (viaBranchId && (await columnExists(table, 'branch_id'))) {
    await db.runAsync(`
      UPDATE ${table}
      SET church_id = (
        SELECT b.church_id FROM branches b WHERE b.id = ${table}.branch_id
      )
      WHERE church_id IS NULL AND branch_id IS NOT NULL
    `);
  }

  // Fallback: any remaining nulls get default church
  const def = await db.getAsync(`SELECT id FROM churches WHERE slug = 'default'`);
  if (def) {
    await db.runAsync(`UPDATE ${table} SET church_id = ? WHERE church_id IS NULL`, [def.id]);
  }
  console.log(`Backfilled ${table}.church_id`);
}

async function apply() {
  // Stamp church_id on operational tables
  const alterTargets = [
    'members', 'attendances', 'collections', 'member_collections', 'events',
    'announcements', 'groups', 'staff', 'sub_users', 'pending_approvals',
    'request_reports', 'payroll_runs', 'reports', 'service_types',
    'collections_types', 'payments', 'collection_commissions', 'requests',
    'notifications', 'communications'
  ];

  for (const table of alterTargets) {
    await ensureColumn(table, 'church_id', `ALTER TABLE ${table} ADD COLUMN church_id INTEGER REFERENCES churches(id)`);
    if (await tableExists(table) && (await columnExists(table, 'church_id'))) {
      try {
        await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_${table}_church ON ${table}(church_id)`);
      } catch (_) { /* ignore */ }
    }
  }

  let church = await db.getAsync(`SELECT id FROM churches WHERE slug = 'default'`);
  if (!church) {
    const firstBranch = await db.getAsync(
      `SELECT branchname, email, country, city, address, currency FROM branches ORDER BY id ASC LIMIT 1`
    );
    const name = firstBranch?.branchname || 'Default Church';
    const result = await db.runAsync(
      `INSERT INTO churches (name, short_name, slug, email, country, city, address, currency, status)
       VALUES (?, ?, 'default', ?, ?, ?, ?, ?, 'active')`,
      [
        name,
        name.substring(0, 40),
        firstBranch?.email || null,
        firstBranch?.country || null,
        firstBranch?.city || null,
        firstBranch?.address || null,
        firstBranch?.currency || 'USD'
      ]
    );
    church = { id: result.lastID };
    console.log(`Created default church id=${church.id}`);
  }

  // Stamp branches without church_id
  if (await columnExists('branches', 'church_id')) {
    await db.runAsync(
      `UPDATE branches SET church_id = ? WHERE church_id IS NULL`,
      [church.id]
    );
    console.log('Backfilled branches.church_id');
  }

  for (const t of alterTargets) {
    await backfillTable(t, true);
  }

  console.log('Multi-tenant backfill complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
