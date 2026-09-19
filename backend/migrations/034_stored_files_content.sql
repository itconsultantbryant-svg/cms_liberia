-- Phase 33b: Durable branding bytes for serverless disks
-- Applied via applyFileStorage.js (ALTER IF MISSING). Content is base64 of small branding images.

-- SQLite / Postgres both accept TEXT for base64 payloads.
-- ALTER TABLE stored_files ADD COLUMN content_base64 TEXT;
