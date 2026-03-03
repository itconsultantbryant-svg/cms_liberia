import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Component to check if user has required role/permission
const RoleBasedRoute = ({ children, requiredRoles = [], requiredAction = null }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  // Check if user has required role
  if (requiredRoles.length > 0) {
    const userRoleCode = user?.primaryRole?.role_code;
    const hasRole = requiredRoles.includes(userRoleCode) || user.isadmin;
    
    if (!hasRole) {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Access Denied</h2>
          <p>You do not have permission to access this page.</p>
          <p>Required role: {requiredRoles.join(' or ')}</p>
          <p>Your role: {userRoleCode || 'None'}</p>
        </div>
      );
    }
  }

  return children;
};

export default RoleBasedRoute;

