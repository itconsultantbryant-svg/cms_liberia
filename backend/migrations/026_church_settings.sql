-- Phase 28: Church operational settings
CREATE TABLE IF NOT EXISTS church_settings (
  church_id INTEGER PRIMARY KEY,
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1
    CHECK(fiscal_year_start_month BETWEEN 1 AND 12),
  date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
  membership_number_prefix TEXT NOT NULL DEFAULT 'M',
  membership_number_padding INTEGER NOT NULL DEFAULT 5,
  membership_number_next INTEGER NOT NULL DEFAULT 1,
  receipt_number_prefix TEXT NOT NULL DEFAULT 'RCP',
  receipt_number_include_year INTEGER NOT NULL DEFAULT 1,
  receipt_number_padding INTEGER NOT NULL DEFAULT 5,
  receipt_number_next INTEGER NOT NULL DEFAULT 1,
  notify_birthdays INTEGER NOT NULL DEFAULT 1,
  notify_events INTEGER NOT NULL DEFAULT 1,
  notify_approvals INTEGER NOT NULL DEFAULT 1,
  notify_membership INTEGER NOT NULL DEFAULT 1,
  locked_fields TEXT DEFAULT '[]',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
