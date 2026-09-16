/**
 * Phase 25: Ensure immutable audit_logs table exists.
 */
const db = require('../database');
const fs = require('fs');
const path = require('path');

async function apply() {
  const sqlPath = path.join(__dirname, '../migrations/023_audit_logging.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) {
    try {
      await db.runAsync(statement);
    } catch (err) {
      if (!String(err.message || '').includes('already exists')) {
        throw err;
      }
    }
  }
  console.log('Audit logging schema ensure complete.');
}

if (require.main === module) {
  apply()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { apply };
