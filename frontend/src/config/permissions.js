/**
 * Permission keys that admin can assign to users.
 * Users see only dashboard and sidebar items they have permission (or role) for.
 */
export const AVAILABLE_PERMISSIONS = [
  { key: 'view_dashboard', label: 'View Dashboard' },
  { key: 'view_members', label: 'View / Add Members' },
  { key: 'record_attendance', label: 'Record Attendance' },
  { key: 'record_collections', label: 'Record Collections' },
  { key: 'view_events', label: 'View Events' },
  { key: 'view_groups', label: 'View Groups' },
  { key: 'view_reports', label: 'View Reports' },
  { key: 'view_communications', label: 'Communications' },
  { key: 'manage_finance', label: 'Finance Dashboard & Financials' },
  { key: 'manage_staff', label: 'Staff Management' },
  { key: 'manage_payroll', label: 'Payroll Management' },
  { key: 'user_management', label: 'User Management' },
  { key: 'role_management', label: 'Role Management' },
  { key: 'departments', label: 'Departments' },
  { key: 'request_management', label: 'Request Management' },
  { key: 'pastor_dashboard', label: 'Pastor Dashboard' },
  { key: 'vp_dashboard', label: 'VP Dashboard' },
  { key: 'manage_branding', label: 'Church Branding' },
  { key: 'pastoral_care', label: 'Pastoral Care (confidential)' },
  { key: 'view_documents', label: 'Document Library' },
  { key: 'manage_assets', label: 'Assets & Inventory' },
];

/** Admin roles see all sidebar items */
export const ADMIN_ROLES = ['PRESIDENT', 'MISSION_SECRETARY'];

/**
 * Sidebar sections for a detailed, grouped menu. Admin sees all sections.
 */
