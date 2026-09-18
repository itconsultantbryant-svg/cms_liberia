import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
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
  const { slug: routeSlug } = useParams();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const host = window.location.hostname;
        const params = routeSlug ? { slug: routeSlug } : { host };
        const { data } = await axios.get('/api/tenant/resolve', {
          params,
          validateStatus: () => true
        });
        if (cancelled) return;
        if (data?.resolved && data.church) {
          setPortal(data.church);
          if (data.church.primaryColor) {
            document.documentElement.style.setProperty('--church-primary', data.church.primaryColor);
          }
          if (data.church.secondaryColor) {
            document.documentElement.style.setProperty('--church-secondary', data.church.secondaryColor);
          }
          if (data.church.faviconUrl) {
            let link = document.querySelector("link[rel='icon']");
            if (!link) {
              link = document.createElement('link');
              link.rel = 'icon';
              document.head.appendChild(link);
            }
            link.href = data.church.faviconUrl;
          }
          if (data.church.name) {
            document.title = `${data.church.shortName || data.church.name} · Login`;
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
  }, [routeSlug]);

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
  const bg = portal?.loginBackgroundUrl;
  const primary = portal?.primaryColor || '#2c3e50';
  const secondary = portal?.secondaryColor || '#3498db';
  const containerStyle = bg
    ? {
        backgroundImage: `linear-gradient(135deg, rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(${bg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }
    : portal
      ? {
          background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`
        }
      : undefined;

  return (
    <div className={`auth-container${portal ? ' auth-container--tenant' : ''}`} style={containerStyle}>
      <div className="auth-card">
        {portal?.logoUrl && (
          <img
            className="auth-logo"
            src={portal.logoUrl}
            alt={portal.name || 'Church'}
            loading="lazy"
            decoding="async"
          />
        )}
        <h2>{title}</h2>
        {portal?.name && title !== portal.name && (
          <p className="auth-church-name">{portal.name}</p>
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
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
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
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        {!portal && (
          <p className="auth-link">
            Don't have an account? <Link to="/register">Register</Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default Login;
