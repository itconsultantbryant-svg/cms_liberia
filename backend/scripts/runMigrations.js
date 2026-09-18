/**
 * Run SQL migration files. Used for deployment (e.g. Render build).
 * Skips ALTER if column/object already exists; runs CREATE TABLE IF NOT EXISTS etc.
 * Strips `--` line comments before splitting on `;` so comments cannot break statements.
 */
const db = require('../database');
const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '../migrations');

function splitStatements(sql) {
  const withoutLineComments = String(sql)
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
  return withoutLineComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isSkippableMigrationError(message) {
  const m = String(message || '');
  return (
    m.includes('duplicate column name') ||
    m.includes('already exists') ||
    m.includes('no such table') ||
    m.includes('does not exist') ||
    m.includes('duplicate key') ||
    /column .+ of relation .+ already exists/i.test(m) ||
    /relation .+ already exists/i.test(m)
  );
}

async function runMigrations() {
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory, skipping.');
    process.exit(0);
    return;
  }
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const filepath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filepath, 'utf8');
    const statements = splitStatements(sql);
    console.log(`Applying ${file} (${statements.length} statements)...`);
    for (const statement of statements) {
      if (!statement) continue;
      try {
        await db.runAsync(statement);
        console.log('Ran:', statement.substring(0, 60).replace(/\s+/g, ' ') + '...');
      } catch (err) {
        if (isSkippableMigrationError(err.message)) {
          console.warn('Skipped (already applied or missing table):', err.message);
        } else {
          console.error('Migration error in', file, ':', err.message);
          console.error('Statement:', statement.substring(0, 200));
          process.exit(1);
        }
      }
    }
  }
  console.log('Migrations complete.');
  process.exit(0);
}

runMigrations();
