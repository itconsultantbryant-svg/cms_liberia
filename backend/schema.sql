-- Branches table (replaces users table)
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branchname TEXT NOT NULL,
  branchcode TEXT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  currency TEXT DEFAULT 'USD' CHECK(currency IN ('USD', 'LRD')),
  isadmin INTEGER DEFAULT 0,
  permissions TEXT DEFAULT '[]',
  church_id INTEGER,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  token_version INTEGER DEFAULT 0,
  password_changed_at TEXT,
  mfa_enabled INTEGER DEFAULT 0,
  mfa_secret TEXT,
  is_platform_admin INTEGER DEFAULT 0,
  is_headquarters INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  phone TEXT,
  pastor_name TEXT,
  description TEXT,
  logo_url TEXT,
  is_login_enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_type TEXT NOT NULL CHECK(account_type IN ('branch', 'sub_user')),
  account_id INTEGER NOT NULL,
  church_id INTEGER,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Churches (tenants) — multi-tenant SaaS foundation
CREATE TABLE IF NOT EXISTS churches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  short_name TEXT,
  slug TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  country TEXT,
  city TEXT,
  address TEXT,
  website_url TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT DEFAULT '#2c3e50',
  secondary_color TEXT DEFAULT '#3498db',
  timezone TEXT DEFAULT 'Africa/Monrovia',
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'archived')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_churches_slug ON churches(slug);
CREATE INDEX IF NOT EXISTS idx_branches_church ON branches(church_id);

-- Members table
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  church_id INTEGER,
  membership_id TEXT,
  title TEXT CHECK(title IN ('Mr', 'Mrs', 'Miss', 'Dr (Mrs)', 'Dr', 'Prof', 'Chief', 'Chief (Mrs)', 'Engr', 'Surveyor', 'HRH', 'Elder', 'Oba', 'Olori')),
  firstname TEXT,
  middlename TEXT,
  lastname TEXT,
  email TEXT UNIQUE NOT NULL,
  dob TEXT,
  phone TEXT,
  phone_alt TEXT,
  occupation TEXT,
  position TEXT DEFAULT 'member' CHECK(position IN ('worker', 'senior pastor', 'pastor', 'elder', 'usher', 'member', 'chorister', 'technician', 'instrumentalist', 'deacon', 'deaconess', 'evangelist', 'minister', 'protocol')),
  address TEXT,
  address2 TEXT,
  postal TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  sex TEXT CHECK(sex IN ('male', 'female')),
  marital_status TEXT CHECK(marital_status IN ('married', 'single')),
  member_since TEXT,
  wedding_anniversary TEXT,
  photo TEXT DEFAULT 'profile.png',
  relative TEXT,
  member_status TEXT DEFAULT 'old' CHECK(member_status IN ('old', 'new')),
  membership_status TEXT DEFAULT 'Active',
  baptism_status TEXT DEFAULT 'unknown',
  baptism_date TEXT,
  ministry TEXT,
  department TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  notes TEXT,
  password TEXT,
  isadmin INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT,
  doc_type TEXT DEFAULT 'other',
  uploaded_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- Service types table
CREATE TABLE IF NOT EXISTS service_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Collections types table
CREATE TABLE IF NOT EXISTS collections_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Attendances table
CREATE TABLE IF NOT EXISTS attendances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  male INTEGER DEFAULT 0,
  female INTEGER DEFAULT 0,
  children INTEGER DEFAULT 0,
  service_types_id INTEGER NOT NULL,
  attendance_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (service_types_id) REFERENCES service_types(id) ON DELETE CASCADE
);

-- Member attendances table
CREATE TABLE IF NOT EXISTS member_attendances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  attendance TEXT CHECK(attendance IN ('yes', 'no')),
  date DATE NOT NULL,
  service_types_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (service_types_id) REFERENCES service_types(id) ON DELETE CASCADE
);

