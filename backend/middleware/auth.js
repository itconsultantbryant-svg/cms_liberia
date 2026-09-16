const jwt = require('jsonwebtoken');
const db = require('../database');
const { getJwtSecret } = require('../utils/authSecurity');

const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  try {
    let secret;
    try {
      secret = getJwtSecret();
    } catch (e) {
      console.error('[Auth Middleware]', e.message);
      return res.status(500).json({ error: 'Server auth misconfiguration' });
    }

    const decoded = jwt.verify(token, secret);
    const userType = decoded.userType || 'branch';
    const tokenVersion = decoded.tokenVersion ?? 0;

    if (userType === 'sub_user') {
      const subUser = await db.getAsync(
        'SELECT id, is_active, token_version, church_id, branch_id FROM sub_users WHERE id = ?',
        [decoded.id]
      );
      if (!subUser || !subUser.is_active) {
        return res.status(401).json({ error: 'Account not found or inactive' });
      }
      if ((subUser.token_version ?? 0) !== tokenVersion) {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
      }
      req.user = { ...decoded, userType: 'sub_user', churchId: decoded.churchId || subUser.church_id };
    } else {
      const branch = await db.getAsync(
        'SELECT id, token_version, church_id, isadmin, is_platform_admin FROM branches WHERE id = ?',
        [decoded.id]
      );
      if (!branch) {
        return res.status(401).json({ error: 'Account not found' });
      }
      if ((branch.token_version ?? 0) !== tokenVersion) {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
      }
      req.user = {
        ...decoded,
        userType: 'branch',
        churchId: decoded.churchId || branch.church_id,
        isadmin: decoded.supportMode ? false : (decoded.isadmin ?? branch.isadmin),
        isSuperadmin: !!(branch.is_platform_admin),
        supportMode: !!decoded.supportMode,
        supportSessionId: decoded.supportSessionId || null,
        supportReason: decoded.supportReason || null,
        homeChurchId: decoded.homeChurchId || branch.church_id
      };
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('[Auth Middleware]', error.message);
    return res.status(401).json({ error: 'Token is not valid' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (!req.user || (!req.user.isadmin && req.user.role !== 'super-admin' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware };
