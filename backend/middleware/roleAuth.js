const RoleManager = require('../utils/roles');

// Middleware to check if user has specific role
const requireRole = (...roleCodes) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userRoles = await RoleManager.getUserRoles(req.user.id, 'branch');
      const hasRole = userRoles.some(role => roleCodes.includes(role.role_code));

      if (!hasRole) {
        return res.status(403).json({ 
          error: `Access denied. Required role: ${roleCodes.join(' or ')}` 
        });
      }

      // Attach user roles to request
      req.userRoles = userRoles;
      req.primaryRole = await RoleManager.getPrimaryRole(req.user.id, 'branch');
      
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ error: 'Error checking permissions' });
    }
  };
};

// Middleware to check if user has access to specific office/role
const requireAccess = (targetRoleCode) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasAccess = await RoleManager.hasAccess(req.user.id, 'branch', targetRoleCode);

      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Access denied. Insufficient permissions for this office.' 
        });
      }

      req.userRoles = await RoleManager.getUserRoles(req.user.id, 'branch');
      req.primaryRole = await RoleManager.getPrimaryRole(req.user.id, 'branch');
      
      next();
    } catch (error) {
      console.error('Access check error:', error);
      res.status(500).json({ error: 'Error checking access' });
    }
  };
};

// Middleware to check if user can perform specific action
const requireAction = (action, resource = null) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const canPerform = await RoleManager.canPerformAction(
        req.user.id, 
        'branch', 
        action, 
        resource
      );

      if (!canPerform) {
        return res.status(403).json({ 
          error: `Access denied. You do not have permission to ${action}.` 
        });
      }

      req.userRoles = await RoleManager.getUserRoles(req.user.id, 'branch');
      req.primaryRole = await RoleManager.getPrimaryRole(req.user.id, 'branch');
      
      next();
    } catch (error) {
      console.error('Action check error:', error);
      res.status(500).json({ error: 'Error checking action permissions' });
    }
  };
};

// Middleware to attach user role info to request
const attachRoleInfo = async (req, res, next) => {
  try {
    if (req.user) {
      req.userRoles = await RoleManager.getUserRoles(req.user.id, 'branch');
      req.primaryRole = await RoleManager.getPrimaryRole(req.user.id, 'branch');
    }
    next();
  } catch (error) {
    console.error('Error attaching role info:', error);
    next();
  }
};

module.exports = {
  requireRole,
  requireAccess,
  requireAction,
  attachRoleInfo
};

