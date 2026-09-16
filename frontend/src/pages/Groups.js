import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const EMPTY_FORM = {
  name: '',
  category: 'custom',
  description: '',
  meetingDay: '',
  meetingTime: '',
  meetingLocation: ''
};

const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterCategory, setFilterCategory] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const q = filterCategory ? `?category=${encodeURIComponent(filterCategory)}` : '';
      const [list, meta, tmpl] = await Promise.all([
        axios.get(`/api/groups${q}`),
        axios.get('/api/groups/meta'),
        axios.get('/api/groups/templates')
      ]);
      setGroups(list.data.ministries || list.data.groups || []);
      setCategories(meta.data.categories || []);
      setTemplates(tmpl.data.templates || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [filterCategory]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('/api/groups', form);
      setMessage('Ministry created');
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Create failed');
    }
  };

  const seedDefaults = async () => {
    setError('');
    try {
      const res = await axios.post('/api/groups/seed-defaults');
      setMessage(`Seeded ${res.data.seeded} default ministries`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Seed failed');
    }
  };

  const deactivate = async (id) => {
    if (!window.confirm('Deactivate this ministry?')) return;
    try {
      await axios.delete(`/api/groups/${id}`);
      setMessage('Ministry deactivated');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Deactivate failed');
    }
  };

  const applyTemplate = (code) => {
    const t = templates.find((x) => x.code === code);
    if (!t) return;
    setForm({
      ...form,
      name: t.name,
      category: t.category,
      description: t.description || ''
    });
  };

  if (loading) return <div className="members-page">Loading ministries…</div>;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Ministries & Groups</h1>
          <p className="members-sub">Choir, youth, departments — leaders, members, meetings</p>
        </div>
        <div className="members-actions">
          <button type="button" className="btn btn-secondary" onClick={seedDefaults}>
            Seed defaults
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <form className="card" onSubmit={create}>
        <h2>New ministry</h2>
        <div className="member-form-grid">
          <div className="form-group">
            <label>From template</label>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) applyTemplate(e.target.value);
              }}
            >
              <option value="">Custom…</option>
              {templates.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Meeting day</label>
            <input
              placeholder="e.g. Thursday"
              value={form.meetingDay}
              onChange={(e) => setForm({ ...form, meetingDay: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Meeting time</label>
            <input
              placeholder="e.g. 18:00"
              value={form.meetingTime}
              onChange={(e) => setForm({ ...form, meetingTime: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Location</label>
            <input
              value={form.meetingLocation}
              onChange={(e) => setForm({ ...form, meetingLocation: e.target.value })}
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
          Create ministry
        </button>
      </form>

      <div className="members-filters">
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <h2>Active ministries</h2>
        {groups.length === 0 ? (
          <p className="muted">No ministries yet. Seed defaults or create one above.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Leader</th>
                <th>Members</th>
                <th>Meeting</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link to={`/groups/${g.id}`}>{g.name}</Link>
                  </td>
                  <td>{g.category || 'custom'}</td>
                  <td>
                    {g.leader_firstname
                      ? `${g.leader_firstname} ${g.leader_lastname || ''}`
                      : '—'}
                  </td>
                  <td>{g.member_count || 0}</td>
                  <td>
                    {[g.meeting_day, g.meeting_time].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td>
                    <Link className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 13 }} to={`/groups/${g.id}`}>
                      Open
                    </Link>{' '}
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '4px 8px', fontSize: 13 }}
                      onClick={() => deactivate(g.id)}
                    >
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Groups;
