/**
 * Phase 17: Extend events for calendar, registration, attendance, attachments.
 */
const db = require('../database');

async function columnExists(table, column) {
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function ensureColumn(table, column, ddl) {
  if (await columnExists(table, column)) return;
  await db.runAsync(ddl);
  console.log(`Added ${table}.${column}`);
}

async function apply() {
  await ensureColumn('events', 'church_id', 'ALTER TABLE events ADD COLUMN church_id INTEGER');
  await ensureColumn('events', 'event_type', "ALTER TABLE events ADD COLUMN event_type TEXT DEFAULT 'custom'");
  await ensureColumn('events', 'end_date', 'ALTER TABLE events ADD COLUMN end_date TEXT');
  await ensureColumn('events', 'end_time', 'ALTER TABLE events ADD COLUMN end_time TEXT');
  await ensureColumn('events', 'venue', 'ALTER TABLE events ADD COLUMN venue TEXT');
  await ensureColumn('events', 'organizer_name', 'ALTER TABLE events ADD COLUMN organizer_name TEXT');
  await ensureColumn('events', 'organizer_member_id', 'ALTER TABLE events ADD COLUMN organizer_member_id INTEGER');
  await ensureColumn('events', 'group_id', 'ALTER TABLE events ADD COLUMN group_id INTEGER');
  await ensureColumn('events', 'status', "ALTER TABLE events ADD COLUMN status TEXT DEFAULT 'published'");
  await ensureColumn('events', 'registration_enabled', 'ALTER TABLE events ADD COLUMN registration_enabled INTEGER DEFAULT 0');
  await ensureColumn('events', 'registration_capacity', 'ALTER TABLE events ADD COLUMN registration_capacity INTEGER');
  await ensureColumn('events', 'registration_deadline', 'ALTER TABLE events ADD COLUMN registration_deadline TEXT');
  await ensureColumn('events', 'reminder_enabled', 'ALTER TABLE events ADD COLUMN reminder_enabled INTEGER DEFAULT 0');
  await ensureColumn('events', 'reminder_hours_before', 'ALTER TABLE events ADD COLUMN reminder_hours_before INTEGER DEFAULT 24');
  await ensureColumn('events', 'is_all_day', 'ALTER TABLE events ADD COLUMN is_all_day INTEGER DEFAULT 0');
  await ensureColumn('events', 'created_by', 'ALTER TABLE events ADD COLUMN created_by INTEGER');

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS event_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,
      member_id INTEGER,
      guest_name TEXT,
      guest_email TEXT,
      guest_phone TEXT,
      status TEXT DEFAULT 'registered',
      attended INTEGER DEFAULT 0,
      notes TEXT,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS event_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_event_attachments_event ON event_attachments(event_id)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_events_church ON events(church_id)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)');

  // Backfill church_id and venue/organizer from legacy columns
  await db.runAsync(`
    UPDATE events SET church_id = (
      SELECT church_id FROM branches WHERE branches.id = events.branch_id
    ) WHERE church_id IS NULL
  `);
  await db.runAsync(`UPDATE events SET venue = location WHERE venue IS NULL AND location IS NOT NULL`);
  await db.runAsync(`UPDATE events SET organizer_name = by_who WHERE organizer_name IS NULL AND by_who IS NOT NULL`);
  await db.runAsync(`UPDATE events SET end_date = date WHERE end_date IS NULL AND date IS NOT NULL`);
  await db.runAsync(`UPDATE events SET status = 'published' WHERE status IS NULL`);
  await db.runAsync(`UPDATE events SET event_type = 'custom' WHERE event_type IS NULL`);

  console.log('Events schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