-- Collections table
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  collections_types_id INTEGER NOT NULL,
  service_types_id INTEGER NOT NULL,
  amount INTEGER DEFAULT 0,
  date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (collections_types_id) REFERENCES collections_types(id) ON DELETE CASCADE,
  FOREIGN KEY (service_types_id) REFERENCES service_types(id) ON DELETE CASCADE
);

-- Member collections table
CREATE TABLE IF NOT EXISTS member_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  collections_types_id INTEGER NOT NULL,
  service_types_id INTEGER NOT NULL,
  amount INTEGER DEFAULT 0,
  date_collected DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (collections_types_id) REFERENCES collections_types(id) ON DELETE CASCADE,
  FOREIGN KEY (service_types_id) REFERENCES service_types(id) ON DELETE CASCADE
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  time TEXT,
  assign_to TEXT,
  by_who TEXT,
  details TEXT,
  date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Announcements table
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  details TEXT NOT NULL,
  by_who TEXT,
  start_date DATE,
  stop_date DATE,
  start_time TEXT,
  stop_time TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Group members table
CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE(group_id, member_id)
);

-- Messaging table
CREATE TABLE IF NOT EXISTS messaging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Options table
CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER,
  name TEXT NOT NULL,
  value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Collection commissions table
CREATE TABLE IF NOT EXISTS collection_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  collection_id INTEGER NOT NULL,
  amount INTEGER DEFAULT 0,
  settled INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  amount INTEGER DEFAULT 0,
  reference TEXT,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_members_branch ON members(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendances_branch ON attendances(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendances_date ON attendances(attendance_date);
CREATE INDEX IF NOT EXISTS idx_collections_branch ON collections(branch_id);
CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(date);
CREATE INDEX IF NOT EXISTS idx_member_collections_branch ON member_collections(branch_id);
CREATE INDEX IF NOT EXISTS idx_member_collections_member ON member_collections(member_id);
CREATE INDEX IF NOT EXISTS idx_events_branch ON events(branch_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- Roles table - Defines all administrative roles
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_code TEXT UNIQUE NOT NULL,
  role_name TEXT NOT NULL,
  level INTEGER NOT NULL, -- Hierarchy level (1 = highest)
  office_type TEXT, -- 'national', 'mission', 'department', 'station', 'local'
  department TEXT, -- Department name if applicable
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Role hierarchy - Defines reporting relationships
CREATE TABLE IF NOT EXISTS role_hierarchy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL,
  reports_to_role_id INTEGER, -- NULL for top level (President)
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (reports_to_role_id) REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE(role_id, reports_to_role_id)
);

-- Role access - Defines which offices/departments a role can access
CREATE TABLE IF NOT EXISTS role_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL,
  accessible_role_id INTEGER NOT NULL, -- Role/office this role can access
  access_type TEXT DEFAULT 'full', -- 'full', 'read', 'write'
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (accessible_role_id) REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE(role_id, accessible_role_id)
);

-- Departments table
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_code TEXT UNIQUE NOT NULL,
  department_name TEXT NOT NULL,
  parent_department_id INTEGER, -- For sub-departments
  office_type TEXT NOT NULL, -- 'national', 'mission', 'department', 'station', 'local'
  location TEXT, -- 'liberia', 'foreign', 'both'
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE CASCADE
);

-- User roles - Links users to roles
CREATE TABLE IF NOT EXISTS user_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, -- References branches.id or members.id
  user_type TEXT NOT NULL, -- 'branch' or 'member'
  role_id INTEGER NOT NULL,
  department_id INTEGER, -- Optional: specific department assignment
  location TEXT, -- Country/region/state assignment
  assigned_by INTEGER, -- User who assigned this role
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

-- Update branches table to remove isadmin, add role support
-- Note: We'll keep isadmin for backward compatibility but use roles primarily

