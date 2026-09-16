/**
 * Promote an existing branch account to platform Superadmin.
 * Usage: node scripts/createPlatformAdmin.js <email>
 */
const db = require('../database');

async function main() {
  const email = process.argv[2] || process.env.PLATFORM_ADMIN_EMAIL;
  if (!email) {
    console.error('Usage: node scripts/createPlatformAdmin.js <email>');
    process.exit(1);
  }

  // Ensure column
  const cols = await db.allAsync('PRAGMA table_info(branches)');
  if (!cols.some(c => c.name === 'is_platform_admin')) {
    await db.runAsync(
      'ALTER TABLE branches ADD COLUMN is_platform_admin INTEGER DEFAULT 0'
    );
  }

  const branch = await db.getAsync('SELECT id, email, branchname FROM branches WHERE email = ?', [email]);
  if (!branch) {
    console.error(`No branch account found for email: ${email}`);
    process.exit(1);
  }

  await db.runAsync('UPDATE branches SET is_platform_admin = 1 WHERE id = ?', [branch.id]);
  console.log(`Promoted to platform Superadmin: ${branch.email} (${branch.branchname}, id=${branch.id})`);
  console.log('Log out and log back in to refresh the JWT.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
