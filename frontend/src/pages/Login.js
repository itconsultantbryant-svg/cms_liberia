import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [portal, setPortal] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const host = window.location.hostname;
        const { data } = await axios.get('/api/tenant/resolve', {
          params: { host },
          validateStatus: () => true
        });
        if (cancelled) return;
        if (data?.resolved && data.church) {
          setPortal(data.church);
          if (data.church.primaryColor) {
            document.documentElement.style.setProperty('--church-primary', data.church.primaryColor);
          }
        } else if (data?.reason === 'platform_root') {
          setPortal(null);
        }
      } catch (_) {
        /* hub login without tenant branding */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || err.response?.data?.error || 'Login failed');
      console.error('Login error details:', err);
    } finally {
      setLoading(false);
    }
  };

  const title = portal?.shortName || portal?.name || 'Login';

  return (
    <div className="auth-container">
      <div className="auth-card">
        {portal?.logoUrl && (
          <img
            src={portal.logoUrl}
            alt={portal.name || 'Church'}
            style={{ maxHeight: 56, marginBottom: 12, objectFit: 'contain' }}
            loading="lazy"
            decoding="async"
          />
        )}
        <h2>{title}</h2>
        {portal?.name && title !== portal.name && (
          <p style={{ marginTop: -8, color: '#666', fontSize: 14 }}>{portal.name}</p>
        )}
        {error && <div className="error-message">{error}</div>}
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
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={portal?.primaryColor ? { background: portal.primaryColor } : undefined}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p className="auth-link">
          <a href="/forgot-password">Forgot password?</a>
        </p>
        {!portal && (
          <p className="auth-link">
            Don't have an account? <a href="/register">Register</a>
          </p>
        )}
      </div>
    </div>
  );
};

export default Login;