-- Insert all roles
INSERT OR IGNORE INTO roles (role_code, role_name, level, office_type, department, description) VALUES
-- NATIONAL OFFICE
('PRESIDENT', 'Head of Mission / President', 1, 'national', NULL, 'Have access to All Offices, reports to no one'),
('VICE_PRESIDENT_MA', 'Vice President MA', 2, 'national', NULL, 'Have access to all offices under Mission Office and Education Office, reports to President'),
('MISSION_INSPECTORATE_NATIONAL', 'Mission Inspectorate Pastor (National)', 2, 'national', NULL, 'Have access to all offices under Mission Office, reports to Vice President MA'),
('EXECUTIVE_SECRETARY', 'Executive Secretary', 2, 'national', NULL, 'Have access to only his office, reports to all offices under National office apart from Mission Secretary'),
('MISSION_SECRETARY', 'Mission Secretary', 2, 'national', NULL, 'Reports to everyone under National office except Executive Secretary'),

-- MISSION OFFICE
('VICE_PRESIDENT_MISSION', 'Vice President MA (Mission Office)', 3, 'mission', NULL, 'Have access to all offices under Mission Office and Education Office, reports to President'),
('MISSION_INSPECTORATE_MISSION', 'Mission Inspectorate Pastor (Mission Office)', 4, 'mission', NULL, 'Have access to all offices under Mission Office, reports to Vice President'),
('MISSION_SECRETARY_MISSION', 'Mission Secretary (Mission Office)', 4, 'mission', NULL, 'Have access to everyone under National office except Executive Secretary'),
('HOME_MISSION_PASTOR', 'Home Mission Pastor', 5, 'mission', 'Home Mission', 'Have access to only Home Mission Department offices and stations in Liberia, reports to Mission Secretary'),
('FOREIGN_MISSION_PASTOR', 'Foreign Mission Pastor', 5, 'mission', 'Foreign Mission', 'Have access to only Foreign Mission department and stations outside Liberia, reports to Mission Secretary'),

-- HOME MISSION DEPARTMENT
('TRAINING_DEV_HOME', 'Training and Development (Home Mission)', 6, 'department', 'Home Mission', 'Have access to only office, reports to Home Mission Pastor'),
('LEGAL_SERVICES_HOME', 'Legal Services (Home Mission)', 6, 'department', 'Home Mission', 'Have access to only office, reports to Home Mission Pastor'),
('CHURCH_GROWTH_EXPANSION', 'Church Growth and Expansion', 6, 'department', 'Home Mission', 'Have access to only office, reports to Home Mission Pastor'),

-- FOREIGN MISSION DEPARTMENT
('TRAINING_DEV_FOREIGN', 'Training and Manpower Development (Foreign Mission)', 6, 'department', 'Foreign Mission', 'Have access to only office, reports to Foreign Mission Pastor'),
('LEGAL_SERVICES_FOREIGN', 'Legal Services (Foreign Mission)', 6, 'department', 'Foreign Mission', 'Have access to only office, reports to Foreign Mission Pastor'),
('FINANCE_BUDGET_FOREIGN', 'Finance and Budget (Foreign Mission)', 6, 'department', 'Foreign Mission', 'Have access to only office, reports to Foreign Mission Pastor'),

-- PERSONNEL DEPARTMENT
('PERSONNEL_OFFICER', 'Personnel Officer', 4, 'department', 'Personnel', 'Have access to only office, reports to all offices under Mission office'),

-- EDUCATION OFFICE
('EDUCATION_SECRETARY', 'Education Secretary', 3, 'mission', 'Education', 'Have access to all offices under education, reports to Vice President MA'),
('DIRECTOR_PRIMARY_SECONDARY', 'Director for Primary-Secondary Education', 4, 'department', 'Education', 'Have access to offices under department of primary-secondary education, reports to Education Secretary'),
('DIRECTOR_HIGHER_LEARNING', 'Director for Higher Learning', 4, 'department', 'Education', 'Have access to offices under department for higher learning, reports to Education Secretary'),
('PRIMARY_SECONDARY_SCHOOL', 'Primary-Secondary School', 5, 'department', 'Education', 'Have access to only office, reports to Director for Primary-Secondary'),
('HIGHER_LEARNING', 'Higher Learning', 5, 'department', 'Education', 'Have access to only office, reports to Director for Higher Learning'),

