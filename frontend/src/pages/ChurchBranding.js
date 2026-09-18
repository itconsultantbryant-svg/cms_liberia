import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './ChurchBranding.css';

const DEFAULTS = {
  name: '',
  shortName: '',
  websiteUrl: '',
  primaryColor: '#2c3e50',
  secondaryColor: '#3498db',
  timezone: 'Africa/Monrovia',
  email: '',
  phone: ''
};

const ChurchBranding = () => {
  const { user, fetchUser, applyChurchBranding } = useAuth();
  const [form, setForm] = useState(DEFAULTS);
  const [logoUrl, setLogoUrl] = useState(null);
  const [faviconUrl, setFaviconUrl] = useState(null);
  const [loginBackgroundUrl, setLoginBackgroundUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get('/api/church/branding');
        if (cancelled) return;
        const b = data.branding || {};
        setForm({
          name: b.name || '',
          shortName: b.shortName || '',
          websiteUrl: b.websiteUrl || '',
          primaryColor: b.primaryColor || '#2c3e50',
          secondaryColor: b.secondaryColor || '#3498db',
          timezone: b.timezone || 'Africa/Monrovia',
          email: b.email || '',
          phone: b.phone || ''
        });
        setLogoUrl(b.logoUrl || null);
        setFaviconUrl(b.faviconUrl || b.faviconUrlResolved || null);
        setLoginBackgroundUrl(b.loginBackgroundUrl || null);
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to load branding');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onChange = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const afterBranding = async (branding) => {
    if (branding) applyChurchBranding(branding);
    if (fetchUser) await fetchUser();
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await axios.patch('/api/church/branding', form);
      setMessage(data.message || 'Saved');
      if (data.branding) {
        setLogoUrl(data.branding.logoUrl || logoUrl);
        setFaviconUrl(data.branding.faviconUrl || faviconUrl);
      }
      await afterBranding(data.branding);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (kind, file) => {
    if (!file) return;
    setError('');
    setMessage('');
    const body = new FormData();
    body.append('file', file);
    try {
      const { data } = await axios.post(`/api/church/branding/${kind}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMessage(data.message || 'Uploaded');
      if (kind === 'logo') setLogoUrl(data.url);
      else if (kind === 'favicon') setFaviconUrl(data.url);
      else if (kind === 'login-background') setLoginBackgroundUrl(data.url);
      await afterBranding(data.branding);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed');
    }
  };

  if (loading) {
    return (
      <div className="branding-page">
        <p>Loading branding…</p>
      </div>
    );
  }

  return (
    <div className="branding-page">
      <h1>Church Branding</h1>
      <p className="branding-sub">
        Customize how {user?.church?.name || 'your church'} appears in the portal (logo, colors, name).
      </p>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="branding-preview card">
        <div className="branding-preview-bar" style={{ background: form.primaryColor }}>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="branding-preview-logo" loading="lazy" decoding="async" />
          ) : (
            <span className="branding-preview-fallback">
              {(form.shortName || form.name || 'C').charAt(0)}
            </span>
          )}
          <span>{form.shortName || form.name || 'Church'}</span>
        </div>
        <button
          type="button"
          className="btn"
          style={{ background: form.secondaryColor, color: '#fff', marginTop: 12 }}
        >
          Accent button
        </button>
      </div>

      <form className="branding-form card" onSubmit={save}>
        <div className="form-row">
          <div className="form-group">
            <label>Church name</label>
            <input value={form.name} onChange={onChange('name')} required />
          </div>
          <div className="form-group">
            <label>Short name</label>
            <input value={form.shortName} onChange={onChange('shortName')} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Primary color</label>
            <div className="color-row">
              <input type="color" value={form.primaryColor} onChange={onChange('primaryColor')} />
              <input value={form.primaryColor} onChange={onChange('primaryColor')} />
            </div>
          </div>
          <div className="form-group">
            <label>Secondary color</label>
            <div className="color-row">
              <input type="color" value={form.secondaryColor} onChange={onChange('secondaryColor')} />
              <input value={form.secondaryColor} onChange={onChange('secondaryColor')} />
            </div>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Website</label>
            <input value={form.websiteUrl} onChange={onChange('websiteUrl')} placeholder="https://" />
          </div>
          <div className="form-group">
            <label>Timezone</label>
            <input value={form.timezone} onChange={onChange('timezone')} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={onChange('email')} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={form.phone} onChange={onChange('phone')} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save branding'}
        </button>
      </form>

      <div className="branding-uploads card">
        <h3>Logo, favicon & login background</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Logo image (sidebar & dashboards)</label>
            {logoUrl && <img src={logoUrl} alt="Logo" className="branding-thumb" loading="lazy" decoding="async" />}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => upload('logo', e.target.files?.[0])}
            />
          </div>
          <div className="form-group">
            <label>Favicon</label>
            {faviconUrl && <img src={faviconUrl} alt="Favicon" className="branding-thumb small" loading="lazy" decoding="async" />}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => upload('favicon', e.target.files?.[0])}
            />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label>Login page background</label>
          {loginBackgroundUrl && (
            <img
              src={loginBackgroundUrl}
              alt="Login background"
              className="branding-thumb"
              style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'cover' }}
              loading="lazy"
              decoding="async"
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => upload('login-background', e.target.files?.[0])}
          />
          <p className="muted" style={{ fontSize: 13 }}>
            Shown behind the login form on your church portal URL.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChurchBranding;
