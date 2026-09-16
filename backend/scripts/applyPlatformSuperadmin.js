/**
 * Ensure Phase 3 platform admin column exists; optionally promote PLATFORM_ADMIN_EMAIL.
 */
const db = require('../database');

async function columnExists(table, column) {
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function apply() {
  if (!(await columnExists('branches', 'is_platform_admin'))) {
    await db.runAsync(
      `ALTER TABLE branches ADD COLUMN is_platform_admin INTEGER DEFAULT 0`
    );
    console.log('Added branches.is_platform_admin');
  }

  try {
    await db.runAsync(
      `CREATE INDEX IF NOT EXISTS idx_branches_platform_admin ON branches(is_platform_admin)`
    );
  } catch (_) { /* ignore */ }

  const email = process.env.PLATFORM_ADMIN_EMAIL;
  if (email) {
    const branch = await db.getAsync('SELECT id, email FROM branches WHERE email = ?', [email]);
    if (branch) {
      await db.runAsync(
        'UPDATE branches SET is_platform_admin = 1 WHERE id = ?',
        [branch.id]
      );
      console.log(`Promoted platform admin: ${email}`);
    } else {
      console.warn(`PLATFORM_ADMIN_EMAIL=${email} not found in branches; skip promote`);
    }
  }

  console.log('Platform superadmin schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