-- STATIONS (OUTSIDE HEADQUARTERS)
('REGIONAL_PASTOR', 'Regional Pastor', 5, 'station', NULL, 'Serves as resident in national headquarters of country posted to, coordinates other nations, reports to Foreign Mission Pastor'),
('NATIONAL_PASTOR', 'National Pastor', 6, 'station', NULL, 'Serves as resident in national headquarters of country posted to, coordinates stations in country, reports to Regional Pastor'),
('STATE_COUNTY_PASTOR', 'State/County Pastor', 6, 'station', NULL, 'Serves as resident in county/state headquarters, reports to Home Mission Pastor (Liberia) or National Pastor (outside Liberia)'),
('RESIDENT_PASTOR', 'Resident Pastor', 7, 'station', NULL, 'Have access to offices under station, reports to senior of location'),
('ASSISTANT_PASTOR', 'Assistant Pastor', 8, 'station', NULL, 'Have access only to office, reports to Resident Pastor'),
('ADMINISTRATIVE_PASTOR', 'Administrative Pastor', 8, 'station', NULL, 'Have access only to office, reports to Resident Pastor'),

-- HEADQUARTERS LOCAL ADMINISTRATIVE OFFICES
('RESIDENT_PASTOR_HQ', 'Resident Pastor (Headquarters)', 3, 'local', 'Headquarters', 'Have access to office of assistant resident, church growth, etc UNDER HEADQUARTERS, no access to finance office, reports to President'),
('ASSISTANT_RESIDENT_PASTOR', 'Assistant Resident Pastor', 4, 'local', 'Headquarters', 'Shall have access to church growth only, reports to Resident Pastor'),
('CHURCH_GROWTH_DEPT', 'Church Growth Department', 4, 'local', 'Headquarters', 'Members Data, Stewards Data, Homecell Fellowship Data'),
('FINANCE_OFFICER', 'Finance Officer / Finance Department', 3, 'local', 'Headquarters', 'Shall have access to office only, reports to President'),
('MUSIC_PASTOR', 'Music Pastor', 4, 'local', 'Headquarters', 'Shall have access to office only, reports to Resident Pastor'),
('OFFICE_ASSISTANT', 'Office Assistant', 5, 'local', 'Headquarters', 'Shall have access to office only, reports to Resident Pastor'),
('PASTOR_ON_DUTY', 'Pastor on Duty', 4, 'local', 'Headquarters', 'Shall have access to office only, reports to Resident Pastor'),
('AUXILIARY_STAFF', 'Auxiliary Staff', 9, 'station', NULL, 'Have access only to office, reports to Resident Pastor');

