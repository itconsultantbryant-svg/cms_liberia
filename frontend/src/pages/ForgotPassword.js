import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Auth.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [debugToken, setDebugToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setDebugToken('');
    setLoading(true);
    try {
      const { data } = await axios.post('/api/auth/forgot-password', { email });
      setMessage(data.message || 'If an account exists, reset instructions were issued.');
      if (data.resetToken) {
        setDebugToken(data.resetToken);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Forgot Password</h2>
        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
        {debugToken && (
          <p className="auth-link" style={{ wordBreak: 'break-all', fontSize: 13 }}>
            Dev reset link:{' '}
            <Link to={`/reset-password?token=${encodeURIComponent(debugToken)}`}>
              Reset password
            </Link>
          </p>
        )}
        <p className="auth-link">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
