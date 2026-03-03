const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    console.log('[Auth Middleware] No token provided');
    return res.status(401).json({ error: 'No token, authorization denied' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    console.log('[Auth Middleware] Token verified for user:', decoded.id, 'Type:', decoded.userType);
    next();
  } catch (error) {
    console.error('[Auth Middleware] Token verification failed:', error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
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