-- Insert role hierarchy (reporting relationships)
INSERT OR IGNORE INTO role_hierarchy (role_id, reports_to_role_id) 
SELECT r1.id, r2.id FROM roles r1, roles r2
WHERE 
  -- Vice President MA reports to President
  (r1.role_code = 'VICE_PRESIDENT_MA' AND r2.role_code = 'PRESIDENT')
  OR
  -- Mission Inspectorate (National) reports to Vice President MA
  (r1.role_code = 'MISSION_INSPECTORATE_NATIONAL' AND r2.role_code = 'VICE_PRESIDENT_MA')
  OR
  -- Executive Secretary reports to all National offices except Mission Secretary
  (r1.role_code = 'EXECUTIVE_SECRETARY' AND r2.role_code IN ('PRESIDENT', 'VICE_PRESIDENT_MA', 'MISSION_INSPECTORATE_NATIONAL'))
  OR
  -- Mission Secretary reports to National offices except Executive Secretary
  (r1.role_code = 'MISSION_SECRETARY' AND r2.role_code IN ('PRESIDENT', 'VICE_PRESIDENT_MA', 'MISSION_INSPECTORATE_NATIONAL'))
  OR
  -- Vice President Mission reports to President
  (r1.role_code = 'VICE_PRESIDENT_MISSION' AND r2.role_code = 'PRESIDENT')
  OR
  -- Mission Inspectorate Mission reports to Vice President
  (r1.role_code = 'MISSION_INSPECTORATE_MISSION' AND r2.role_code = 'VICE_PRESIDENT_MISSION')
  OR
  -- Mission Secretary Mission reports to National offices except Executive Secretary
  (r1.role_code = 'MISSION_SECRETARY_MISSION' AND r2.role_code IN ('PRESIDENT', 'VICE_PRESIDENT_MA', 'MISSION_INSPECTORATE_NATIONAL'))
  OR
  -- Home Mission Pastor reports to Mission Secretary
  (r1.role_code = 'HOME_MISSION_PASTOR' AND r2.role_code = 'MISSION_SECRETARY')
  OR
  -- Foreign Mission Pastor reports to Mission Secretary
  (r1.role_code = 'FOREIGN_MISSION_PASTOR' AND r2.role_code = 'MISSION_SECRETARY')
  OR
  -- Home Mission departments report to Home Mission Pastor
  (r1.role_code IN ('TRAINING_DEV_HOME', 'LEGAL_SERVICES_HOME', 'CHURCH_GROWTH_EXPANSION') AND r2.role_code = 'HOME_MISSION_PASTOR')
  OR
  -- Foreign Mission departments report to Foreign Mission Pastor
  (r1.role_code IN ('TRAINING_DEV_FOREIGN', 'LEGAL_SERVICES_FOREIGN', 'FINANCE_BUDGET_FOREIGN') AND r2.role_code = 'FOREIGN_MISSION_PASTOR')
  OR
  -- Personnel reports to Mission office
  (r1.role_code = 'PERSONNEL_OFFICER' AND r2.role_code = 'VICE_PRESIDENT_MISSION')
  OR
  -- Education Secretary reports to Vice President MA
  (r1.role_code = 'EDUCATION_SECRETARY' AND r2.role_code = 'VICE_PRESIDENT_MA')
  OR
  -- Education Directors report to Education Secretary
  (r1.role_code IN ('DIRECTOR_PRIMARY_SECONDARY', 'DIRECTOR_HIGHER_LEARNING') AND r2.role_code = 'EDUCATION_SECRETARY')
  OR
  -- Education departments report to their directors
  (r1.role_code = 'PRIMARY_SECONDARY_SCHOOL' AND r2.role_code = 'DIRECTOR_PRIMARY_SECONDARY')
  OR
  (r1.role_code = 'HIGHER_LEARNING' AND r2.role_code = 'DIRECTOR_HIGHER_LEARNING')
  OR
  -- Regional Pastor reports to Foreign Mission Pastor
  (r1.role_code = 'REGIONAL_PASTOR' AND r2.role_code = 'FOREIGN_MISSION_PASTOR')
  OR
  -- National Pastor reports to Regional Pastor
  (r1.role_code = 'NATIONAL_PASTOR' AND r2.role_code = 'REGIONAL_PASTOR')
  OR
  -- State/County Pastor reports to Home Mission Pastor (Liberia) or National Pastor (outside)
  (r1.role_code = 'STATE_COUNTY_PASTOR' AND r2.role_code IN ('HOME_MISSION_PASTOR', 'NATIONAL_PASTOR'))
  OR
  -- Resident Pastor reports to State/County or National Pastor
  (r1.role_code = 'RESIDENT_PASTOR' AND r2.role_code IN ('STATE_COUNTY_PASTOR', 'NATIONAL_PASTOR'))
  OR
  -- Assistant/Administrative Pastors report to Resident Pastor
  (r1.role_code IN ('ASSISTANT_PASTOR', 'ADMINISTRATIVE_PASTOR') AND r2.role_code = 'RESIDENT_PASTOR')
  OR
  -- Headquarters Resident Pastor reports to President
  (r1.role_code = 'RESIDENT_PASTOR_HQ' AND r2.role_code = 'PRESIDENT')
  OR
  -- Assistant Resident Pastor reports to Resident Pastor HQ
  (r1.role_code = 'ASSISTANT_RESIDENT_PASTOR' AND r2.role_code = 'RESIDENT_PASTOR_HQ')
  OR
  -- Finance Officer reports to President
  (r1.role_code = 'FINANCE_OFFICER' AND r2.role_code = 'PRESIDENT')
  OR
  -- Music Pastor, Office Assistant, Pastor on Duty report to Resident Pastor HQ
  (r1.role_code IN ('MUSIC_PASTOR', 'OFFICE_ASSISTANT', 'PASTOR_ON_DUTY') AND r2.role_code = 'RESIDENT_PASTOR_HQ')
  OR
  -- Auxiliary Staff reports to Resident Pastor
  (r1.role_code = 'AUXILIARY_STAFF' AND r2.role_code IN ('RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'));

