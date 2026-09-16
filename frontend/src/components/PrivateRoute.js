import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Auth gate + optional permission / role checks (Phase 42).
 * Unauthorized → Access Denied (not a soft blank page).
 */
const PrivateRoute = ({ children, permission = null, requiredRoles = [] }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading…</div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const roleCode = user?.primaryRole?.role_code;
  const keys = [
    ...(Array.isArray(user.permissionKeys) ? user.permissionKeys : []),
    ...(Array.isArray(user.permissions) ? user.permissions : [])
  ];

  const roleOk =
    !requiredRoles.length ||
    user.isadmin ||
    user.isSuperadmin ||
    (roleCode && requiredRoles.includes(roleCode));

  const needed = Array.isArray(permission) ? permission : permission ? [permission] : [];
  const permOk =
    !needed.length ||
    user.isadmin ||
    user.isSuperadmin ||
    needed.some((p) => keys.includes(p));

  if (!roleOk || !permOk) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: '2rem auto', padding: '1.5rem', textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Access denied</h2>
        <p style={{ color: '#555' }}>
          You do not have permission to open this page.
          {needed.length ? (
            <>
              {' '}
              Required permission: <code>{needed.join(' or ')}</code>.
            </>
          ) : null}
          {requiredRoles.length ? (
            <>
              {' '}
              Required role: {requiredRoles.join(' or ')}.
            </>
          ) : null}
        </p>
        <p style={{ color: '#888', fontSize: 14 }}>
          Your role: {roleCode || (user.isadmin ? 'Church Admin' : 'None')}
        </p>
        <Link to="/" className="btn btn-primary">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return children;
};

export default PrivateRoute;
