import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './ChurchBranding.css';

const emptyForm = {
  branchname: '',
  branchcode: '',
  phone: '',
  pastorName: '',
  city: '',
  state: '',
  country: '',
  address: '',
  description: '',
  status: 'active',
  isHeadquarters: false,
  enableLogin: false,
  email: '',
  password: ''
};

const BranchesManagement = () => {
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setError('');
    try {
      const { data } = await axios.get('/api/branches');
      setBranches(data.branches || data || []);
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
      await axios.post('/api/branches', form);
      setMessage('Branch created');
      setForm(emptyForm);
      setCreating(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const setHq = async (id) => {
    setMessage('');
    setError('');
    try {
      await axios.post(`/api/branches/${id}/headquarters`);
      setMessage('Headquarters updated');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const setStatus = async (id, status) => {
    try {
      await axios.patch(`/api/branches/${id}`, { status });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="branding-page" style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1>Branches</h1>
          <p className="branding-sub">Manage campuses under your church. Switch context from the top bar.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(!creating)}>
          {creating ? 'Cancel' : 'Add branch'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      {creating && (
        <form className="branding-form card" onSubmit={create}>
          <h3>New branch / campus</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Name</label>
              <input
                value={form.branchname}
                onChange={(e) => setForm({ ...form, branchname: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Code</label>
              <input
                value={form.branchcode}
                onChange={(e) => setForm({ ...form, branchcode: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Pastor / leader</label>
              <input
                value={form.pastorName}
                onChange={(e) => setForm({ ...form, pastorName: e.target.value })}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-group">
              <label>City</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="form-group">
              <label>State / county</label>
              <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Country</label>
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={form.isHeadquarters}
              onChange={(e) => setForm({ ...form, isHeadquarters: e.target.checked })}
            />
            Set as Headquarters / Main Branch
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={form.enableLogin}
              onChange={(e) => setForm({ ...form, enableLogin: e.target.checked })}
            />
            Enable branch login account
          </label>
          {form.enableLogin && (
            <div className="form-row">
              <div className="form-group">
                <label>Login email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required={form.enableLogin}
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={8}
                  required={form.enableLogin}
                />
              </div>
            </div>
          )}
          <button type="submit" className="btn btn-primary">Create branch</button>
        </form>
      )}

      <div className="branding-form card">
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table className="superadmin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Pastor</th>
                <th>Location</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td>
                    {b.branchname}
                    {b.is_headquarters ? ' ★ HQ' : ''}
                  </td>
                  <td>{b.branchcode || '—'}</td>
                  <td>{b.pastor_name || '—'}</td>
                  <td>{[b.city, b.country].filter(Boolean).join(', ') || '—'}</td>
                  <td>{b.status || 'active'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!b.is_headquarters && (
                      <button type="button" className="btn-link" onClick={() => setHq(b.id)}>
                        Make HQ
                      </button>
                    )}{' '}
                    {b.status !== 'inactive' && (
                      <button type="button" className="btn-link" onClick={() => setStatus(b.id, 'inactive')}>
                        Deactivate
                      </button>
                    )}
                    {b.status === 'inactive' && (
                      <button type="button" className="btn-link" onClick={() => setStatus(b.id, 'active')}>
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!branches.length && (
                <tr>
                  <td colSpan={6}>No branches</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default BranchesManagement;
