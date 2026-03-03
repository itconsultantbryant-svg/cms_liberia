const db = require('../database');

class RoleManager {
  // Get user's roles
  static async getUserRoles(userId, userType = 'branch') {
    try {
      const roles = await db.allAsync(
        `SELECT r.*, ur.department_id, ur.location, ur.is_active
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = ? AND ur.user_type = ? AND ur.is_active = 1`,
        [userId, userType]
      );
      return roles || [];
    } catch (error) {
      console.error('[RoleManager] Error getting user roles:', error);
      // Return empty array if there's an error (e.g., table doesn't exist)
      return [];
    }
  }

  // Get user's primary role (highest level)
  static async getPrimaryRole(userId, userType = 'branch') {
    try {
      const role = await db.getAsync(
        `SELECT r.*, ur.department_id, ur.location
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = ? AND ur.user_type = ? AND ur.is_active = 1
        ORDER BY r.level ASC
        LIMIT 1`,
        [userId, userType]
      );
      return role || null;
    } catch (error) {
      console.error('[RoleManager] Error getting primary role:', error);
      // Return null if there's an error (e.g., table doesn't exist)
      return null;
    }
  }

  // Check if user has access to a specific role/office
  static async hasAccess(userId, userType, targetRoleCode) {
    const userRoles = await this.getUserRoles(userId, userType);
    
    // President has access to everything
    const isPresident = userRoles.some(r => r.role_code === 'PRESIDENT');
    if (isPresident) return true;

    // Check direct access
    const hasDirectAccess = await db.getAsync(
      `SELECT 1 FROM role_access ra
      JOIN user_roles ur ON ra.role_id = ur.role_id
      JOIN roles r ON ra.accessible_role_id = r.id
      WHERE ur.user_id = ? AND ur.user_type = ? AND ur.is_active = 1
      AND r.role_code = ?`,
      [userId, userType, targetRoleCode]
    );

    if (hasDirectAccess) return true;

    // Check if user's role level is higher than target role
    const userRole = await this.getPrimaryRole(userId, userType);
    const targetRole = await db.getAsync('SELECT level FROM roles WHERE role_code = ?', [targetRoleCode]);
    
    if (userRole && targetRole && userRole.level < targetRole.level) {
      return true;
    }

    return false;
  }

  // Get roles that report to user's role
  static async getReportingRoles(userId, userType = 'branch') {
    const userRole = await this.getPrimaryRole(userId, userType);
    if (!userRole) return [];

    const reportingRoles = await db.allAsync(
      `SELECT r.* FROM roles r
      JOIN role_hierarchy rh ON r.id = rh.role_id
      WHERE rh.reports_to_role_id = ?`,
      [userRole.id]
    );

    return reportingRoles;
  }

  // Get all accessible roles for a user
  static async getAccessibleRoles(userId, userType = 'branch') {
    const userRoles = await this.getUserRoles(userId, userType);
    
    // President has access to everything
    const isPresident = userRoles.some(r => r.role_code === 'PRESIDENT');
    if (isPresident) {
      return await db.allAsync('SELECT * FROM roles ORDER BY level, role_name');
    }

    // Get accessible roles
    const accessibleRoles = await db.allAsync(
      `SELECT DISTINCT r.* FROM roles r
      JOIN role_access ra ON r.id = ra.accessible_role_id
      JOIN user_roles ur ON ra.role_id = ur.role_id
      WHERE ur.user_id = ? AND ur.user_type = ? AND ur.is_active = 1
      ORDER BY r.level, r.role_name`,
      [userId, userType]
    );

    return accessibleRoles;
  }

  // Assign role to user
  static async assignRole(userId, userType, roleCode, departmentId = null, location = null, assignedBy = null) {
    const role = await db.getAsync('SELECT id FROM roles WHERE role_code = ?', [roleCode]);
    if (!role) throw new Error('Role not found');

    const result = await db.runAsync(
      `INSERT INTO user_roles (user_id, user_type, role_id, department_id, location, assigned_by)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, userType, role.id, departmentId, location, assignedBy]
    );

    return result;
  }

  // Get role hierarchy tree
  static async getRoleHierarchy(roleCode = null) {
    if (roleCode) {
      const role = await db.getAsync('SELECT * FROM roles WHERE role_code = ?', [roleCode]);
      if (!role) return null;

      const reportsTo = await db.allAsync(
        `SELECT r.* FROM roles r
        JOIN role_hierarchy rh ON r.id = rh.reports_to_role_id
        WHERE rh.role_id = ?`,
        [role.id]
      );

      const reportsFrom = await db.allAsync(
        `SELECT r.* FROM roles r
        JOIN role_hierarchy rh ON r.id = rh.role_id
        WHERE rh.reports_to_role_id = ?`,
        [role.id]
      );

      return {
        role,
        reportsTo: reportsTo.length > 0 ? reportsTo : null,
        reportsFrom: reportsFrom.length > 0 ? reportsFrom : null
      };
    }

    // Get full hierarchy
    const hierarchy = await db.allAsync(
      `SELECT 
        r1.role_code as role,
        r1.role_name as role_name,
        r1.level as level,
        r2.role_code as reports_to,
        r2.role_name as reports_to_name
      FROM role_hierarchy rh
      JOIN roles r1 ON rh.role_id = r1.id
      LEFT JOIN roles r2 ON rh.reports_to_role_id = r2.id
      ORDER BY r1.level, r1.role_name`
    );

    return hierarchy;
  }

  // Check if user can perform action
  static async canPerformAction(userId, userType, action, resource = null) {
    const userRole = await this.getPrimaryRole(userId, userType);
    if (!userRole) return false;

    // President can do everything
    if (userRole.role_code === 'PRESIDENT') return true;

    // Define action permissions based on role
    const actionPermissions = {
      'create_member': ['PRESIDENT', 'RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'ASSISTANT_PASTOR', 'ADMINISTRATIVE_PASTOR', 'STATE_COUNTY_PASTOR', 'NATIONAL_PASTOR', 'REGIONAL_PASTOR'],
      'edit_member': ['PRESIDENT', 'RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'ASSISTANT_PASTOR', 'ADMINISTRATIVE_PASTOR', 'STATE_COUNTY_PASTOR', 'NATIONAL_PASTOR', 'REGIONAL_PASTOR'],
      'delete_member': ['PRESIDENT', 'RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'STATE_COUNTY_PASTOR', 'NATIONAL_PASTOR'],
      'view_finance': ['PRESIDENT', 'FINANCE_OFFICER', 'VICE_PRESIDENT_MA', 'MISSION_SECRETARY'],
      'edit_finance': ['PRESIDENT', 'FINANCE_OFFICER'],
      'view_reports': ['PRESIDENT', 'VICE_PRESIDENT_MA', 'MISSION_SECRETARY', 'EDUCATION_SECRETARY', 'MISSION_INSPECTORATE_NATIONAL', 'MISSION_INSPECTORATE_MISSION'],
      'manage_roles': ['PRESIDENT', 'MISSION_SECRETARY'],
      'mark_attendance': ['PRESIDENT', 'RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'ASSISTANT_PASTOR', 'ADMINISTRATIVE_PASTOR', 'PASTOR_ON_DUTY'],
      'record_collection': ['PRESIDENT', 'RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'FINANCE_OFFICER'],
    };

    const allowedRoles = actionPermissions[action] || [];
    return allowedRoles.includes(userRole.role_code);
  }
}

module.exports = RoleManager;

