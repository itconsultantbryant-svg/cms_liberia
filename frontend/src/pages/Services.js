import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Members.css';

const Services = () => {
  const [services, setServices] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', category: 'custom', description: '' });
  const [qrInfo, setQrInfo] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, t, m] = await Promise.all([
        axios.get('/api/services', { params: { active: '0' } }),
        axios.get('/api/services/templates'),
        axios.get('/api/services/meta')
      ]);
      setServices(s.data.services || []);
      setTemplates(t.data.templates || []);
      setCategories(m.data.categories || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/services', form);
      setMessage('Service created');
      setForm({ name: '', category: 'custom', description: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Create failed');
    }
  };

  const seed = async () => {
    try {
      const res = await axios.post('/api/services/seed-defaults');
      setMessage(`Seeded ${res.data.seeded} services`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Seed failed');
    }
  };

  const toggle = async (svc) => {
    try {
      await axios.patch(`/api/services/${svc.id}`, { isActive: !svc.is_active });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    }
  };

  const showQr = async (svc) => {
    try {
      const res = await axios.get(`/api/services/${svc.id}/qr-payload`);
      setQrInfo({ service: svc, ...res.data });
    } catch (err) {
      setError(err.response?.data?.error || 'QR failed');
    }
  };

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Services</h1>
          <p className="members-sub">Sunday worship, midweek, prayer, youth, special &amp; custom</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={seed}>
          Seed defaults
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <form className="card" onSubmit={create}>
        <h2>Add service</h2>
        <div className="member-form-grid">
          <div className="form-group">
            <label>Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} list="svc-templates" />
            <datalist id="svc-templates">
              {templates.map((t) => (
                <option key={t.code} value={t.name} />
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group full">
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>
          Create
        </button>
      </form>

      <div className="card members-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Active</th>
              <th>QR</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!services.length && (
              <tr>
                <td colSpan={5}>No services — click Seed defaults</td>
              </tr>
            )}
            {services.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.name}
                  {s.description ? <div style={{ fontSize: 12, color: '#888' }}>{s.description}</div> : null}
                </td>
                <td>{s.category || 'custom'}</td>
                <td>{s.is_active === 0 ? 'No' : 'Yes'}</td>
                <td>{s.qr_enabled === 0 ? 'Off' : 'On'}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 13 }} onClick={() => toggle(s)}>
                    {s.is_active === 0 ? 'Activate' : 'Deactivate'}
                  </button>
                  {s.is_active !== 0 && (
                    <button type="button" className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 13 }} onClick={() => showQr(s)}>
                      QR payload
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {qrInfo && (
        <div className="card">
          <h2>QR check-in ready — {qrInfo.service.name}</h2>
          <p className="members-sub">Encode this token in a QR code for door check-in scanners.</p>
          <code style={{ wordBreak: 'break-all', display: 'block', padding: 12, background: '#f8fafc' }}>
            {qrInfo.token}
          </code>
          <pre style={{ fontSize: 12, overflow: 'auto' }}>{JSON.stringify(qrInfo.payload, null, 2)}</pre>
          <button type="button" className="btn btn-secondary" onClick={() => setQrInfo(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default Services;
