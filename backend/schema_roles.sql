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

