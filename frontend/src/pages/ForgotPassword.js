import React from 'react';
import { Link, useParams } from 'react-router-dom';
import './Auth.css';

/**
 * Password reset is admin-mediated — users contact their church administrator.
 */
const ForgotPassword = () => {
  const { slug } = useParams();
  const loginPath = slug ? `/t/${slug}/login` : '/login';

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Forgot Password</h2>
        <p className="auth-church-name" style={{ textAlign: 'left', marginBottom: 16 }}>
          For security, password resets are handled by your church administrator.
        </p>
        <div className="info-message" style={{ textAlign: 'left' }}>
          <strong>Please contact your church admin</strong> and ask them to reset your account
          access. Provide the email address you use to sign in so they can verify your identity.
        </div>
        <p className="muted" style={{ textAlign: 'left', fontSize: 14, marginTop: 16 }}>
          Admins can reset access from <em>User Management</em> in the church portal.
        </p>
        <p className="auth-link">
          <Link to={loginPath}>Back to login</Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
