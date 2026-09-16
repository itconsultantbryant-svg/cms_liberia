/**
 * Phase 24: Expand notification types + church_id (rebuild CHECK-constrained table).
 */
const db = require('../database');

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id INTEGER,
    user_id INTEGER NOT NULL,
    user_type TEXT NOT NULL CHECK(user_type IN ('branch', 'sub_user')),
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_id INTEGER,
    reference_type TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

async function columnExists(table, column) {
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function apply() {
  const master = await db.getAsync(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notifications'`
  );

  if (!master) {
    await db.runAsync(CREATE_SQL);
  } else {
    // Rebuild when missing church_id or old CHECK still limits notification_type
    const hasRestrictiveCheck = /notification_type\s+TEXT[^,]*CHECK/i.test(String(master.sql || ''));
    const missingChurchId = !(await columnExists('notifications', 'church_id'));
    if (missingChurchId || hasRestrictiveCheck) {
      await db.runAsync('BEGIN');
      try {
        await db.runAsync(`
          CREATE TABLE notifications_p24 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            church_id INTEGER,
            user_id INTEGER NOT NULL,
            user_type TEXT NOT NULL CHECK(user_type IN ('branch', 'sub_user')),
            notification_type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            reference_id INTEGER,
            reference_type TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        const hasChurch = await columnExists('notifications', 'church_id');
        if (hasChurch) {
          await db.runAsync(`
            INSERT INTO notifications_p24
              (id, church_id, user_id, user_type, notification_type, title, message,
               reference_id, reference_type, is_read, created_at)
            SELECT id, church_id, user_id, user_type, notification_type, title, message,
                   reference_id, reference_type, is_read, created_at
            FROM notifications
          `);
        } else {
          await db.runAsync(`
            INSERT INTO notifications_p24
              (id, church_id, user_id, user_type, notification_type, title, message,
               reference_id, reference_type, is_read, created_at)
            SELECT id, NULL, user_id, user_type, notification_type, title, message,
                   reference_id, reference_type, is_read, created_at
            FROM notifications
          `);
        }

        await db.runAsync('DROP TABLE notifications');
        await db.runAsync('ALTER TABLE notifications_p24 RENAME TO notifications');
        await db.runAsync('COMMIT');
      } catch (e) {
        await db.runAsync('ROLLBACK');
        throw e;
      }
    }
  }

  await db.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, user_type)'
  );
  await db.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, user_type, is_read)'
  );
  await db.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)'
  );
  await db.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_notifications_church ON notifications(church_id)'
  );

  // Backfill church_id from branch accounts where possible
  await db.runAsync(`
    UPDATE notifications SET church_id = (
      SELECT church_id FROM branches WHERE branches.id = notifications.user_id
    )
    WHERE church_id IS NULL AND user_type = 'branch'
  `);

  console.log('Notifications schema ensure complete.');
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