-- Insert departments
INSERT OR IGNORE INTO departments (department_code, department_name, parent_department_id, office_type, location, description) VALUES
('NATIONAL_OFFICE', 'National Office', NULL, 'national', 'both', 'Top level administrative office'),
('MISSION_OFFICE', 'Mission Office', NULL, 'mission', 'both', 'Mission administration office'),
('HOME_MISSION', 'Home Mission', (SELECT id FROM departments WHERE department_code = 'MISSION_OFFICE'), 'department', 'liberia', 'Home Mission Department'),
('FOREIGN_MISSION', 'Foreign Mission', (SELECT id FROM departments WHERE department_code = 'MISSION_OFFICE'), 'department', 'foreign', 'Foreign Mission Department - Africa and the World'),
('PERSONNEL_DEPT', 'Personnel Department', (SELECT id FROM departments WHERE department_code = 'MISSION_OFFICE'), 'department', 'both', 'Personnel Department'),
('EDUCATION_OFFICE', 'Education Office', NULL, 'mission', 'both', 'Education administration office'),
('PRIMARY_SECONDARY_EDU', 'Primary-Secondary Education', (SELECT id FROM departments WHERE department_code = 'EDUCATION_OFFICE'), 'department', 'both', 'Primary and Secondary Education Department'),
('HIGHER_LEARNING_EDU', 'Higher Learning', (SELECT id FROM departments WHERE department_code = 'EDUCATION_OFFICE'), 'department', 'both', 'Higher Learning Department'),
('HEADQUARTERS_LOCAL', 'Headquarters Local Administrative', NULL, 'local', 'both', 'Headquarters local administrative offices'),
('CHURCH_GROWTH', 'Church Growth Department', (SELECT id FROM departments WHERE department_code = 'HEADQUARTERS_LOCAL'), 'department', 'both', 'Church Growth - Members Data, Stewards Data, Homecell Fellowship Data');

-- Insert role access permissions (who can access which offices)
-- This is complex, so we'll create a function/trigger to handle this dynamically
-- For now, we'll insert key access rules

-- President has access to all
INSERT OR IGNORE INTO role_access (role_id, accessible_role_id, access_type)
SELECT (SELECT id FROM roles WHERE role_code = 'PRESIDENT'), id, 'full' FROM roles WHERE role_code != 'PRESIDENT';

