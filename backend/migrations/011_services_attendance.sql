-- Phase 12: Service categories + attendance enhancements
-- Columns on service_types / member_attendances / attendances added via applyServicesAttendance.js

CREATE TABLE IF NOT EXISTS service_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO service_templates (code, name, category, description) VALUES
  ('sunday_worship', 'Sunday Worship', 'sunday_worship', 'Main Sunday service'),
  ('midweek', 'Midweek Service', 'midweek', 'Midweek gathering'),
  ('prayer', 'Prayer Service', 'prayer', 'Prayer meeting'),
  ('youth', 'Youth Service', 'youth', 'Youth ministry service'),
  ('special', 'Special Program', 'special', 'Special church program'),
  ('conference', 'Conference', 'conference', 'Conference or camp meeting'),
  ('custom', 'Custom Service', 'custom', 'Custom / other service');
