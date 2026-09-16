import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const EMPTY = {
  name: '',
  category: 'office',
  description: '',
  purchaseValue: '',
  purchaseDate: '',
  location: '',
  custodianName: '',
  conditionStatus: 'good',
  serialNumber: ''
};

const Assets = () => {
  const [assets, setAssets] = useState([]);
  const [totals, setTotals] = useState({ count: 0, total_value: 0 });
  const [meta, setMeta] = useState({ categories: [], conditions: [], statuses: [] });
  const [form, setForm] = useState(EMPTY);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ allBranches: '1' });
      if (filterCategory) params.set('category', filterCategory);
      if (filterStatus) params.set('status', filterStatus);
      if (q) params.set('q', q);
      const [list, m] = await Promise.all([
        axios.get(`/api/assets?${params.toString()}`),
        axios.get('/api/assets/meta')
      ]);
      setAssets(list.data.assets || []);
      setTotals(list.data.totals || { count: 0, total_value: 0 });
      setMeta(m.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, [filterCategory, filterStatus, q]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('/api/assets', {
        ...form,
        purchaseValue: form.purchaseValue ? Number(form.purchaseValue) : undefined
      });
      setMessage('Asset registered');
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Create failed');
    }
  };

  const dispose = async (id) => {
    if (!window.confirm('Mark this asset as disposed?')) return;
    try {
      await axios.delete(`/api/assets/${id}`);
      setMessage('Asset disposed');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Dispose failed');
    }
  };

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Assets & Inventory</h1>
          <p className="members-sub">
            {totals.count || 0} active · value{' '}
            {Number(totals.total_value || 0).toLocaleString(undefined, {
              style: 'currency',
              currency: 'USD'
            })}
          </p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <form className="card" onSubmit={create}>
        <h2>Register asset</h2>
        <div className="member-form-grid">
          <div className="form-group">
            <label>Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {(meta.categories || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Purchase value</label>
            <input
              type="number"
              step="0.01"
              value={form.purchaseValue}
              onChange={(e) => setForm({ ...form, purchaseValue: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Purchase date</label>
            <input
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Custodian</label>
            <input
              value={form.custodianName}
              onChange={(e) => setForm({ ...form, custodianName: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Condition</label>
            <select
              value={form.conditionStatus}
              onChange={(e) => setForm({ ...form, conditionStatus: e.target.value })}
            >
              {(meta.conditions || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Serial #</label>
            <input
              value={form.serialNumber}
              onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
            />
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Register
        </button>
      </form>

      <div className="members-filters">
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {(meta.categories || []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Active (excl. disposed)</option>
          {(meta.statuses || []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card">
        <h2>Inventory</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Category</th>
              <th>Location</th>
              <th>Custodian</th>
              <th>Condition</th>
              <th>Status</th>
              <th>Value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id}>
                <td>{a.asset_code}</td>
                <td>
                  <Link to={`/assets/${a.id}`}>{a.name}</Link>
                </td>
                <td>{a.category}</td>
                <td>{a.location || '—'}</td>
                <td>{a.custodian_name || '—'}</td>
                <td>{a.condition_status}</td>
                <td>{a.status}</td>
                <td>
                  {a.purchase_value != null
                    ? Number(a.purchase_value).toLocaleString(undefined, {
                        style: 'currency',
                        currency: 'USD'
                      })
                    : '—'}
                </td>
                <td>
                  <Link
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: 13 }}
                    to={`/assets/${a.id}`}
                  >
                    Open
                  </Link>{' '}
                  {a.status !== 'disposed' && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '4px 8px', fontSize: 13 }}
                      onClick={() => dispose(a.id)}
                    >
                      Dispose
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Assets;
