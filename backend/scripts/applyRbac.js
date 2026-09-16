/**
 * Phase 7 RBAC ensure + seed permissions and role_permission maps.
 */
const db = require('../database');

const PERMISSIONS = [
  ['members.view', 'members', 'View members'],
  ['members.create', 'members', 'Create members'],
  ['members.update', 'members', 'Update members'],
  ['members.delete', 'members', 'Delete members'],
  ['members.export', 'members', 'Export members'],
  ['finance.view', 'finance', 'View finance'],
  ['finance.create', 'finance', 'Create finance records'],
  ['finance.approve', 'finance', 'Approve finance'],
  ['expenses.create', 'finance', 'Create expenses/requests'],
  ['expenses.approve', 'finance', 'Approve expenses'],
  ['branches.manage', 'branches', 'Manage branches'],
  ['users.manage', 'users', 'Manage users'],
  ['roles.manage', 'roles', 'Manage roles & permissions'],
  ['attendance.manage', 'attendance', 'Manage attendance'],
  ['collections.manage', 'collections', 'Manage collections'],
  ['events.manage', 'events', 'Manage events'],
  ['groups.manage', 'groups', 'Manage groups/ministries'],
  ['staff.manage', 'staff', 'Manage staff'],
  ['payroll.manage', 'payroll', 'Manage payroll'],
  ['reports.view', 'reports', 'View reports'],
  ['reports.export', 'reports', 'Export reports'],
  ['settings.manage', 'settings', 'Manage church settings/branding'],
  ['communications.manage', 'communications', 'Manage communications'],
  ['documents.view', 'documents', 'View church document library'],
  ['documents.manage', 'documents', 'Upload and manage church documents'],
  ['assets.view', 'assets', 'View church assets & inventory'],
  ['assets.manage', 'assets', 'Manage church assets & inventory'],
  ['audit.view', 'audit', 'View immutable audit logs'],
  ['pastoral.view', 'pastoral', 'View confidential pastoral care cases'],
  ['pastoral.manage', 'pastoral', 'Create and manage pastoral care cases'],
  ['platform.churches.manage', 'platform', 'Manage all churches'],
  ['platform.users.manage', 'platform', 'Manage platform admins']
];

/** Church-wide defaults exclude pastoral.* (sensitive — pastor roles only) */
const ALL_CHURCH = PERMISSIONS.filter(
  p => !p[0].startsWith('platform.') && !p[0].startsWith('pastoral.')
).map(p => p[0]);

const PASTORAL = ['pastoral.view', 'pastoral.manage'];

const ROLE_PERMS = {
  PRESIDENT: [...ALL_CHURCH, ...PASTORAL],
  MISSION_SECRETARY: ALL_CHURCH.filter(k => !['roles.manage'].includes(k)).concat(['roles.manage']),
  FINANCE_OFFICER: [
    'finance.view', 'finance.create', 'finance.approve', 'expenses.create', 'expenses.approve',
    'collections.manage', 'payroll.manage', 'staff.manage', 'reports.view', 'reports.export', 'members.view'
  ],
  RESIDENT_PASTOR: [
    'members.view', 'members.create', 'members.update', 'attendance.manage', 'collections.manage',
    'events.manage', 'groups.manage', 'reports.view', 'communications.manage', 'staff.manage', ...PASTORAL
  ],
  RESIDENT_PASTOR_HQ: [
    'members.view', 'members.create', 'members.update', 'attendance.manage', 'collections.manage',
    'events.manage', 'groups.manage', 'reports.view', 'communications.manage', 'users.manage', 'staff.manage', ...PASTORAL
  ],
  // Phase 7 named templates (may be inserted if missing)
  CHURCH_ADMIN: ALL_CHURCH,
  SENIOR_PASTOR: [
    'members.view', 'members.create', 'members.update', 'attendance.manage', 'events.manage',
    'groups.manage', 'reports.view', 'communications.manage', 'settings.manage', ...PASTORAL
  ],
  ASSOCIATE_PASTOR: [
    'members.view', 'members.create', 'attendance.manage', 'events.manage', 'groups.manage', 'reports.view',
    ...PASTORAL
  ],
  SECRETARY: [
    'members.view', 'members.create', 'members.update', 'attendance.manage', 'communications.manage', 'reports.view',
    'documents.view'
  ],
  MEMBERSHIP_OFFICER: [
    'members.view', 'members.create', 'members.update', 'members.export', 'reports.view'
  ],
  HR_ADMIN_OFFICER: [
    'staff.manage', 'users.manage', 'members.view', 'reports.view'
  ],
  AUDITOR: [
    'finance.view', 'reports.view', 'reports.export', 'members.view', 'payroll.manage', 'audit.view'
  ],
  BRANCH_ADMINISTRATOR: [
    'members.view', 'members.create', 'members.update', 'attendance.manage', 'collections.manage',
    'events.manage', 'groups.manage', 'reports.view', 'users.manage'
  ],
  BRANCH_PASTOR: [
    'members.view', 'members.create', 'attendance.manage', 'events.manage', 'groups.manage', 'reports.view',
    ...PASTORAL
  ],
  BRANCH_SECRETARY: [
    'members.view', 'members.create', 'attendance.manage', 'communications.manage'
  ],
  BRANCH_FINANCE_OFFICER: [
    'finance.view', 'finance.create', 'collections.manage', 'expenses.create', 'reports.view'
  ],
  ATTENDANCE_OFFICER: [
    'attendance.manage', 'members.view'
  ],
  SUPERADMIN: ['platform.churches.manage', 'platform.users.manage', ...ALL_CHURCH, ...PASTORAL],
  PLATFORM_ADMIN: ['platform.churches.manage', 'platform.users.manage'],
  SUPPORT_OFFICER: ['platform.churches.manage', 'members.view', 'reports.view'],
  PLATFORM_FINANCE_ADMIN: ['platform.churches.manage', 'finance.view', 'reports.view', 'reports.export']
};

