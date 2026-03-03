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
];

/**
 * Sidebar menu items. Shown if user has the required permission OR one of the roleCodes.
 * permission: key from AVAILABLE_PERMISSIONS (for branch users with assigned permissions).
 * roleCodes: fallback for role-based access (e.g. FINANCE_OFFICER always sees finance).
 */
export const SIDEBAR_CONFIG = [
  { path: '/', label: 'Dashboard', icon: '📊', permission: 'view_dashboard', roleCodes: null },
  { path: '/members', label: 'Members', icon: '👥', permission: 'view_members', roleCodes: null },
  { path: '/attendance', label: 'Attendance', icon: '✓', permission: 'record_attendance', roleCodes: null },
  { path: '/collections', label: 'Collections', icon: '💰', permission: 'record_collections', roleCodes: null },
  { path: '/events', label: 'Events', icon: '📅', permission: 'view_events', roleCodes: null },
  { path: '/groups', label: 'Groups', icon: '👤', permission: 'view_groups', roleCodes: null },
  { path: '/reports', label: 'Reports', icon: '📈', permission: 'view_reports', roleCodes: null },
  { path: '/communications', label: 'Communications', icon: '✉️', permission: 'view_communications', roleCodes: null },
  { path: '/finance', label: 'Finance Dashboard', icon: '💰', permission: 'manage_finance', roleCodes: ['FINANCE_OFFICER', 'PRESIDENT', 'MISSION_SECRETARY'] },
  { path: '/staff', label: 'Staff Management', icon: '👔', permission: 'manage_staff', roleCodes: ['FINANCE_OFFICER', 'RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'] },
  { path: '/payroll', label: 'Payroll', icon: '💵', permission: 'manage_payroll', roleCodes: ['FINANCE_OFFICER'] },
  { path: '/users', label: 'User Management', icon: '👤', permission: 'user_management', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY'] },
  { path: '/roles', label: 'Role Management', icon: '👔', permission: 'role_management', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY'] },
  { path: '/departments', label: 'Departments', icon: '🏢', permission: 'departments', roleCodes: ['PRESIDENT', 'MISSION_SECRETARY'] },
  { path: '/mission-secretary', label: 'Request Management', icon: '📋', permission: 'request_management', roleCodes: ['MISSION_SECRETARY', 'MISSION_SECRETARY_MISSION'] },
  { path: '/resident-pastor', label: 'Pastor Dashboard', icon: '🏛️', permission: 'pastor_dashboard', roleCodes: ['RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'] },
  { path: '/vice-president', label: 'VP Dashboard', icon: '👔', permission: 'vp_dashboard', roleCodes: ['VICE_PRESIDENT_MA', 'VICE_PRESIDENT_MISSION'] },
];

/**
 * Returns whether the user can see a sidebar item.
 * Sub-users: use permissions array only (from backend).
 * Branch users: show if (permissions include item.permission) OR (primaryRole in item.roleCodes).
 * If user has no permissions array (legacy), use only roleCodes.
 */
export function canShowSidebarItem(item, user) {
  if (!user) return false;
  const isSubUser = user.userType === 'sub_user';
  const perms = user.permissions || [];
  const roleCode = user.primaryRole?.role_code;

  if (isSubUser) {
    const subUserPermMap = {
      '/': 'view_dashboard',
      '/members': 'add_members',
      '/attendance': 'record_attendance',
      '/collections': 'record_collections',
      '/reports': 'view_reports',
    };
    const need = subUserPermMap[item.path];
    if (item.path === '/') return true;
    if (need) return perms.includes(need);
    return false;
  }

  const hasPermission = item.permission && Array.isArray(perms) && perms.includes(item.permission);
  const hasRole = item.roleCodes && roleCode && item.roleCodes.includes(roleCode);
  if (item.path === '/') return true;
  return hasPermission || hasRole;
}
