-- Inter-Office Communications Schema
-- This table stores all inter-office communications between users

CREATE TABLE IF NOT EXISTS communications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  sender_type TEXT NOT NULL CHECK(sender_type IN ('branch', 'sub_user')),
  sender_name TEXT NOT NULL,
  sender_role TEXT,
  recipient_id INTEGER NOT NULL,
  recipient_type TEXT NOT NULL CHECK(recipient_type IN ('branch', 'sub_user')),
  recipient_name TEXT NOT NULL,
  recipient_role TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  communication_type TEXT DEFAULT 'general' CHECK(communication_type IN ('general', 'outreach', 'meeting', 'announcement', 'request', 'report', 'urgent')),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'read', 'acknowledged', 'replied')),
  is_read INTEGER DEFAULT 0,
  read_at DATETIME,
  is_acknowledged INTEGER DEFAULT 0,
  acknowledged_at DATETIME,
  acknowledgment_message TEXT,
  related_request_id INTEGER,
  related_report_id INTEGER,
  attachments TEXT, -- JSON array of file paths
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (related_request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (related_report_id) REFERENCES request_reports(id) ON DELETE SET NULL
);

-- Communication replies/threads
CREATE TABLE IF NOT EXISTS communication_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  communication_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  sender_type TEXT NOT NULL CHECK(sender_type IN ('branch', 'sub_user')),
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  attachments TEXT, -- JSON array of file paths
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Communication recipients (for group communications)
CREATE TABLE IF NOT EXISTS communication_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  communication_id INTEGER NOT NULL,
  recipient_id INTEGER NOT NULL,
  recipient_type TEXT NOT NULL CHECK(recipient_type IN ('branch', 'sub_user')),
  is_read INTEGER DEFAULT 0,
  read_at DATETIME,
  is_acknowledged INTEGER DEFAULT 0,
  acknowledged_at DATETIME,
  acknowledgment_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_communications_sender ON communications(sender_id, sender_type);
CREATE INDEX IF NOT EXISTS idx_communications_recipient ON communications(recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_communications_status ON communications(status);
CREATE INDEX IF NOT EXISTS idx_communications_created ON communications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_replies_comm ON communication_replies(communication_id);
CREATE INDEX IF NOT EXISTS idx_communication_recipients_comm ON communication_recipients(communication_id);
CREATE INDEX IF NOT EXISTS idx_communication_recipients_user ON communication_recipients(recipient_id, recipient_type);

