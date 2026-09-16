-- Phase 19: Centralized church communication / outreach

CREATE TABLE IF NOT EXISTS communication_channel_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL UNIQUE,
  email_enabled INTEGER DEFAULT 0,
  email_provider_ready INTEGER DEFAULT 0,
  email_from TEXT,
  sms_enabled INTEGER DEFAULT 0,
  sms_provider_ready INTEGER DEFAULT 0,
  whatsapp_enabled INTEGER DEFAULT 0,
  whatsapp_provider_ready INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  channel TEXT DEFAULT 'in_app',
  subject_template TEXT,
  body_template TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(church_id, code)
);

CREATE TABLE IF NOT EXISTS church_announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  branch_id INTEGER,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience_type TEXT NOT NULL,
  audience_ref_id INTEGER,
  audience_member_ids TEXT,
  channels TEXT DEFAULT '{"in_app":true,"email":false,"sms":false,"whatsapp":false}',
  status TEXT DEFAULT 'draft',
  scheduled_at TEXT,
  sent_at DATETIME,
  recipient_count INTEGER DEFAULT 0,
  event_id INTEGER,
  created_by INTEGER,
  created_by_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcement_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  announcement_id INTEGER NOT NULL,
  member_id INTEGER,
  user_id INTEGER,
  user_type TEXT,
  channel TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (announcement_id) REFERENCES church_announcements(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reminder_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  branch_id INTEGER,
  reminder_type TEXT NOT NULL,
  reference_id INTEGER,
  reference_type TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  due_at TEXT,
  status TEXT DEFAULT 'ready',
  channels TEXT DEFAULT '{"in_app":true,"email":false,"sms":false,"whatsapp":false}',
  payload TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_church_announcements_church ON church_announcements(church_id);
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_ann ON announcement_deliveries(announcement_id);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_church ON reminder_queue(church_id, status);
