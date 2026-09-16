-- Phase 30: Dashboard personalization preferences
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
);

CREATE INDEX IF NOT EXISTS idx_dash_prefs_user ON user_dashboard_preferences(user_id);
