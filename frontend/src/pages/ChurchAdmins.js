import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './ChurchBranding.css';

const ChurchAdmins = () => {
  const [admins, setAdmins] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', branchcode: 'ADM' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setError('');
    try {
      const { data } = await axios.get('/api/church/admins');
      setAdmins(data.admins || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await axios.post('/api/church/admins', form);
      setMessage('Church Admin created');
      setForm({ name: '', email: '', password: '', branchcode: 'ADM' });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const revoke = async (id) => {
    setMessage('');
    setError('');
    try {
      await axios.patch(`/api/church/admins/${id}`, { isAdmin: false });
      setMessage('Admin access revoked');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="branding-page">
      <h1>Church Administrators</h1>
      <p className="branding-sub">
        Your church can have multiple administrators. Each manages only this church&apos;s data.
      </p>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="branding-form card">
        <h3>Current admins</h3>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <ul className="cao-list" style={{ paddingLeft: 18 }}>
            {admins.map((a) => (
              <li key={a.id} style={{ marginBottom: 10 }}>
                <strong>{a.branchname}</strong> — {a.email}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginLeft: 12 }}
                  onClick={() => revoke(a.id)}
                >
                  Revoke
                </button>
              </li>
            ))}
            {!admins.length && <li>No administrators found</li>}
          </ul>
        )}
      </div>

      <form className="branding-form card" onSubmit={create}>
        <h3>Add Church Admin</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Display name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Temporary password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
            />
          </div>
          <div className="form-group">
            <label>Branch code</label>
            <input
              value={form.branchcode}
              onChange={(e) => setForm({ ...form, branchcode: e.target.value })}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary">Create admin</button>
      </form>
    </div>
  );
};

export default ChurchAdmins;
