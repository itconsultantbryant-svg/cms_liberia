/**
 * Phase 30: Ensure dashboard personalization preferences.
 */
const db = require('../database');

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS user_dashboard_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      church_id INTEGER,
      persona TEXT,
      hidden_widgets TEXT DEFAULT '[]',
      widget_order TEXT DEFAULT '[]',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, church_id)
    )
  `);
  await db.runAsync(
    `CREATE INDEX IF NOT EXISTS idx_dash_prefs_user ON user_dashboard_preferences(user_id)`
  );
  console.log('Dashboard preferences schema ensure complete.');
}

if (require.main === module) {
  apply()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { apply };