export const SIDEBAR_SECTIONS = [
  {
    title: 'Overview',
    items: [
      { path: '/', label: 'Dashboard', description: 'Overview & stats', icon: '📊', permission: 'view_dashboard', roleCodes: null },
      { path: '/notifications', label: 'Notifications', description: 'Alerts & notification history', icon: '🔔', permission: 'view_dashboard', roleCodes: null },
    ],
  },
  {
    title: 'Operations',
    items: [
      { path: '/members', label: 'Members', description: 'Register & manage church members', icon: '👥', permission: 'view_members', roleCodes: null },
      { path: '/households', label: 'Households', description: 'Families & household profiles', icon: '🏠', permission: 'view_members', roleCodes: null },
      { path: '/visitors', label: 'Visitors', description: 'Visitor registration & follow-up', icon: '🚪', permission: 'view_members', roleCodes: null },
      { path: '/services', label: 'Services', description: 'Worship & service types', icon: '⛪', permission: 'record_attendance', roleCodes: null },
      { path: '/attendance', label: 'Attendance', description: 'Record & view service attendance', icon: '✓', permission: 'record_attendance', roleCodes: null },
      { path: '/collections', label: 'Collections', description: 'Offerings, tithes & donations', icon: '💰', permission: 'record_collections', roleCodes: null },
      { path: '/events', label: 'Events', description: 'Church events & calendar', icon: '📅', permission: 'view_events', roleCodes: null },
      { path: '/groups', label: 'Ministries', description: 'Ministries, groups & departments', icon: '🙏', permission: 'view_groups', roleCodes: null },
      { path: '/pastoral', label: 'Pastoral Care', description: 'Confidential care & visits', icon: '🕊️', permission: 'pastoral_care', roleCodes: ['PRESIDENT', 'RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'SENIOR_PASTOR', 'ASSOCIATE_PASTOR', 'BRANCH_PASTOR'], confidential: true },
      { path: '/documents', label: 'Documents', description: 'Policies, minutes & files', icon: '📁', permission: 'view_documents', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY', 'SECRETARY', 'RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'FINANCE_OFFICER'] },
      { path: '/assets', label: 'Assets', description: 'Inventory & equipment', icon: '📦', permission: 'manage_assets', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY', 'FINANCE_OFFICER', 'RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'] },
      { path: '/reports', label: 'Reports', description: 'Membership, attendance, finance & ministry analytics', icon: '📈', permission: 'view_reports', roleCodes: null },
      { path: '/communications', label: 'Communications', description: 'Messages & announcements', icon: '✉️', permission: 'view_communications', roleCodes: null },
    ],
  },
  {
    title: 'Finance & Staff',
    items: [
      { path: '/finance', label: 'Finance Dashboard', description: 'Financials, requests & approvals', icon: '💰', permission: 'manage_finance', roleCodes: ['FINANCE_OFFICER', 'PRESIDENT', 'MISSION_SECRETARY'] },
      { path: '/finance/ledger', label: 'Finance Ledger', description: 'Income, expenses & reversals', icon: '📒', permission: 'manage_finance', roleCodes: ['FINANCE_OFFICER', 'PRESIDENT', 'MISSION_SECRETARY'] },
      { path: '/pledges', label: 'Pledges & Donations', description: 'Pledges, gifts & receipts', icon: '🎁', permission: 'manage_finance', roleCodes: ['FINANCE_OFFICER', 'PRESIDENT', 'MISSION_SECRETARY'] },
      { path: '/budgets', label: 'Budgets', description: 'Budget vs actual & variance', icon: '📊', permission: 'manage_finance', roleCodes: ['FINANCE_OFFICER', 'PRESIDENT', 'MISSION_SECRETARY'] },
      { path: '/staff', label: 'Staff Management', description: 'Add & manage church staff', icon: '👔', permission: 'manage_staff', roleCodes: ['FINANCE_OFFICER', 'RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'] },
      { path: '/payroll', label: 'Payroll Management', description: 'Payroll runs & approvals', icon: '💵', permission: 'manage_payroll', roleCodes: ['FINANCE_OFFICER'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { path: '/users', label: 'User Management', description: 'Create users & assign roles', icon: '👤', permission: 'user_management', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY'] },
      { path: '/roles', label: 'Role Management', description: 'Roles & hierarchy', icon: '👔', permission: 'role_management', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY'] },
      { path: '/departments', label: 'Departments', description: 'Departments & structure', icon: '🏢', permission: 'departments', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY'] },
      { path: '/settings', label: 'Church Settings', description: 'Profile, fiscal year, numbering & prefs', icon: '⚙️', permission: 'manage_branding', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY'] },
      { path: '/settings/branding', label: 'Church Branding', description: 'Logo, colors & church identity', icon: '🎨', permission: 'manage_branding', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY'] },
      { path: '/settings/admins', label: 'Church Admins', description: 'Add & manage church administrators', icon: '🛡️', permission: 'user_management', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY'] },
      { path: '/branches', label: 'Branches', description: 'Campuses, HQ & branch context', icon: '🏛️', permission: 'user_management', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY'] },
      { path: '/workflows', label: 'Approvals', description: 'Workflow approval requests', icon: '✅', permission: 'user_management', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY', 'FINANCE_OFFICER'] },
      { path: '/audit', label: 'Audit Log', description: 'Immutable activity history', icon: '🧾', permission: 'view_reports', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY', 'FINANCE_OFFICER'] },
      { path: '/mission-secretary', label: 'Request Management', description: 'Review & approve requests', icon: '📋', permission: 'request_management', roleCodes: ['MISSION_SECRETARY', 'MISSION_SECRETARY_MISSION'] },
    ],
  },
  {
    title: 'Role Dashboards',
    items: [
      { path: '/resident-pastor', label: 'Pastor Dashboard', description: 'Resident Pastor view', icon: '🏛️', permission: 'pastor_dashboard', roleCodes: ['RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'] },
      { path: '/vice-president', label: 'VP Dashboard', description: 'Vice President view', icon: '👔', permission: 'vp_dashboard', roleCodes: ['VICE_PRESIDENT_MA', 'VICE_PRESIDENT_MISSION'] },
    ],
  },
];

/** Flat list of all items (backward compatibility) */
export const SIDEBAR_CONFIG = SIDEBAR_SECTIONS.flatMap(s => s.items);

/**
 * Returns whether the user can see a sidebar item.
 * Admin (PRESIDENT, MISSION_SECRETARY) sees all items except confidential ones.
 */
export function canShowSidebarItem(item, user) {
  if (!user) return false;
  const isSubUser = user.userType === 'sub_user';
  const perms = user.permissions || [];
  const roleCode = user.primaryRole?.role_code;

  if (item.confidential) {
    const hasPermission = item.permission && Array.isArray(perms) && perms.includes(item.permission);
    const hasRole = item.roleCodes && roleCode && item.roleCodes.includes(roleCode);
    return !!(hasPermission || hasRole);
  }

  if (ADMIN_ROLES.includes(roleCode)) return true;
  if (user.isadmin && (item.path === '/settings' || item.path === '/settings/branding' || item.path === '/settings/admins' || item.path === '/branches' || item.path === '/workflows')) return true;

  if (isSubUser) {
    const subUserPermMap = {
      '/': 'view_dashboard',
      '/members': 'view_members',
      '/attendance': 'record_attendance',
      '/collections': 'record_collections',
      '/reports': 'view_reports',
    };
    const need = subUserPermMap[item.path];
    if (item.path === '/') return true;
    if (need) {
      if (need === 'view_members') {
        return perms.includes('view_members') || perms.includes('add_members');
      }
      return perms.includes(need);
    }
    return false;
  }

  const hasPermission = item.permission && Array.isArray(perms) && perms.includes(item.permission);
  const hasRole = item.roleCodes && roleCode && item.roleCodes.includes(roleCode);
  if (item.path === '/') return true;
  return hasPermission || hasRole;
}
