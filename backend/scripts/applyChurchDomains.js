/**
 * Phase 40: Ensure church_domains table.
 */
const db = require('../database');
const fs = require('fs');
const path = require('path');

async function apply() {
  const sqlPath = path.join(__dirname, '../migrations/031_church_domains.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const statement of statements) {
    try {
      await db.runAsync(statement);
    } catch (err) {
      if (!/already exists|duplicate/i.test(err.message)) {
        console.warn('[church_domains]', err.message);
      }
    }
  }
  console.log('Church domains schema ensure complete.');
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
