-- Phase 36: Performance indexes for hot tenant queries
CREATE INDEX IF NOT EXISTS idx_members_church_id ON members(church_id);
CREATE INDEX IF NOT EXISTS idx_members_church_branch ON members(church_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_members_church_status ON members(church_id, membership_status);
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);

CREATE INDEX IF NOT EXISTS idx_branches_church_id ON branches(church_id);
CREATE INDEX IF NOT EXISTS idx_branches_church_status ON branches(church_id, status);

CREATE INDEX IF NOT EXISTS idx_events_church_date ON events(church_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_member_date ON member_attendances(member_id, date);
CREATE INDEX IF NOT EXISTS idx_collections_church_date ON collections(church_id, date);
CREATE INDEX IF NOT EXISTS idx_member_collections_date ON member_collections(date_collected);

CREATE INDEX IF NOT EXISTS idx_finance_txn_church_date ON finance_transactions(church_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_finance_txn_church_status ON finance_transactions(church_id, status);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_church_created ON audit_logs(church_id, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_church_status ON requests(church_id, status);
CREATE INDEX IF NOT EXISTS idx_pledges_church ON pledges(church_id);
CREATE INDEX IF NOT EXISTS idx_visitors_church ON visitors(church_id);
CREATE INDEX IF NOT EXISTS idx_households_church ON households(church_id);
CREATE INDEX IF NOT EXISTS idx_groups_church ON groups(church_id);
CREATE INDEX IF NOT EXISTS idx_sub_users_church ON sub_users(church_id);
