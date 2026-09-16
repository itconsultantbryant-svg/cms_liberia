/**
 * Run SQL migration files. Used for deployment (e.g. Render build).
 * Skips ALTER if column/object already exists; runs CREATE TABLE IF NOT EXISTS etc.
 */
const db = require('../database');
const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '../migrations');

async function runMigrations() {
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory, skipping.');
    process.exit(0);
    return;
  }
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const filepath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filepath, 'utf8');
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const statement of statements) {
      if (!statement) continue;
      try {
        await db.runAsync(statement);
        console.log('Ran:', statement.substring(0, 60) + '...');
      } catch (err) {
        if (err.message && (
          err.message.includes('duplicate column name') ||
          err.message.includes('already exists') ||
          err.message.includes('no such table')
        )) {
          console.warn('Skipped (already applied or missing table):', err.message);
        } else {
          console.error('Migration error:', err.message);
          process.exit(1);
        }
      }
    }
  }
  console.log('Migrations complete.');
  process.exit(0);
}

runMigrations();