const NEW_ROLES = [
  ['CHURCH_ADMIN', 'Church Admin', 1, 'church'],
  ['SENIOR_PASTOR', 'Senior Pastor', 2, 'church'],
  ['ASSOCIATE_PASTOR', 'Associate Pastor', 3, 'church'],
  ['SECRETARY', 'Secretary', 4, 'church'],
  ['MEMBERSHIP_OFFICER', 'Membership Officer', 4, 'church'],
  ['HR_ADMIN_OFFICER', 'HR/Admin Officer', 4, 'church'],
  ['AUDITOR', 'Auditor', 4, 'church'],
  ['BRANCH_ADMINISTRATOR', 'Branch Administrator', 5, 'branch'],
  ['BRANCH_PASTOR', 'Branch Pastor', 5, 'branch'],
  ['BRANCH_SECRETARY', 'Branch Secretary', 6, 'branch'],
  ['BRANCH_FINANCE_OFFICER', 'Branch Finance Officer', 6, 'branch'],
  ['ATTENDANCE_OFFICER', 'Attendance Officer', 6, 'branch'],
  ['SUPERADMIN', 'Superadmin', 0, 'platform'],
  ['PLATFORM_ADMIN', 'Platform Administrator', 1, 'platform'],
  ['SUPPORT_OFFICER', 'Support Officer', 2, 'platform'],
  ['PLATFORM_FINANCE_ADMIN', 'Finance Administrator', 2, 'platform']
];

async function columnExists(table, column) {
  const cols = await db.allAsync(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function ensureColumn(table, column, ddl) {
  if (await columnExists(table, column)) return;
  await db.runAsync(ddl);
  console.log(`Added ${table}.${column}`);
}

async function apply() {
  await ensureColumn('roles', 'scope', `ALTER TABLE roles ADD COLUMN scope TEXT DEFAULT 'church'`);
  await ensureColumn('roles', 'church_id', `ALTER TABLE roles ADD COLUMN church_id INTEGER`);
  await ensureColumn('roles', 'is_system', `ALTER TABLE roles ADD COLUMN is_system INTEGER DEFAULT 1`);
  await ensureColumn('roles', 'is_custom', `ALTER TABLE roles ADD COLUMN is_custom INTEGER DEFAULT 0`);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      perm_key TEXT UNIQUE NOT NULL,
      category TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER NOT NULL,
      perm_key TEXT NOT NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      UNIQUE(role_id, perm_key)
    )
  `);

  for (const [key, category, description] of PERMISSIONS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO permissions (perm_key, category, description) VALUES (?, ?, ?)`,
      [key, category, description]
    );
  }

  // Mark existing roles as system templates
  await db.runAsync(`UPDATE roles SET is_system = 1, is_custom = 0 WHERE church_id IS NULL`);
  await db.runAsync(`UPDATE roles SET scope = COALESCE(scope, 'church') WHERE scope IS NULL OR scope = ''`);

  for (const [code, name, level, scope] of NEW_ROLES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO roles (role_code, role_name, level, office_type, description, scope, is_system, is_custom)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
      [code, name, level, scope, name, scope]
    );
    await db.runAsync(
      `UPDATE roles SET scope = ?, is_system = 1 WHERE role_code = ? AND church_id IS NULL`,
      [scope, code]
    );
  }

  // Map PRESIDENT etc. scopes
  await db.runAsync(`UPDATE roles SET scope = 'church' WHERE role_code IN ('PRESIDENT','MISSION_SECRETARY','FINANCE_OFFICER','RESIDENT_PASTOR','RESIDENT_PASTOR_HQ') AND church_id IS NULL`);

  for (const [roleCode, perms] of Object.entries(ROLE_PERMS)) {
    const role = await db.getAsync(
      `SELECT id FROM roles WHERE role_code = ? AND church_id IS NULL`,
      [roleCode]
    );
    if (!role) continue;
    for (const key of perms) {
      await db.runAsync(
        `INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, ?)`,
        [role.id, key]
      );
    }
  }

  console.log('RBAC permissions seed complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