-- Vice President MA has access to Mission Office and Education Office
INSERT OR IGNORE INTO role_access (role_id, accessible_role_id, access_type)
SELECT (SELECT id FROM roles WHERE role_code = 'VICE_PRESIDENT_MA'), id, 'full' FROM roles 
WHERE office_type IN ('mission', 'department') OR role_code LIKE '%EDUCATION%' OR role_code LIKE '%MISSION%';

-- Mission Secretary has access to all Mission Office departments
INSERT OR IGNORE INTO role_access (role_id, accessible_role_id, access_type)
SELECT (SELECT id FROM roles WHERE role_code = 'MISSION_SECRETARY'), id, 'full' FROM roles 
WHERE office_type = 'mission' OR department IN ('Home Mission', 'Foreign Mission', 'Personnel');

-- Home Mission Pastor has access to Home Mission departments and Liberia stations
INSERT OR IGNORE INTO role_access (role_id, accessible_role_id, access_type)
SELECT (SELECT id FROM roles WHERE role_code = 'HOME_MISSION_PASTOR'), id, 'full' FROM roles 
WHERE department = 'Home Mission' OR (office_type = 'station' AND role_code IN ('STATE_COUNTY_PASTOR', 'RESIDENT_PASTOR', 'ASSISTANT_PASTOR', 'ADMINISTRATIVE_PASTOR'));

-- Foreign Mission Pastor has access to Foreign Mission departments and foreign stations
INSERT OR IGNORE INTO role_access (role_id, accessible_role_id, access_type)
SELECT (SELECT id FROM roles WHERE role_code = 'FOREIGN_MISSION_PASTOR'), id, 'full' FROM roles 
WHERE department = 'Foreign Mission' OR role_code IN ('REGIONAL_PASTOR', 'NATIONAL_PASTOR');

-- Regional Pastor has access to National Pastors and stations in region
INSERT OR IGNORE INTO role_access (role_id, accessible_role_id, access_type)
SELECT (SELECT id FROM roles WHERE role_code = 'REGIONAL_PASTOR'), id, 'full' FROM roles 
WHERE role_code IN ('NATIONAL_PASTOR', 'RESIDENT_PASTOR', 'ASSISTANT_PASTOR', 'ADMINISTRATIVE_PASTOR');

-- National Pastor has access to stations in country
INSERT OR IGNORE INTO role_access (role_id, accessible_role_id, access_type)
SELECT (SELECT id FROM roles WHERE role_code = 'NATIONAL_PASTOR'), id, 'full' FROM roles 
WHERE role_code IN ('RESIDENT_PASTOR', 'ASSISTANT_PASTOR', 'ADMINISTRATIVE_PASTOR', 'AUXILIARY_STAFF');

-- State/County Pastor has access to stations in state/county
INSERT OR IGNORE INTO role_access (role_id, accessible_role_id, access_type)
SELECT (SELECT id FROM roles WHERE role_code = 'STATE_COUNTY_PASTOR'), id, 'full' FROM roles 
WHERE role_code IN ('RESIDENT_PASTOR', 'ASSISTANT_PASTOR', 'ADMINISTRATIVE_PASTOR', 'AUXILIARY_STAFF');

-- Resident Pastor has access to station offices
INSERT OR IGNORE INTO role_access (role_id, accessible_role_id, access_type)
SELECT (SELECT id FROM roles WHERE role_code = 'RESIDENT_PASTOR'), id, 'full' FROM roles 
WHERE role_code IN ('ASSISTANT_PASTOR', 'ADMINISTRATIVE_PASTOR', 'AUXILIARY_STAFF');

-- Resident Pastor HQ has access to HQ offices except Finance
INSERT OR IGNORE INTO role_access (role_id, accessible_role_id, access_type)
SELECT (SELECT id FROM roles WHERE role_code = 'RESIDENT_PASTOR_HQ'), id, 'full' FROM roles 
WHERE role_code IN ('ASSISTANT_RESIDENT_PASTOR', 'CHURCH_GROWTH_DEPT', 'MUSIC_PASTOR', 'OFFICE_ASSISTANT', 'PASTOR_ON_DUTY') 
AND role_code != 'FINANCE_OFFICER';

