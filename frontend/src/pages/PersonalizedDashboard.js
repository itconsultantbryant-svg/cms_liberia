import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Dashboards.css';
import './PersonalizedDashboard.css';

const PersonalizedDashboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [customizing, setCustomizing] = useState(false);
  const [hidden, setHidden] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data: res } = await axios.get('/api/dashboard/personalized');
      setData(res);
      setHidden(res.prefs?.hiddenWidgets || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const money = (n) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: data?.currency || user?.church?.currency || 'USD'
    }).format(n || 0);

  const savePrefs = async () => {
    setSaving(true);
    try {
      await axios.patch('/api/dashboard/preferences', {
        hiddenWidgets: hidden,
        widgetOrder: (data?.allWidgets || []).map((w) => w.id),
        persona: data?.persona?.id
      });
      setCustomizing(false);
      setLoading(true);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const toggleHidden = (id) => {
    setHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (loading) {
    return (
      <div className="pd-page">
        <p>Loading your dashboard…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="pd-page">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  const persona = data.persona || {};
  const scopeLabel =
    data.scopeMeta?.scope === 'branch'
      ? data.scopeMeta.branchName
        ? `Branch: ${data.scopeMeta.branchName}`
        : 'Branch-scoped'
      : data.scopeMeta?.scope === 'platform'
        ? 'Platform-wide'
        : 'Church-wide';

  return (
    <div className="pd-page">
      <header className="pd-header">
        <div>
          <p className="pd-persona-badge">{persona.id?.replace(/_/g, ' ')}</p>
          <h1>{persona.title || 'Dashboard'}</h1>
          <p className="pd-sub">
            {persona.description} · {scopeLabel}
            {user?.primaryRole?.role_name ? ` · ${user.primaryRole.role_name}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setCustomizing((v) => !v)}
        >
          {customizing ? 'Cancel' : 'Customize'}
        </button>
      </header>

      {error && <div className="error-message" style={{ marginBottom: 12 }}>{error}</div>}

      {customizing && (
        <section className="pd-customize card">
          <h3>Visible widgets</h3>
          <p className="pd-sub">Hide widgets you do not need. Defaults stay role-based.</p>
          <div className="pd-customize-grid">
            {(data.allWidgets || []).map((w) => (
              <label key={w.id} className="pd-customize-item">
                <input
                  type="checkbox"
                  checked={!hidden.includes(w.id)}
                  onChange={() => toggleHidden(w.id)}
                />
                <span>
                  {w.icon} {w.label}
                </span>
              </label>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={savePrefs} disabled={saving}>
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
        </section>
      )}

      <div className="pd-grid">
        {(data.widgets || []).map((w) => (
          <Link key={w.id} to={w.to || '/'} className="pd-tile">
            <span className="pd-icon">{w.icon}</span>
            <span className="pd-label">{w.label}</span>
            <strong className="pd-value">
              {w.money ? money(w.value) : w.value}
            </strong>
          </Link>
        ))}
      </div>

      {data.quickLinks?.length > 0 && (
        <section className="pd-links">
          <h3>Quick links</h3>
          <div className="pd-link-row">
            {data.quickLinks.map((l) => (
              <Link key={l.to + l.label} to={l.to} className="btn btn-secondary">
                {l.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default PersonalizedDashboard;
