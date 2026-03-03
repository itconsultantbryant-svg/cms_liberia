-- Notifications table for real-time notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  user_type TEXT NOT NULL CHECK(user_type IN ('branch', 'sub_user')),
  notification_type TEXT NOT NULL CHECK(notification_type IN ('request', 'approval', 'member', 'attendance', 'collection', 'report', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_id INTEGER, -- ID of the related item (request, approval, etc.)
  reference_type TEXT, -- Type of reference (request, member, etc.)
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, user_type, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