-- Assistant Resident Pastor has access to Church Growth only
INSERT OR IGNORE INTO role_access (role_id, accessible_role_id, access_type)
SELECT (SELECT id FROM roles WHERE role_code = 'ASSISTANT_RESIDENT_PASTOR'), (SELECT id FROM roles WHERE role_code = 'CHURCH_GROWTH_DEPT'), 'full';

-- Reports table for department reports
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  department TEXT NOT NULL,
  report_type TEXT NOT NULL, -- 'weekly', 'monthly', 'custom'
  report_period_start DATE NOT NULL,
  report_period_end DATE NOT NULL,
  overview TEXT,
  general_observations TEXT,
  task_completion_rate REAL, -- Percentage
  recommendations TEXT,
  conclusion TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at DATETIME,
  approved_by INTEGER,
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES branches(id) ON DELETE SET NULL
);

-- Staff performance entries within reports
CREATE TABLE IF NOT EXISTS report_staff_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  staff_name TEXT NOT NULL,
  completed_tasks TEXT, -- JSON array or text
  pending_tasks TEXT, -- JSON array or text
  tasks_completed_count INTEGER DEFAULT 0,
  tasks_pending_count INTEGER DEFAULT 0,
  support_needed TEXT,
  remarks TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_reports_branch ON reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_reports_department ON reports(department);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_report_staff_report ON report_staff_performance(report_id);

-- Phase 8: Approval workflow engine
CREATE TABLE IF NOT EXISTS approval_workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER,
  action_type TEXT NOT NULL,
  name TEXT NOT NULL,
  require_approval INTEGER DEFAULT 1,
  allow_self_approve INTEGER DEFAULT 0,
  approver_permission TEXT,
  approver_role_code TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(church_id, action_type)
);

CREATE TABLE IF NOT EXISTS workflow_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  branch_id INTEGER,
  action_type TEXT NOT NULL,
  record_type TEXT,
  record_id INTEGER,
  payload_json TEXT,
  amount REAL,
  reason TEXT,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
  requester_id INTEGER NOT NULL,
  requester_type TEXT NOT NULL DEFAULT 'branch',
  approver_id INTEGER,
  approver_type TEXT,
  approval_comments TEXT,
  rejection_comments TEXT,
  requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  actioned_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_requests_church_status
  ON workflow_requests(church_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_requests_action
  ON workflow_requests(action_type, status);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_action
  ON approval_workflows(action_type);

-- Phase 10: Households & families
CREATE TABLE IF NOT EXISTS households (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  branch_id INTEGER,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  phone TEXT,
  notes TEXT,
  head_member_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS household_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  household_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'other'
    CHECK(relationship IN ('head', 'spouse', 'child', 'dependent', 'other')),
  is_primary_contact INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE(household_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_households_church ON households(church_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_member ON household_members(member_id);

-- Phase 11: Visitors & follow-up
CREATE TABLE IF NOT EXISTS visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  branch_id INTEGER,
  firstname TEXT NOT NULL,
  middlename TEXT,
  lastname TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  sex TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  first_visit_date TEXT,
  invited_by TEXT,
  invited_by_member_id INTEGER,
  service_attended TEXT,
  prayer_request TEXT,
  follow_up_status TEXT NOT NULL DEFAULT 'New'
    CHECK(follow_up_status IN ('New', 'Contacted', 'Follow-up', 'Interested', 'Converted', 'Closed')),
  assigned_to INTEGER,
  notes TEXT,
  converted_member_id INTEGER,
  converted_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visitor_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  visitor_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_visitors_church_status ON visitors(church_id, follow_up_status);
CREATE INDEX IF NOT EXISTS idx_visitor_followups_visitor ON visitor_followups(visitor_id);

