const db = require('../database');

// Middleware to check if user is a sub-user
const isSubUser = async (req, res, next) => {
  try {
    const subUser = await db.getAsync(
      'SELECT * FROM sub_users WHERE id = ? AND is_active = 1',
      [req.user.id]
    );

    if (subUser) {
      req.subUser = subUser;
      req.subUserPermissions = typeof subUser.permissions === 'string' 
        ? JSON.parse(subUser.permissions) 
        : subUser.permissions;
      req.userType = 'sub_user';
    } else {
      req.userType = 'branch';
    }
    
    next();
  } catch (error) {
    console.error('Sub-user check error:', error);
    req.userType = 'branch';
    next();
  }
};

// Middleware to check if sub-user has specific permission
const requireSubUserPermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (req.userType !== 'sub_user') {
        return next(); // Regular users bypass this check
      }

      if (!req.subUserPermissions || !req.subUserPermissions.includes(permission)) {
        return res.status(403).json({ 
          error: `Access denied. Required permission: ${permission}` 
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Error checking permissions' });
    }
  };
};

module.exports = {
  isSubUser,
  requireSubUserPermission
};

